// Module loading system for Vibe
// Handles loading both TypeScript and Vibe imports with cycle detection

import * as AST from '../ast';
import { parse } from '../parser/parse';
import type { RuntimeState, TsModule, VibeModule, ExportedItem, Variable } from './types';
import { resolve, dirname, join } from 'path';

// Map system module names to their implementation files
const SYSTEM_MODULES: Record<string, string> = {
  'system': join(__dirname, 'stdlib', 'index.ts'),
  'system/tools': join(__dirname, 'stdlib', 'tools', 'index.ts'),
};

// Check if an import source is a system module
function isSystemModule(source: string): boolean {
  return source === 'system' || source.startsWith('system/');
}

// Resolve a module path, handling system modules specially
function resolveModulePath(source: string, basePath: string): string {
  if (isSystemModule(source)) {
    const systemPath = SYSTEM_MODULES[source];
    if (!systemPath) {
      throw new Error(`Unknown system module: '${source}'`);
    }
    return systemPath;
  }
  return resolve(dirname(basePath), source);
}

// Track modules currently being loaded (for cycle detection)
type LoadingSet = Set<string>;

// Load all imports from a program and return updated state
export async function loadImports(
  state: RuntimeState,
  basePath: string
): Promise<RuntimeState> {
  // Start with empty loading set for cycle detection
  return loadImportsRecursive(state, basePath, new Set());
}

// Internal recursive loader with cycle detection
async function loadImportsRecursive(
  state: RuntimeState,
  basePath: string,
  loading: LoadingSet
): Promise<RuntimeState> {
  const imports = state.program.body.filter(
    (stmt): stmt is AST.ImportDeclaration => stmt.type === 'ImportDeclaration'
  );

  let newState = state;

  for (const importDecl of imports) {
    if (importDecl.sourceType === 'ts') {
      newState = await loadTsModule(newState, importDecl, basePath);
    } else {
      newState = await loadVibeModuleRecursive(newState, importDecl, basePath, loading);
    }
  }

  return newState;
}

// Load a TypeScript module using Bun's import()
async function loadTsModule(
  state: RuntimeState,
  importDecl: AST.ImportDeclaration,
  basePath: string
): Promise<RuntimeState> {
  const modulePath = resolveModulePath(importDecl.source, basePath);

  // Check if already loaded
  if (state.tsModules[modulePath]) {
    // Register the imported names (allows shared imports across modules)
    return registerImportedNames(state, importDecl, modulePath, 'ts');
  }

  // Load the module using Bun's import()
  const module = await import(modulePath);

  // Extract the requested exports
  const exports: Record<string, unknown> = {};
  for (const spec of importDecl.specifiers) {
    if (!(spec.imported in module)) {
      throw new Error(
        `Import error: '${spec.imported}' is not exported from '${importDecl.source}'`
      );
    }
    exports[spec.local] = module[spec.imported];
  }

  const tsModule: TsModule = { exports };

  const newState: RuntimeState = {
    ...state,
    tsModules: {
      ...state.tsModules,
      [modulePath]: tsModule,
    },
  };

  // Register the imported names
  return registerImportedNames(newState, importDecl, modulePath, 'ts');
}

