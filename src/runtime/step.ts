// Core stepping and instruction execution

import type { RuntimeState, Instruction } from './types';
import { buildLocalContext, buildGlobalContext } from './context';
import { execDeclareVar, execAssignVar } from './exec/variables';
import { execAIDo, execAIAsk, execAIVibe } from './exec/ai';
import {
  execStatement,
  execStatements,
  execReturnValue,
  execIfBranch,
  execEnterBlock,
  execExitBlock,
} from './exec/statements';
import { currentFrame } from './state';
import { RuntimeError } from '../errors';
import { requireBoolean } from './validation';
import {
  execExpression,
  execPushValue,
  execBuildObject,
  execBuildArray,
  execBuildRange,
  execCollectArgs,
} from './exec/expressions';
import {
  execInterpolateString,
  execInterpolateTemplate,
  execTsEval,
} from './exec/typescript';
import { execCallFunction } from './exec/functions';
import { execPushFrame, execPopFrame } from './exec/frames';

// Get the next instruction that will be executed (or null if done/paused)
export function getNextInstruction(state: RuntimeState): Instruction | null {
  if (state.status !== 'running' || state.instructionStack.length === 0) {
    return null;
  }
  return state.instructionStack[0];
}

// Step N instructions (or until pause/complete)
export function stepN(state: RuntimeState, n: number): RuntimeState {
  let current = state;
  for (let i = 0; i < n && current.status === 'running'; i++) {
    current = step(current);
  }
  return current;
}

// Step until a condition is met (returns state where condition is true BEFORE executing)
export function stepUntilCondition(
  state: RuntimeState,
  predicate: (state: RuntimeState, nextInstruction: Instruction | null) => boolean
): RuntimeState {
  let current = state;

  while (current.status === 'running') {
    const next = getNextInstruction(current);

    if (predicate(current, next)) {
      return current;
    }

    if (!next) {
      return current;
    }

    current = step(current);
  }

  return current;
}

// Step until we're about to execute a specific statement type
export function stepUntilStatement(
  state: RuntimeState,
  statementType: string
): RuntimeState {
  return stepUntilCondition(state, (_state, next) => {
    if (next?.op === 'exec_statement') {
      return next.stmt.type === statementType;
    }
    return false;
  });
}

// Step until we're about to execute a specific instruction operation
export function stepUntilOp(
  state: RuntimeState,
  op: Instruction['op']
): RuntimeState {
  return stepUntilCondition(state, (_state, next) => next?.op === op);
}

