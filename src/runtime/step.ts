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
import {
  execExpression,
  execPushValue,
  execBuildObject,
  execBuildArray,
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

      // Handle range: [start, end] with 2 numbers → expand to inclusive range
      if (Array.isArray(items) && items.length === 2 &&
          typeof items[0] === 'number' && typeof items[1] === 'number') {
        const [start, end] = items;
        if (!Number.isInteger(start) || !Number.isInteger(end)) {
          throw new RuntimeError(`for-in range bounds must be integers`, { line: 1, column: 1 }, '');
        }
        items = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      }

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

    case 'push_value':
      return execPushValue(state);

    case 'build_object':
      return execBuildObject(state, instruction.keys);

    case 'build_array':
      return execBuildArray(state, instruction.count);

    case 'collect_args':
      return execCollectArgs(state, instruction.count);

    case 'literal':
      return { ...state, lastResult: instruction.value };

    case 'interpolate_string':
      return execInterpolateString(state, instruction.template);

    case 'interpolate_template':
      return execInterpolateTemplate(state, instruction.template);

    default:
      throw new Error(`Unknown instruction: ${(instruction as Instruction).op}`);
  }
}
