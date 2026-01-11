// TypeScript execution: interpolation, ts blocks, ts eval

import * as AST from '../../ast';
import type { SourceLocation } from '../../errors';
import type { RuntimeState } from '../types';
import { resolveValue } from '../types';
import { lookupVariable } from './variables';
import { getImportedValue } from '../modules';

/**
 * Deep freeze an object to prevent any mutation.
 * Used to enforce const semantics for objects passed to ts blocks.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Freeze the object itself
  Object.freeze(obj);

  // Recursively freeze all properties
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }

  return obj;
}

/**
 * String interpolation - {varName} syntax.
 * Resolves AIResultObject to its value for string conversion.
 */
export function execInterpolateString(state: RuntimeState, template: string): RuntimeState {
  const result = template.replace(/\{(\w+)\}/g, (_, name) => {
    // Walk scope chain to find variable
    const found = lookupVariable(state, name);
    if (found) {
      // Resolve AIResultObject to primitive value
      const value = resolveValue(found.variable.value);
      return String(value);
    }
    return `{${name}}`;
  });

  return { ...state, lastResult: result };
}

/**
 * Template literal interpolation - ${varName} syntax.
 * Resolves AIResultObject to its value for string conversion.
 */
export function execInterpolateTemplate(state: RuntimeState, template: string): RuntimeState {
  const result = template.replace(/\$\{(\w+)\}/g, (_, name) => {
    // Walk scope chain to find variable
    const found = lookupVariable(state, name);
    if (found) {
      // Resolve AIResultObject to primitive value
      const value = resolveValue(found.variable.value);
      return String(value);
    }
    return `\${${name}}`;
  });

  return { ...state, lastResult: result };
}

/**
 * TypeScript block - push ts_eval instruction.
 */
export function execTsBlock(state: RuntimeState, expr: AST.TsBlock): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'ts_eval', params: expr.params, body: expr.body, location: expr.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * TypeScript eval - pause for async evaluation.
 */
export function execTsEval(state: RuntimeState, params: string[], body: string, location: SourceLocation): RuntimeState {
  // Look up parameter values from scope or imports
  const paramValues = params.map((name) => {
    // First try regular variables
    const found = lookupVariable(state, name);
    if (found) {
      // Resolve AIResultObject to primitive value for ts blocks
      const value = resolveValue(found.variable.value);
      // Freeze const objects to prevent mutation in ts blocks
      if (found.variable.isConst && value !== null && typeof value === 'object') {
        return deepFreeze(value);
      }
      return value;
    }
    // Then try imported values
    const imported = getImportedValue(state, name);
    if (imported !== undefined) {
      return imported;
    }
    throw new Error(`ReferenceError: '${name}' is not defined`);
  });

  return {
    ...state,
    status: 'awaiting_ts',
    pendingTS: {
      params,
      body,
      paramValues,
      location,  // Include source location for error reporting
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ts_eval_request',
        details: { params, body: body.slice(0, 100) },  // Truncate body for log
      },
    ],
  };
}
