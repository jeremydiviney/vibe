// TypeScript execution: interpolation, ts blocks, ts eval

import * as AST from '../../ast';
import type { RuntimeState } from '../types';
import { lookupVariable } from './variables';
import { getImportedValue } from '../modules';

/**
 * String interpolation - {varName} syntax.
 */
export function execInterpolateString(state: RuntimeState, template: string): RuntimeState {
  const result = template.replace(/\{(\w+)\}/g, (_, name) => {
    // Walk scope chain to find variable
    const found = lookupVariable(state, name);
    if (found) {
      return String(found.variable.value);
    }
    return `{${name}}`;
  });

  return { ...state, lastResult: result };
}

/**
 * Template literal interpolation - ${varName} syntax.
 */
export function execInterpolateTemplate(state: RuntimeState, template: string): RuntimeState {
  const result = template.replace(/\$\{(\w+)\}/g, (_, name) => {
    // Walk scope chain to find variable
    const found = lookupVariable(state, name);
    if (found) {
      return String(found.variable.value);
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
export function execTsEval(state: RuntimeState, params: string[], body: string): RuntimeState {
  // Look up parameter values from scope or imports
  const paramValues = params.map((name) => {
    // First try regular variables
    const found = lookupVariable(state, name);
    if (found) {
      return found.variable.value;
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
