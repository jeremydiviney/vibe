// TypeScript execution: interpolation, ts blocks, ts eval

import * as AST from '../../ast';
import type { RuntimeState } from '../types';
import { lookupVariable } from './variables';

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
      { op: 'ts_eval', params: expr.params, body: expr.body },
      ...state.instructionStack,
    ],
  };
}

/**
 * TypeScript eval - pause for async evaluation.
 */
export function execTsEval(state: RuntimeState, params: string[], body: string): RuntimeState {
  // Look up parameter values from scope
  const paramValues = params.map((name) => {
    const found = lookupVariable(state, name);
    if (!found) {
      throw new Error(`ReferenceError: '${name}' is not defined`);
    }
    return found.variable.value;
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