// Load a Vibe module with recursive import loading and cycle detection
async function loadVibeModuleRecursive(
  state: RuntimeState,
  importDecl: AST.ImportDeclaration,
  basePath: string,
  loading: LoadingSet
): Promise<RuntimeState> {
  const modulePath = resolve(dirname(basePath), importDecl.source);

  // Check for import cycle FIRST (before checking if loaded)
  // This catches cycles even if the module was partially loaded
  if (loading.has(modulePath)) {
    // Build cycle path for error message
    const cyclePath = [...loading, modulePath].join(' -> ');
    throw new Error(
      `Import error: Circular dependency detected: ${cyclePath}`
    );
  }

  // Check if already loaded
  if (state.vibeModules[modulePath]) {
    // Register the imported names (allows shared imports across modules)
    return registerImportedNames(state, importDecl, modulePath, 'vibe');
  }

  // Mark this module as being loaded
  const newLoading = new Set(loading);
  newLoading.add(modulePath);

  // Read and parse the .vibe file
  const source = await Bun.file(modulePath).text();
  // Use import source path for error messages (relative path as written in import)
  const program = parse(source, { file: importDecl.source });

  // Extract exports from the program
  const exports = extractVibeExports(program);

  // Verify all requested imports exist
  for (const spec of importDecl.specifiers) {
    if (!(spec.imported in exports)) {
      throw new Error(
        `Import error: '${spec.imported}' is not exported from '${importDecl.source}'`
      );
    }
  }

  // Extract all module-level variables (for module scope isolation)
  const globals = extractModuleGlobals(program);

  const vibeModule: VibeModule = { exports, program, globals };

  let newState: RuntimeState = {
    ...state,
    vibeModules: {
      ...state.vibeModules,
      [modulePath]: vibeModule,
    },
  };

  // Recursively load this module's imports (these are NOT the main program's imports)
  const moduleImports = program.body.filter(
    (stmt): stmt is AST.ImportDeclaration => stmt.type === 'ImportDeclaration'
  );

  for (const nestedImport of moduleImports) {
    if (nestedImport.sourceType === 'ts') {
      newState = await loadTsModule(newState, nestedImport, modulePath);
    } else {
      newState = await loadVibeModuleRecursive(newState, nestedImport, modulePath, newLoading);
    }
  }

  // Register the imported names
  return registerImportedNames(newState, importDecl, modulePath, 'vibe');
}

// Extract exported items from a Vibe program
function extractVibeExports(program: AST.Program): Record<string, ExportedItem> {
  const exports: Record<string, ExportedItem> = {};

  for (const stmt of program.body) {
    if (stmt.type !== 'ExportDeclaration') continue;

    const decl = stmt.declaration;

    switch (decl.type) {
      case 'FunctionDeclaration':
        exports[decl.name] = { kind: 'function', declaration: decl };
        break;

      case 'LetDeclaration':
        exports[decl.name] = {
          kind: 'variable',
          name: decl.name,
          value: null,  // Will be evaluated when module runs
          isConst: false,
          typeAnnotation: decl.typeAnnotation,
        };
        break;

      case 'ConstDeclaration':
        exports[decl.name] = {
          kind: 'variable',
          name: decl.name,
          value: null,  // Will be evaluated when module runs
          isConst: true,
          typeAnnotation: decl.typeAnnotation,
        };
        break;

      case 'ModelDeclaration':
        exports[decl.name] = { kind: 'model', declaration: decl };
        break;
    }
  }

  return exports;
}

// Extract all module-level variables (both exported and non-exported)
// These form the module's isolated global scope
function extractModuleGlobals(program: AST.Program): Record<string, Variable> {
  const globals: Record<string, Variable> = {};

  for (const stmt of program.body) {
    // Handle direct declarations
    if (stmt.type === 'LetDeclaration') {
      globals[stmt.name] = {
        value: evaluateSimpleLiteral(stmt.initializer),
        isConst: false,
        typeAnnotation: stmt.typeAnnotation,
      };
    } else if (stmt.type === 'ConstDeclaration') {
      globals[stmt.name] = {
        value: evaluateSimpleLiteral(stmt.initializer),
        isConst: true,
        typeAnnotation: stmt.typeAnnotation,
      };
    }
    // Handle exported declarations
    else if (stmt.type === 'ExportDeclaration') {
      const decl = stmt.declaration;
      if (decl.type === 'LetDeclaration') {
        globals[decl.name] = {
          value: evaluateSimpleLiteral(decl.initializer),
          isConst: false,
          typeAnnotation: decl.typeAnnotation,
        };
      } else if (decl.type === 'ConstDeclaration') {
        globals[decl.name] = {
          value: evaluateSimpleLiteral(decl.initializer),
          isConst: true,
          typeAnnotation: decl.typeAnnotation,
        };
      }
    }
    // Note: Functions and models are accessed via exports, not globals
  }

  return globals;
}

// Evaluate simple literal expressions for module initialization
// Complex expressions will be null (would need full runtime evaluation)
function evaluateSimpleLiteral(expr: AST.Expression | null): unknown {
  if (!expr) return null;

  switch (expr.type) {
    case 'StringLiteral':
      return expr.value;
    case 'NumberLiteral':
      return expr.value;
    case 'BooleanLiteral':
      return expr.value;
    case 'NullLiteral':
      return null;
    case 'ArrayLiteral':
      return expr.elements.map(e => evaluateSimpleLiteral(e));
    case 'ObjectLiteral':
      const obj: Record<string, unknown> = {};
      for (const prop of expr.properties) {
        obj[prop.key] = evaluateSimpleLiteral(prop.value);
      }
      return obj;
    default:
      // Complex expression - can't evaluate statically
      return null;
  }
}

