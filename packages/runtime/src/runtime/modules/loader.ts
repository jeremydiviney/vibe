// Module loading - async file I/O, parsing, and cycle detection
// Handles loading both TypeScript and Vibe imports

import * as AST from '../../ast';
import { parse } from '../../parser/parse';
import type { RuntimeState, TsModule, VibeModule, ExportedItem, VibeValue } from '../types';
import { createVibeValue } from '../types';
import { resolve, dirname, join } from 'path';

// Map system module names to their implementation files
const SYSTEM_MODULES: Record<string, string> = {
  'system/utils': join(__dirname, '..', 'stdlib', 'utils', 'index.ts'),
  'system/tools': join(__dirname, '..', 'stdlib', 'tools', 'index.ts'),
};

// Blocked system module paths - these cannot be imported
const BLOCKED_SYSTEM_MODULES = new Set([
  'system/core',
  'core',
]);

// Check if an import source is a system module
function isSystemModule(source: string): boolean {
  return source === 'system' || source.startsWith('system/');
}

// Resolve a module path, handling system modules specially
function resolveModulePath(source: string, basePath: string): string {
  if (BLOCKED_SYSTEM_MODULES.has(source)) {
    throw new Error(
      `Import error: '${source}' cannot be imported. Core functions like print() and env() are auto-imported and available without explicit import.`
    );
  }

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

  const module = await import(modulePath);

  const existingModule = state.tsModules[modulePath];
  const exports: Record<string, unknown> = existingModule?.exports
    ? { ...existingModule.exports }
    : {};

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

  if (loading.has(modulePath)) {
    const cyclePath = [...loading, modulePath].join(' -> ');
    throw new Error(
      `Import error: Circular dependency detected: ${cyclePath}`
    );
  }

  if (state.vibeModules[modulePath]) {
    const existingModule = state.vibeModules[modulePath];
    for (const spec of importDecl.specifiers) {
      if (!(spec.imported in existingModule.exports)) {
        throw new Error(
          `Import error: '${spec.imported}' is not exported from '${importDecl.source}'`
        );
      }
    }
    return registerImportedNames(state, importDecl, modulePath, 'vibe');
  }

  const newLoading = new Set(loading);
  newLoading.add(modulePath);

  const source = await Bun.file(modulePath).text();
  const program = parse(source, { file: importDecl.source });

  const exports = extractVibeExports(program);

  for (const spec of importDecl.specifiers) {
    if (!(spec.imported in exports)) {
      throw new Error(
        `Import error: '${spec.imported}' is not exported from '${importDecl.source}'`
      );
    }
  }

  const globals = extractModuleGlobals(program);
  const functions = extractModuleFunctions(program);

  const vibeModule: VibeModule = { exports, program, globals, functions };

  let newState: RuntimeState = {
    ...state,
    vibeModules: {
      ...state.vibeModules,
      [modulePath]: vibeModule,
    },
  };

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
          value: null,
          isConst: false,
          vibeType: decl.vibeType,
        };
        break;

      case 'ConstDeclaration':
        exports[decl.name] = {
          kind: 'variable',
          name: decl.name,
          value: null,
          isConst: true,
          vibeType: decl.vibeType,
        };
        break;

      case 'ModelDeclaration':
        exports[decl.name] = { kind: 'model', declaration: decl };
        break;

      case 'TypeDeclaration':
        exports[decl.name] = { kind: 'type', declaration: decl };
        break;
    }
  }

  return exports;
}

// Extract all functions from a Vibe module (both exported and non-exported)
function extractModuleFunctions(program: AST.Program): Record<string, AST.FunctionDeclaration> {
  const functions: Record<string, AST.FunctionDeclaration> = {};

  for (const stmt of program.body) {
    if (stmt.type === 'FunctionDeclaration') {
      functions[stmt.name] = stmt;
    } else if (stmt.type === 'ExportDeclaration' && stmt.declaration.type === 'FunctionDeclaration') {
      functions[stmt.declaration.name] = stmt.declaration;
    }
  }

  return functions;
}

