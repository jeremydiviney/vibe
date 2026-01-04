// Expression execution: literals, identifiers, value building

import * as AST from '../../ast';
import type { RuntimeState } from '../types';
import {
  getImportedValue,
  isImportedTsFunction,
  isImportedVibeFunction,
} from '../modules';
import { lookupVariable } from './variables';
import { execVibeExpression } from './ai';
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
      { op: 'exec_expression', expr: expr.value, location: expr.value.location },
      { op: 'assign_var', name: expr.target.name, location: expr.location },
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
    { op: 'exec_expression' as const, expr: p.value, location: p.value.location },
    { op: 'push_value' as const, location: p.value.location },
  ]);

  return {
    ...state,
    instructionStack: [
      ...propInstructions,
      { op: 'build_object', keys, location: expr.location },
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
    { op: 'exec_expression' as const, expr: e, location: e.location },
    { op: 'push_value' as const, location: e.location },
  ]);

  return {
    ...state,
    instructionStack: [
      ...elemInstructions,
      { op: 'build_array', count: expr.elements.length, location: expr.location },
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
 * Binary expression - evaluate left, push, evaluate right, apply operator.
 */
export function execBinaryExpression(state: RuntimeState, expr: AST.BinaryExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.left, location: expr.left.location },
      { op: 'push_value', location: expr.left.location },
      { op: 'exec_expression', expr: expr.right, location: expr.right.location },
      { op: 'binary_op', operator: expr.operator, location: expr.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Unary expression - evaluate operand, apply operator.
 */
export function execUnaryExpression(state: RuntimeState, expr: AST.UnaryExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.operand, location: expr.operand.location },
      { op: 'unary_op', operator: expr.operator, location: expr.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Index expression - evaluate object, push, evaluate index, access element.
 */
export function execIndexExpression(state: RuntimeState, expr: AST.IndexExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.object, location: expr.object.location },
      { op: 'push_value', location: expr.object.location },
      { op: 'exec_expression', expr: expr.index, location: expr.index.location },
      { op: 'index_access', location: expr.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Member expression - evaluate object, return method reference marker.
 * The method_call instruction will actually execute the method.
 */
export function execMemberExpression(state: RuntimeState, expr: AST.MemberExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.object, location: expr.object.location },
      { op: 'push_value', location: expr.object.location },
      { op: 'literal', value: { __methodRef: true, method: expr.property }, location: expr.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Slice expression - evaluate object, push, evaluate start/end if present, slice array.
 */
export function execSliceExpression(state: RuntimeState, expr: AST.SliceExpression): RuntimeState {
  const instructions: RuntimeState['instructionStack'] = [];

  // Push the object first
  instructions.push({ op: 'exec_expression', expr: expr.object, location: expr.object.location });
  instructions.push({ op: 'push_value', location: expr.object.location });

  // Push start if present
  if (expr.start) {
    instructions.push({ op: 'exec_expression', expr: expr.start, location: expr.start.location });
    instructions.push({ op: 'push_value', location: expr.start.location });
  }

  // Push end if present
  if (expr.end) {
    instructions.push({ op: 'exec_expression', expr: expr.end, location: expr.end.location });
    instructions.push({ op: 'push_value', location: expr.end.location });
  }

  // Slice operation
  instructions.push({ op: 'slice_access', hasStart: !!expr.start, hasEnd: !!expr.end, location: expr.location });

  return {
    ...state,
    instructionStack: [
      ...instructions,
      ...state.instructionStack,
    ],
  };
}

/**
 * Range expression - evaluate start and end, build inclusive range array.
 */
export function execRangeExpression(state: RuntimeState, expr: AST.RangeExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.start, location: expr.start.location },
      { op: 'push_value', location: expr.start.location },
      { op: 'exec_expression', expr: expr.end, location: expr.end.location },
      { op: 'push_value', location: expr.end.location },
      { op: 'build_range', location: expr.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Build inclusive range array from value stack [start, end].
 */
export function execBuildRange(state: RuntimeState): RuntimeState {
  const end = state.valueStack[state.valueStack.length - 1];
  const start = state.valueStack[state.valueStack.length - 2];

  if (typeof start !== 'number' || typeof end !== 'number') {
    throw new Error(`Range bounds must be numbers, got ${typeof start} and ${typeof end}`);
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error(`Range bounds must be integers, got ${start} and ${end}`);
  }

  const length = end - start + 1;
  const range = length > 0 ? Array.from({ length }, (_, i) => start + i) : [];

  return {
    ...state,
    valueStack: state.valueStack.slice(0, -2),
    lastResult: range,
  };
}

/**
 * Call expression - push callee, args, and call instruction.
 */
export function execCallExpression(state: RuntimeState, expr: AST.CallExpression): RuntimeState {
  // Evaluate callee and all arguments, then call
  const argInstructions = expr.arguments.flatMap((arg) => [
    { op: 'exec_expression' as const, expr: arg, location: arg.location },
    { op: 'push_value' as const, location: arg.location },
  ]);

  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.callee, location: expr.callee.location },
      { op: 'push_value', location: expr.callee.location },  // Save callee to value stack
      ...argInstructions,
      { op: 'call_function', funcName: '', argCount: expr.arguments.length, location: expr.location },
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
          { op: 'interpolate_string', template: expr.value, location: expr.location },
          ...state.instructionStack,
        ],
      };

    case 'TemplateLiteral':
      return {
        ...state,
        instructionStack: [
          { op: 'interpolate_template', template: expr.value, location: expr.location },
          ...state.instructionStack,
        ],
      };

    case 'BooleanLiteral':
      return { ...state, lastResult: expr.value };

    case 'NumberLiteral':
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

    case 'VibeExpression':
      return execVibeExpression(state, expr);

    case 'TsBlock':
      return execTsBlock(state, expr);

    case 'RangeExpression':
      return execRangeExpression(state, expr);

    case 'BinaryExpression':
      return execBinaryExpression(state, expr);

    case 'UnaryExpression':
      return execUnaryExpression(state, expr);

    case 'IndexExpression':
      return execIndexExpression(state, expr);

    case 'SliceExpression':
      return execSliceExpression(state, expr);

    case 'MemberExpression':
      return execMemberExpression(state, expr);

    default:
      throw new Error(`Unknown expression type: ${(expr as AST.Expression).type}`);
  }
}
