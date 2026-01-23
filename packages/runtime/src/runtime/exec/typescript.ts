// TypeScript execution: interpolation, ts blocks, ts eval

import * as AST from '../../ast';
import type { SourceLocation } from '../../errors';
import type { RuntimeState } from '../types';
import { resolveValue, isVibeValue } from '../types';
import { lookupVariable } from './variables';
import { getImportedValue } from '../modules';
import { scheduleAsyncOperation, isInAsyncContext } from '../async/scheduling';

/**
 * Parse a ts block parameter string into binding name and expression.
 * Supports "name = expr" (named) and "name" (shorthand for name = name).
 */
function parseTsParam(param: string): { name: string; expr: string } {
  const eqIndex = param.indexOf('=');
  if (eqIndex !== -1) {
    const name = param.slice(0, eqIndex).trim();
    const expr = param.slice(eqIndex + 1).trim();
    return { name, expr };
  }
  return { name: param, expr: param };
}

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
 * If any interpolated variable is a pending async operation, triggers awaiting_async.
 */
export function execInterpolateString(state: RuntimeState, template: string, location?: SourceLocation): RuntimeState {
  // First pass: check for pending async variables
  const varPattern = /\{(\w+)\}/g;
  const pendingAsyncIds: string[] = [];
  let match;

  while ((match = varPattern.exec(template)) !== null) {
    const name = match[1];
    const found = lookupVariable(state, name);
    if (found) {
      const variable = found.variable;
      if (isVibeValue(variable) && variable.asyncOperationId) {
        const opId = variable.asyncOperationId;
        const operation = state.asyncOperations.get(opId);
        if (operation && (operation.status === 'pending' || operation.status === 'running')) {
          pendingAsyncIds.push(opId);
        }
      }
    }
  }

  // If there are pending async variables, wait for them
  if (pendingAsyncIds.length > 0) {
    return {
      ...state,
      status: 'awaiting_async',
      awaitingAsyncIds: pendingAsyncIds,
      instructionStack: [
        { op: 'interpolate_string', template, location: location ?? { line: 0, column: 0 } },
        ...state.instructionStack,
      ],
    };
  }

  // All variables ready, do the interpolation
  const result = template.replace(/\{(\w+)\}/g, (_, name) => {
    const found = lookupVariable(state, name);
    if (found) {
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
 * If any interpolated variable is a pending async operation, triggers awaiting_async.
 */
export function execInterpolateTemplate(state: RuntimeState, template: string, location?: SourceLocation): RuntimeState {
  // First pass: check for pending async variables
  const varPattern = /\$\{(\w+)\}/g;
  const pendingAsyncIds: string[] = [];
  let match;

  while ((match = varPattern.exec(template)) !== null) {
    const name = match[1];
    const found = lookupVariable(state, name);
    if (found) {
      const variable = found.variable;
      if (isVibeValue(variable) && variable.asyncOperationId) {
        const opId = variable.asyncOperationId;
        const operation = state.asyncOperations.get(opId);
        if (operation && (operation.status === 'pending' || operation.status === 'running')) {
          pendingAsyncIds.push(opId);
        }
      }
    }
  }

  // If there are pending async variables, wait for them
  if (pendingAsyncIds.length > 0) {
    return {
      ...state,
      status: 'awaiting_async',
      awaitingAsyncIds: pendingAsyncIds,
      instructionStack: [
        { op: 'interpolate_template', template, location: location ?? { line: 0, column: 0 } },
        ...state.instructionStack,
      ],
    };
  }

  // All variables ready, do the interpolation
  const result = template.replace(/\$\{(\w+)\}/g, (_, name) => {
    const found = lookupVariable(state, name);
    if (found) {
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
 * When currentAsyncVarName is set (async declaration), schedules the operation
 * for non-blocking execution instead of pausing.
 */
export function execTsEval(state: RuntimeState, params: string[], body: string, location: SourceLocation): RuntimeState {
  // Parse params: supports "name = expr" (named) and "name" (shorthand for "name = name")
  // The expr can be a dotted path like "guesser.usage"
  const parsed = params.map(parseTsParam);

  // Resolve parameter values from expressions
  const paramValues = parsed.map(({ expr }) => {
    const parts = expr.split('.');
    const baseName = parts[0];

    // First try regular variables
    const found = lookupVariable(state, baseName);
    if (found) {
      let value: unknown = resolveValue(found.variable.value);
      // Walk the property chain for dotted expressions
      for (let i = 1; i < parts.length; i++) {
        if (value === null || value === undefined) {
          throw new Error(`TypeError: Cannot read property '${parts[i]}' of ${value}`);
        }
        // For model.usage, return a copy to prevent mutation
        if (found.variable.vibeType === 'model' && parts[i] === 'usage') {
          value = [...((value as { usage: unknown[] }).usage)];
        } else {
          value = (value as Record<string, unknown>)[parts[i]];
        }
      }
      // Freeze const objects to prevent mutation in ts blocks
      if (found.variable.isConst && value !== null && typeof value === 'object') {
        return deepFreeze(value);
      }
      return value;
    }
    // Then try imported values (only for simple names)
    if (parts.length === 1) {
      const imported = getImportedValue(state, expr);
      if (imported !== undefined) {
        return imported;
      }
    }
    throw new Error(`ReferenceError: '${baseName}' is not defined`);
  });

  // Use the binding names for the generated TS function parameters
  const tsParamNames = parsed.map(p => p.name);

  // Check if we're in async context (variable, destructuring, or fire-and-forget)
  if (isInAsyncContext(state)) {
    // Schedule for non-blocking execution using shared helper
    return scheduleAsyncOperation(
      state,
      {
        type: 'ts',
        tsDetails: {
          params: tsParamNames,
          body,
          paramValues,
          location,
        },
      },
      'async_ts_scheduled'
    );
  }

  // Normal blocking execution
  return {
    ...state,
    status: 'awaiting_ts',
    pendingTS: {
      params: tsParamNames,
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