// Register imported names in the state for lookup
function registerImportedNames(
  state: RuntimeState,
  importDecl: AST.ImportDeclaration,
  modulePath: string,
  sourceType: 'ts' | 'vibe'
): RuntimeState {
  const newImportedNames = { ...state.importedNames };

  for (const spec of importDecl.specifiers) {
    // Check for name collision
    if (newImportedNames[spec.local]) {
      const existing = newImportedNames[spec.local];
      // Allow same import from same source (nested modules can share imports)
      if (existing.source === modulePath && existing.sourceType === sourceType) {
        continue;  // Already registered, skip
      }
      throw new Error(
        `Import error: '${spec.local}' is already imported from '${existing.source}'`
      );
    }

    newImportedNames[spec.local] = {
      source: modulePath,
      sourceType,
    };
  }

  return {
    ...state,
    importedNames: newImportedNames,
  };
}

// Get an imported value by name
export function getImportedValue(
  state: RuntimeState,
  name: string
): unknown | undefined {
  const importInfo = state.importedNames[name];
  if (!importInfo) return undefined;

  if (importInfo.sourceType === 'ts') {
    const module = state.tsModules[importInfo.source];
    return module?.exports[name];
  } else {
    const module = state.vibeModules[importInfo.source];
    const exported = module?.exports[name];
    if (!exported) return undefined;

    if (exported.kind === 'function') {
      // Return a marker that this is an imported Vibe function
      return { __vibeImportedFunction: true, name, source: importInfo.source };
    } else if (exported.kind === 'variable') {
      return exported.value;
    } else if (exported.kind === 'model') {
      // Return the model config as a value
      return { __vibeModel: true, ...exported.declaration.config };
    }
  }

  return undefined;
}

// Check if a name is an imported TypeScript function
export function isImportedTsFunction(
  state: RuntimeState,
  name: string
): boolean {
  const importInfo = state.importedNames[name];
  if (!importInfo || importInfo.sourceType !== 'ts') return false;

  const module = state.tsModules[importInfo.source];
  const value = module?.exports[name];
  return typeof value === 'function';
}

// Check if a name is an imported Vibe function
export function isImportedVibeFunction(
  state: RuntimeState,
  name: string
): boolean {
  const importInfo = state.importedNames[name];
  if (!importInfo || importInfo.sourceType !== 'vibe') return false;

  const module = state.vibeModules[importInfo.source];
  const exported = module?.exports[name];
  return exported?.kind === 'function';
}

// Get an imported Vibe function declaration
export function getImportedVibeFunction(
  state: RuntimeState,
  name: string
): AST.FunctionDeclaration | undefined {
  const importInfo = state.importedNames[name];
  if (!importInfo || importInfo.sourceType !== 'vibe') return undefined;

  const module = state.vibeModules[importInfo.source];
  const exported = module?.exports[name];
  if (exported?.kind !== 'function') return undefined;

  return exported.declaration;
}

// Get an imported TypeScript function
export function getImportedTsFunction(
  state: RuntimeState,
  name: string
): ((...args: unknown[]) => unknown) | undefined {
  const importInfo = state.importedNames[name];
  if (!importInfo || importInfo.sourceType !== 'ts') return undefined;

  const module = state.tsModules[importInfo.source];
  const value = module?.exports[name];
  if (typeof value !== 'function') return undefined;

  return value as (...args: unknown[]) => unknown;
}

// Get the module path for an imported Vibe function
// Returns undefined if not an imported Vibe function
export function getImportedVibeFunctionModulePath(
  state: RuntimeState,
  name: string
): string | undefined {
  const importInfo = state.importedNames[name];
  if (!importInfo || importInfo.sourceType !== 'vibe') return undefined;

  const module = state.vibeModules[importInfo.source];
  const exported = module?.exports[name];
  if (exported?.kind !== 'function') return undefined;

  return importInfo.source;
}

// Get module globals by module path
export function getModuleGlobals(
  state: RuntimeState,
  modulePath: string
): Record<string, Variable> | undefined {
  return state.vibeModules[modulePath]?.globals;
}
