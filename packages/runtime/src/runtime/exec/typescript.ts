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

type TsParamSegment =
  | { type: 'base'; value: string }
  | { type: 'member'; value: string }
  | { type: 'index'; value: number }
  | { type: 'slice'; start: number | null; end: number | null };

/**
 * Parse a ts param expression into access segments.
 * Handles: "var", "obj.field", "arr[0]", "arr[-1]", "arr[1:3]", "obj.list[0].name"
 */
function parseTsParamExprSegments(expr: string): TsParamSegment[] {
  const segments: TsParamSegment[] = [];
  let i = 0;

  // Parse base identifier
  let base = '';
  while (i < expr.length && expr[i] !== '.' && expr[i] !== '[') {
    base += expr[i];
    i++;
  }
  segments.push({ type: 'base', value: base });

  // Parse chain of .field, [index], [start:end]
  while (i < expr.length) {
    if (expr[i] === '.') {
      i++;
      let field = '';
      while (i < expr.length && expr[i] !== '.' && expr[i] !== '[') {
        field += expr[i];
        i++;
      }
      segments.push({ type: 'member', value: field });
    } else if (expr[i] === '[') {
      i++;
      let content = '';
      while (i < expr.length && expr[i] !== ']') {
        content += expr[i];
        i++;
      }
      i++; // skip ]
      if (content.includes(':')) {
        const [startStr, endStr] = content.split(':');
        const start = startStr.trim() ? parseInt(startStr.trim(), 10) : null;
        const end = endStr.trim() ? parseInt(endStr.trim(), 10) : null;
        segments.push({ type: 'slice', start, end });
      } else {
        segments.push({ type: 'index', value: parseInt(content.trim(), 10) });
      }
    } else {
      break;
    }
  }

  return segments;
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
    const segments = parseTsParamExprSegments(expr);
    const baseName = segments[0].value as string;

    // First try regular variables
    const found = lookupVariable(state, baseName);
    if (found) {
      let value: unknown = resolveValue(found.variable.value);
      // Walk the access chain
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        if (value === null || value === undefined) {
          const accessStr = seg.type === 'member' ? `.${seg.value}` : `[${seg.value}]`;
          throw new Error(`TypeError: Cannot read property '${accessStr}' of ${value}`);
        }
        switch (seg.type) {
          case 'member': {
            const prop = seg.value as string;
            // For model.usage, return a copy to prevent mutation
            if (found.variable.vibeType === 'model' && prop === 'usage') {
              value = [...((value as { usage: unknown[] }).usage)];
            } else {
              value = (value as Record<string, unknown>)[prop];
            }
            break;
          }
          case 'index': {
            const arr = value as unknown[];
            const idx = seg.value as number;
            value = idx < 0 ? arr[arr.length + idx] : arr[idx];
            break;
          }
          case 'slice': {
            const arr = value as unknown[];
            const start = seg.start ?? 0;
            const end = seg.end ?? arr.length;
            value = arr.slice(
              start < 0 ? arr.length + start : start,
              end < 0 ? arr.length + end : end
            );
            break;
          }
        }
      }
      // Freeze const objects to prevent mutation in ts blocks
      if (found.variable.isConst && value !== null && typeof value === 'object') {
        return deepFreeze(value);
      }
      return value;
    }
    // Then try imported values (only for simple names)
    if (segments.length === 1) {
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
