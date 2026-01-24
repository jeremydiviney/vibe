// Module query functions - sync, pure lookups on RuntimeState
// No file I/O, no async operations

import * as AST from '../../ast';
import type { RuntimeState, VibeValue } from '../types';

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
      // Return the evaluated model from module globals
      // Models are added to globals during extractModuleGlobals
      const modelValue = module.globals[exported.declaration.name]?.value;
      if (modelValue) {
        return modelValue;
      }
      return undefined;
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
): Record<string, VibeValue> | undefined {
  return state.vibeModules[modulePath]?.globals;
}

// Get module functions by module path
export function getModuleFunctions(
  state: RuntimeState,
  modulePath: string
): Record<string, AST.FunctionDeclaration> | undefined {
  return state.vibeModules[modulePath]?.functions;
}
