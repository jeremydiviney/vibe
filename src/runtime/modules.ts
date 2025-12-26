// Module loading system for Vibe
// Handles loading both TypeScript and Vibe imports with cycle detection

import * as AST from '../ast';
import { parse } from '../parser/parse';
import type { RuntimeState, TsModule, VibeModule, ExportedItem } from './types';
import { resolve, dirname } from 'path';

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
  const modulePath = resolve(dirname(basePath), importDecl.source);

  // Check if already loaded
  if (state.tsModules[modulePath]) {
    // Just register the imported names
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

  // Check if already loaded
  if (state.vibeModules[modulePath]) {
    // Just register the imported names
    return registerImportedNames(state, importDecl, modulePath, 'vibe');
  }

  // Check for import cycle
  if (loading.has(modulePath)) {
    // Build cycle path for error message
    const cyclePath = [...loading, modulePath].join(' -> ');
    throw new Error(
      `Import error: Circular dependency detected: ${cyclePath}`
    );
  }

  // Mark this module as being loaded
  const newLoading = new Set(loading);
  newLoading.add(modulePath);

  // Read and parse the .vibe file
  const source = await Bun.file(modulePath).text();
  const program = parse(source);

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

  const vibeModule: VibeModule = { exports, program };

  let newState: RuntimeState = {
    ...state,
    vibeModules: {
      ...state.vibeModules,
      [modulePath]: vibeModule,
    },
  };

  // Recursively load this module's imports
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