// Extract all module-level variables (both exported and non-exported)
function extractModuleGlobals(program: AST.Program): Record<string, VibeValue> {
  const globals: Record<string, VibeValue> = {};

  for (const stmt of program.body) {
    if (stmt.type === 'ModelDeclaration') {
      globals[stmt.name] = createVibeValue(
        evaluateModelConfig(stmt.config, globals),
        { isConst: true, vibeType: 'model' }
      );
    } else if (stmt.type === 'ExportDeclaration' && stmt.declaration.type === 'ModelDeclaration') {
      const decl = stmt.declaration;
      globals[decl.name] = createVibeValue(
        evaluateModelConfig(decl.config, globals),
        { isConst: true, vibeType: 'model' }
      );
    } else if (stmt.type === 'LetDeclaration') {
      globals[stmt.name] = createVibeValue(evaluateModuleExpression(stmt.initializer, globals), {
        isConst: false,
        vibeType: stmt.vibeType,
      });
    } else if (stmt.type === 'ConstDeclaration') {
      globals[stmt.name] = createVibeValue(evaluateModuleExpression(stmt.initializer, globals), {
        isConst: true,
        vibeType: stmt.vibeType,
      });
    } else if (stmt.type === 'ExportDeclaration') {
      const decl = stmt.declaration;
      if (decl.type === 'LetDeclaration') {
        globals[decl.name] = createVibeValue(evaluateModuleExpression(decl.initializer, globals), {
          isConst: false,
          vibeType: decl.vibeType,
        });
      } else if (decl.type === 'ConstDeclaration') {
        globals[decl.name] = createVibeValue(evaluateModuleExpression(decl.initializer, globals), {
          isConst: true,
          vibeType: decl.vibeType,
        });
      }
    }
  }

  return globals;
}

// Evaluate module-level expressions during initialization
function evaluateModuleExpression(
  expr: AST.Expression | null,
  context: Record<string, VibeValue>
): unknown {
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
      return expr.elements.map(e => evaluateModuleExpression(e, context));
    case 'ObjectLiteral': {
      const obj: Record<string, unknown> = {};
      for (const prop of expr.properties) {
        obj[prop.key] = evaluateModuleExpression(prop.value, context);
      }
      return obj;
    }
    case 'Identifier': {
      const value = context[expr.name];
      if (value !== undefined) {
        return value.value;
      }
      return null;
    }
    case 'IndexExpression': {
      const obj = evaluateModuleExpression(expr.object, context);
      const index = evaluateModuleExpression(expr.index, context);
      if (Array.isArray(obj) && typeof index === 'number') {
        return obj[index];
      }
      return null;
    }
    case 'MemberExpression': {
      const obj = evaluateModuleExpression(expr.object, context);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return (obj as Record<string, unknown>)[expr.property];
      }
      return null;
    }
    case 'CallExpression': {
      if (expr.callee.type === 'Identifier') {
        const funcName = expr.callee.name;
        if (funcName === 'env' && expr.arguments.length >= 1) {
          const envName = evaluateModuleExpression(expr.arguments[0], context);
          const defaultValue = expr.arguments[1]
            ? evaluateModuleExpression(expr.arguments[1], context)
            : '';
          if (typeof envName === 'string') {
            return process.env[envName] ?? defaultValue;
          }
        }
      }
      return null;
    }
    default:
      return null;
  }
}

// Evaluate a ModelConfig AST into a VibeModelValue
function evaluateModelConfig(
  config: AST.ModelConfig,
  context: Record<string, VibeValue>
): Record<string, unknown> {
  return {
    name: evaluateModuleExpression(config.modelName, context),
    apiKey: evaluateModuleExpression(config.apiKey, context),
    url: evaluateModuleExpression(config.url, context),
    provider: evaluateModuleExpression(config.provider, context),
    maxRetriesOnError: evaluateModuleExpression(config.maxRetriesOnError ?? null, context),
    thinkingLevel: evaluateModuleExpression(config.thinkingLevel ?? null, context),
    tools: evaluateModuleExpression(config.tools ?? null, context),
    usage: [],
  };
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
    if (newImportedNames[spec.local]) {
      const existing = newImportedNames[spec.local];
      if (existing.source === modulePath && existing.sourceType === sourceType) {
        continue;
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

/**
 * Resolve a type definition by name, checking local definitions and imported modules.
 * @param state Runtime state
 * @param typeName Name of the type to resolve
 * @returns The structural type definition, or undefined if not found
 */
export function resolveTypeDefinition(
  state: RuntimeState,
  typeName: string
): AST.StructuralType | undefined {
  // First check local type definitions
  const localType = state.typeDefinitions.get(typeName);
  if (localType) {
    return localType;
  }

  // Check if it's an imported name
  const importInfo = state.importedNames[typeName];
  if (!importInfo || importInfo.sourceType !== 'vibe') {
    return undefined;
  }

  // Look up in the imported vibe module
  const vibeModule = state.vibeModules[importInfo.source];
  if (!vibeModule) {
    return undefined;
  }

  // Get the exported item
  const exportedItem = vibeModule.exports[typeName];
  if (!exportedItem || exportedItem.kind !== 'type') {
    return undefined;
  }

  return exportedItem.declaration.structure;
}