// Execute a single instruction and return new state
export function step(state: RuntimeState): RuntimeState {
  if (state.status !== 'running') {
    return state;
  }

  if (state.instructionStack.length === 0) {
    return {
      ...state,
      status: 'completed',
      localContext: buildLocalContext(state),
      globalContext: buildGlobalContext(state),
    };
  }

  const stateWithContext: RuntimeState = {
    ...state,
    localContext: buildLocalContext(state),
    globalContext: buildGlobalContext(state),
  };

  const [instruction, ...restInstructions] = stateWithContext.instructionStack;
  const newState: RuntimeState = { ...stateWithContext, instructionStack: restInstructions };

  try {
    return executeInstruction(newState, instruction);
  } catch (error) {
    return {
      ...newState,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Run until we hit a pause point or complete
export function runUntilPause(state: RuntimeState): RuntimeState {
  let current = state;
  while (current.status === 'running' && current.instructionStack.length > 0) {
    current = step(current);
  }

  if (current.status === 'running' && current.instructionStack.length === 0) {
    return {
      ...current,
      status: 'completed',
      localContext: buildLocalContext(current),
      globalContext: buildGlobalContext(current),
    };
  }
  return current;
}

// Execute a single instruction
function executeInstruction(state: RuntimeState, instruction: Instruction): RuntimeState {
  switch (instruction.op) {
    case 'exec_statement':
      return execStatement(state, instruction.stmt);

    case 'exec_expression':
      return execExpression(state, instruction.expr);

    case 'exec_statements':
      return execStatements(state, instruction.stmts, instruction.index);

    case 'declare_var':
      return execDeclareVar(state, instruction.name, instruction.isConst, instruction.type);

    case 'assign_var':
      return execAssignVar(state, instruction.name);

    case 'call_function':
      return execCallFunction(state, instruction.funcName, instruction.argCount);

    case 'push_frame':
      return execPushFrame(state, instruction.name);

    case 'pop_frame':
      return execPopFrame(state);

    case 'return_value':
      return execReturnValue(state);

    case 'enter_block':
      return execEnterBlock(state, instruction.savedKeys);

    case 'exit_block':
      return execExitBlock(state, instruction.savedKeys);

    case 'ai_do':
      return execAIDo(state, instruction.model, instruction.context);

    case 'ai_ask':
      return execAIAsk(state, instruction.model, instruction.context);

    case 'ai_vibe':
      return execAIVibe(state, instruction.model, instruction.context);

    case 'ts_eval':
      return execTsEval(state, instruction.params, instruction.body);

    case 'call_imported_ts':
      throw new Error('call_imported_ts should be handled in execCallFunction');

    case 'if_branch':
      return execIfBranch(state, instruction.consequent, instruction.alternate);

    case 'for_in_init': {
      const { stmt } = instruction;
      let items = state.lastResult;

      // Handle range: single number N → [1, 2, ..., N] (inclusive)
      if (typeof items === 'number') {
        if (!Number.isInteger(items)) {
          throw new RuntimeError(`for-in range must be an integer, got ${items}`, { line: 1, column: 1 }, '');
        }
        if (items < 0) {
          throw new RuntimeError(`for-in range must be non-negative, got ${items}`, { line: 1, column: 1 }, '');
        }
        items = Array.from({ length: items }, (_, i) => i + 1);
      }

      // Note: Explicit ranges now use the `..` operator (e.g., 2..5)
      // which produces an array before reaching for_in_init

      if (!Array.isArray(items)) {
        throw new RuntimeError('for-in requires array or range', { line: 1, column: 1 }, '');
      }

      const frame = currentFrame(state);
      const savedKeys = Object.keys(frame.locals);

      return {
        ...state,
        instructionStack: [
          { op: 'for_in_iterate', variable: stmt.variable, items, index: 0, body: stmt.body, savedKeys },
          ...state.instructionStack,
        ],
      };
    }

    case 'for_in_iterate': {
      const { variable, items, index, body, savedKeys } = instruction;

      if (index >= items.length) {
        // Loop complete - cleanup scope
        return execExitBlock(state, savedKeys);
      }

      // First iteration: declare the loop variable
      // Subsequent iterations: assign the new value
      const frame = currentFrame(state);
      let newState: RuntimeState;
      if (frame.locals[variable]) {
        // Variable exists - assign new value
        newState = execAssignVar({ ...state, lastResult: items[index] }, variable);
      } else {
        // First iteration - declare the variable
        newState = execDeclareVar(state, variable, false, null, items[index]);
      }

      // Get current local variable names to know what to clean up after body execution
      const bodyFrame = currentFrame(newState);
      const bodyKeys = Object.keys(bodyFrame.locals);

      // Push: enter block, body execution, exit block, then next iteration
      return {
        ...newState,
        instructionStack: [
          { op: 'enter_block', savedKeys: bodyKeys },
          ...body.body.map(s => ({ op: 'exec_statement' as const, stmt: s })),
          { op: 'exit_block', savedKeys: bodyKeys },
          { op: 'for_in_iterate', variable, items, index: index + 1, body, savedKeys },
          ...state.instructionStack,
        ],
      };
    }

    case 'while_init': {
      const { stmt, savedKeys } = instruction;
      const condition = requireBoolean(state.lastResult, 'while condition');

      if (!condition) {
        // Condition false - exit loop
        return state;
      }

      // Condition true - execute body then re-check condition
      return {
        ...state,
        instructionStack: [
          { op: 'while_iterate', stmt, savedKeys },
          ...state.instructionStack,
        ],
      };
    }

    case 'while_iterate': {
      const { stmt, savedKeys } = instruction;
      const bodyFrame = currentFrame(state);
      const bodyKeys = Object.keys(bodyFrame.locals);

      // Execute body, cleanup, re-evaluate condition, loop
      return {
        ...state,
        instructionStack: [
          { op: 'enter_block', savedKeys: bodyKeys },
          ...stmt.body.body.map(s => ({ op: 'exec_statement' as const, stmt: s })),
          { op: 'exit_block', savedKeys: bodyKeys },
          { op: 'exec_expression', expr: stmt.condition },
          { op: 'while_init', stmt, savedKeys },
          ...state.instructionStack,
        ],
      };
    }

    case 'push_value':
      return execPushValue(state);

    case 'build_object':
      return execBuildObject(state, instruction.keys);

    case 'build_array':
      return execBuildArray(state, instruction.count);

    case 'build_range':
      return execBuildRange(state);

    case 'collect_args':
      return execCollectArgs(state, instruction.count);

    case 'literal':
      return { ...state, lastResult: instruction.value };

    case 'interpolate_string':
      return execInterpolateString(state, instruction.template);

    case 'interpolate_template':
      return execInterpolateTemplate(state, instruction.template);

    case 'binary_op': {
      const right = state.lastResult;
      const left = state.valueStack[state.valueStack.length - 1];
      const newStack = state.valueStack.slice(0, -1);
      const result = evaluateBinaryOp(instruction.operator, left, right);
      return { ...state, valueStack: newStack, lastResult: result };
    }

    case 'unary_op': {
      const operand = state.lastResult;
      const result = evaluateUnaryOp(instruction.operator, operand);
      return { ...state, lastResult: result };
    }

    case 'index_access': {
      const index = state.lastResult as number;
      const arr = state.valueStack[state.valueStack.length - 1] as unknown[];
      const newStack = state.valueStack.slice(0, -1);

      if (!Array.isArray(arr)) {
        throw new Error(`Cannot index non-array: ${typeof arr}`);
      }
      if (typeof index !== 'number' || !Number.isInteger(index)) {
        throw new Error(`Array index must be an integer, got ${typeof index}`);
      }
      if (index < 0 || index >= arr.length) {
        throw new Error(`Array index out of bounds: ${index} (length: ${arr.length})`);
      }

      return { ...state, valueStack: newStack, lastResult: arr[index] };
    }

    case 'slice_access': {
      const { hasStart, hasEnd } = instruction;

      // Pop values in reverse order they were pushed
      let end: number | undefined;
      let start: number | undefined;
      let newStack = state.valueStack;

      if (hasEnd) {
        end = state.valueStack[newStack.length - 1] as number;
        newStack = newStack.slice(0, -1);
      }
      if (hasStart) {
        start = newStack[newStack.length - 1] as number;
        newStack = newStack.slice(0, -1);
      }

      const arr = newStack[newStack.length - 1] as unknown[];
      newStack = newStack.slice(0, -1);

      if (!Array.isArray(arr)) {
        throw new Error(`Cannot slice non-array: ${typeof arr}`);
      }

      // Default values: start=0, end=arr.length-1
      const startIdx = start ?? 0;
      const endIdx = end ?? arr.length - 1;

      if (typeof startIdx !== 'number' || !Number.isInteger(startIdx)) {
        throw new Error(`Slice start must be an integer, got ${typeof startIdx}`);
      }
      if (typeof endIdx !== 'number' || !Number.isInteger(endIdx)) {
        throw new Error(`Slice end must be an integer, got ${typeof endIdx}`);
      }

      // Inclusive slice (Vibe range-style)
      const sliced = arr.slice(startIdx, endIdx + 1);
      return { ...state, valueStack: newStack, lastResult: sliced };
    }

    default:
      throw new Error(`Unknown instruction: ${(instruction as Instruction).op}`);
  }
}

// Evaluate binary operators
function evaluateBinaryOp(op: string, left: unknown, right: unknown): unknown {
  switch (op) {
    // Arithmetic operators
    case '+':
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

// Evaluate unary operators
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
