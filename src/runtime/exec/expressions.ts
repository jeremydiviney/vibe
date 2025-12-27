// Expression execution: literals, identifiers, value building

import * as AST from '../../ast';
import type { RuntimeState } from '../types';
import {
  getImportedValue,
  isImportedTsFunction,
  isImportedVibeFunction,
} from '../modules';
import { lookupVariable } from './variables';
import { execDoExpression, execAskExpression, execVibeExpression } from './ai';
import { execTsBlock } from './typescript';

/**
 * Identifier - get variable value.
 */
export function execIdentifier(state: RuntimeState, expr: AST.Identifier): RuntimeState {
  // Walk the scope chain to find the variable
  const found = lookupVariable(state, expr.name);
  if (found) {
    return { ...state, lastResult: found.variable.value };
  }

  // Check if it's a local function
  if (state.functions[expr.name]) {
    return { ...state, lastResult: { __vibeFunction: true, name: expr.name } };
  }

  // Check if it's an imported TS function
  if (isImportedTsFunction(state, expr.name)) {
    return { ...state, lastResult: { __vibeImportedTsFunction: true, name: expr.name } };
  }

  // Check if it's an imported Vibe function
  if (isImportedVibeFunction(state, expr.name)) {
    return { ...state, lastResult: { __vibeImportedVibeFunction: true, name: expr.name } };
  }

  // Check if it's any other imported value
  const importedValue = getImportedValue(state, expr.name);
  if (importedValue !== undefined) {
    return { ...state, lastResult: importedValue };
  }

  throw new Error(`ReferenceError: '${expr.name}' is not defined`);
}

/**
 * Assignment expression - push value and assign instruction.
 */
export function execAssignmentExpression(state: RuntimeState, expr: AST.AssignmentExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.value },
      { op: 'assign_var', name: expr.target.name },
      ...state.instructionStack,
    ],
  };
}

/**
 * Object literal - push properties and build.
 */
export function execObjectLiteral(state: RuntimeState, expr: AST.ObjectLiteral): RuntimeState {
  if (expr.properties.length === 0) {
    return { ...state, lastResult: {} };
  }

  // Evaluate properties in order, push to value stack, then build
  const keys = expr.properties.map((p) => p.key);
  const propInstructions = expr.properties.flatMap((p) => [
    { op: 'exec_expression' as const, expr: p.value },
    { op: 'push_value' as const },
  ]);

  return {
    ...state,
    instructionStack: [
      ...propInstructions,
      { op: 'build_object', keys },
      ...state.instructionStack,
    ],
  };
}

/**
 * Array literal - push elements and build.
 */
export function execArrayLiteral(state: RuntimeState, expr: AST.ArrayLiteral): RuntimeState {
  if (expr.elements.length === 0) {
    return { ...state, lastResult: [] };
  }

  const elemInstructions = expr.elements.flatMap((e) => [
    { op: 'exec_expression' as const, expr: e },
    { op: 'push_value' as const },
  ]);

  return {
    ...state,
    instructionStack: [
      ...elemInstructions,
      { op: 'build_array', count: expr.elements.length },
      ...state.instructionStack,
    ],
  };
}

/**
 * Push lastResult to value stack.
 */
export function execPushValue(state: RuntimeState): RuntimeState {
  return {
    ...state,
    valueStack: [...state.valueStack, state.lastResult],
  };
}

/**
 * Build object from value stack.
 */
export function execBuildObject(state: RuntimeState, keys: string[]): RuntimeState {
  const values = state.valueStack.slice(-keys.length);
  const obj: Record<string, unknown> = {};

  for (let i = 0; i < keys.length; i++) {
    obj[keys[i]] = values[i];
  }

  return {
    ...state,
    valueStack: state.valueStack.slice(0, -keys.length),
    lastResult: obj,
  };
}

/**
 * Build array from value stack.
 */
export function execBuildArray(state: RuntimeState, count: number): RuntimeState {
  const elements = state.valueStack.slice(-count);

  return {
    ...state,
    valueStack: state.valueStack.slice(0, -count),
    lastResult: elements,
  };
}

/**
 * Collect args from value stack for function call.
 */
export function execCollectArgs(state: RuntimeState, count: number): RuntimeState {
  const args = state.valueStack.slice(-count);

  return {
    ...state,
    valueStack: state.valueStack.slice(0, -count),
    lastResult: args,
  };
}

/**
 * Call expression - push callee, args, and call instruction.
 */
export function execCallExpression(state: RuntimeState, expr: AST.CallExpression): RuntimeState {
  // Evaluate callee and all arguments, then call
  const argInstructions = expr.arguments.flatMap((arg) => [
    { op: 'exec_expression' as const, expr: arg },
    { op: 'push_value' as const },
  ]);

  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.callee },
      { op: 'push_value' },  // Save callee to value stack
      ...argInstructions,
      { op: 'call_function', funcName: '', argCount: expr.arguments.length },
      ...state.instructionStack,
    ],
  };
}

/**
 * Expression dispatcher - routes to appropriate expression handler.
 */
export function execExpression(state: RuntimeState, expr: AST.Expression): RuntimeState {
  switch (expr.type) {
    case 'StringLiteral':
      return {
        ...state,
        instructionStack: [
          { op: 'interpolate_string', template: expr.value },
          ...state.instructionStack,
        ],
      };

    case 'TemplateLiteral':
      return {
        ...state,
        instructionStack: [
          { op: 'interpolate_template', template: expr.value },
          ...state.instructionStack,
        ],
      };

    case 'BooleanLiteral':
      return { ...state, lastResult: expr.value };

    case 'ObjectLiteral':
      return execObjectLiteral(state, expr);

    case 'ArrayLiteral':
      return execArrayLiteral(state, expr);

    case 'Identifier':
      return execIdentifier(state, expr);

    case 'AssignmentExpression':
      return execAssignmentExpression(state, expr);

    case 'CallExpression':
      return execCallExpression(state, expr);

    case 'DoExpression':
      return execDoExpression(state, expr);

    case 'VibeExpression':
      return execVibeExpression(state, expr);

    case 'AskExpression':
      return execAskExpression(state, expr);

    case 'TsBlock':
      return execTsBlock(state, expr);

    default:
      throw new Error(`Unknown expression type: ${(expr as AST.Expression).type}`);
  }
}
