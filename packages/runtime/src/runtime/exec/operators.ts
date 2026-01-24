// Operator execution: binary and unary operations

import type { RuntimeState, Instruction } from '../types';
import { isVibeValue, resolveValue, createVibeError } from '../types';

type BinaryOpInstruction = Extract<Instruction, { op: 'binary_op' }>;
type UnaryOpInstruction = Extract<Instruction, { op: 'unary_op' }>;

function evaluateBinaryOp(op: string, left: unknown, right: unknown): unknown {
  switch (op) {
    // Addition / concatenation
    case '+':
      // Array concatenation: [1,2] + [3,4] = [1,2,3,4]
      if (Array.isArray(left) && Array.isArray(right)) {
        return [...left, ...right];
      }
      // String/number addition (JS handles coercion)
      return (left as number) + (right as number);
    case '-':
      return (left as number) - (right as number);
    case '*':
      return (left as number) * (right as number);
    case '/':
      return (left as number) / (right as number);
    case '%':
      return (left as number) % (right as number);

    // Comparison operators
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      return (left as number) < (right as number);
    case '>':
      return (left as number) > (right as number);
    case '<=':
      return (left as number) <= (right as number);
    case '>=':
      return (left as number) >= (right as number);

    // Logical operators
    case 'and':
      return Boolean(left) && Boolean(right);
    case 'or':
      return Boolean(left) || Boolean(right);

    default:
      throw new Error(`Unknown binary operator: ${op}`);
  }
}

function evaluateUnaryOp(op: string, operand: unknown): unknown {
  switch (op) {
    case 'not':
      return !Boolean(operand);
    case '-':
      return -(operand as number);
    default:
      throw new Error(`Unknown unary operator: ${op}`);
  }
}

export function execBinaryOp(state: RuntimeState, instruction: BinaryOpInstruction): RuntimeState {
  const rawRight = state.lastResult;
  const rawLeft = state.valueStack[state.valueStack.length - 1];
  const newStack = state.valueStack.slice(0, -1);

  // Error propagation: if either operand is a VibeValue with error, propagate it
  if (isVibeValue(rawLeft) && rawLeft.err) {
    return { ...state, valueStack: newStack, lastResult: rawLeft };
  }
  if (isVibeValue(rawRight) && rawRight.err) {
    return { ...state, valueStack: newStack, lastResult: rawRight };
  }

  // Auto-unwrap VibeValue for operations
  const left = resolveValue(rawLeft);
  const right = resolveValue(rawRight);

  // Handle null in operations
  const op = instruction.operator;

  // String concatenation with + - coerce null to empty string
  if (op === '+' && (typeof left === 'string' || typeof right === 'string')) {
    const leftStr = left === null ? '' : String(left);
    const rightStr = right === null ? '' : String(right);
    return { ...state, valueStack: newStack, lastResult: leftStr + rightStr };
  }

  // Arithmetic operations with null - create error
  if (left === null || right === null) {
    if (op === '-' || op === '*' || op === '/' || op === '%' || (op === '+' && typeof left !== 'string' && typeof right !== 'string')) {
      const errorValue = createVibeError(
        `Cannot perform arithmetic operation '${op}' with null`,
        instruction.location
      );
      return { ...state, valueStack: newStack, lastResult: errorValue };
    }
  }

  const result = evaluateBinaryOp(op, left, right);
  return { ...state, valueStack: newStack, lastResult: result };
}

export function execUnaryOp(state: RuntimeState, instruction: UnaryOpInstruction): RuntimeState {
  const rawOperand = state.lastResult;

  // Error propagation: if operand is VibeValue with error, propagate it
  if (isVibeValue(rawOperand) && rawOperand.err) {
    return { ...state, lastResult: rawOperand };
  }

  // Auto-unwrap VibeValue for operations
  const operand = resolveValue(rawOperand);
  const op = instruction.operator;

  // Unary minus with null - create error
  if (operand === null && op === '-') {
    const errorValue = createVibeError(
      `Cannot perform unary '${op}' on null`,
      instruction.location
    );
    return { ...state, lastResult: errorValue };
  }

  const result = evaluateUnaryOp(op, operand);
  return { ...state, lastResult: result };
}
