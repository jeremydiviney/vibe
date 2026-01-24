// Core stepping and instruction execution

import type { RuntimeState, Instruction } from './types';
import { buildLocalContext, buildGlobalContext } from './context';
import { execDeclareVar, execAssignVar, execDestructureAssign } from './exec/variables';
import { execAIVibe } from './exec/ai';
import {
  execStatement,
  execStatements,
  execReturnValue,
  execThrowError,
  execIfBranch,
  execEnterBlock,
  execExitBlock,
  finalizeModelDeclaration,
} from './exec/statements';
import { VibeError } from '../errors';
import {
  execExpression,
  execPushValue,
  execBuildObject,
  execBuildArray,
  execBuildRange,
  execCollectArgs,
} from './exec/expressions';
import { execTsEval } from './exec/typescript';
import {
  execInterpolatePromptString,
  execInterpolateRegularString,
  execClearPromptContext,
} from './exec/interpolation';
import { execCallFunction } from './exec/functions';
import { execPushFrame, execPopFrame, execClearAsyncContext } from './exec/frames';
import { execToolDeclaration } from './exec/tools';
import { execForInInit, execForInIterate, execWhileInit, execWhileIterate, execWhileCheck, execBreakLoop } from './exec/loops';
import { execBinaryOp, execUnaryOp } from './exec/operators';
import { execMemberAccess, execIndexAccess, execSliceAccess } from './exec/access';

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
    const errorObj = error instanceof Error ? error : new Error(String(error));

    // Use format() method if it's a VibeError, otherwise build error message
    let errorMessage: string;
    if (error instanceof VibeError) {
      errorMessage = error.format();
    } else {
      errorMessage = errorObj.message;
      const location = instruction.location;

      // If we have location info and the error doesn't already include it, add it
      if (location && !errorMessage.includes('[')) {
        const file = location.file ?? 'script';
        errorMessage = `${errorMessage}\n  at ${file}:${location.line}:${location.column}`;
      }
    }

    return {
      ...newState,
      status: 'error',
      error: errorMessage,
      errorObject: errorObj,
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
      return execStatements(state, instruction.stmts, instruction.index, instruction.location);

    case 'declare_var':
      return execDeclareVar(state, instruction.name, instruction.isConst, instruction.type, undefined, instruction.isPrivate, instruction.location);

    case 'assign_var':
      return execAssignVar(state, instruction.name, instruction.location);

    case 'call_function':
      return execCallFunction(state, instruction.funcName, instruction.argCount, instruction.location);

    case 'push_frame':
      return execPushFrame(state, instruction.name);

    case 'pop_frame':
      return execPopFrame(state);

    case 'return_value':
      return execReturnValue(state);

    case 'throw_error':
      return execThrowError(state, instruction.location);

    case 'enter_block':
      return execEnterBlock(state, instruction.savedKeys);

    case 'exit_block':
      return execExitBlock(state, instruction.savedKeys, instruction.location);

    case 'clear_async_context':
      return execClearAsyncContext(state);

    case 'ai_vibe':
      return execAIVibe(state, instruction.model, instruction.context, instruction.operationType, instruction.location);

    case 'ts_eval':
      return execTsEval(state, instruction.params, instruction.body, instruction.location);

    case 'call_imported_ts':
      throw new Error('call_imported_ts should be handled in execCallFunction');

    case 'if_branch':
      return execIfBranch(state, instruction.consequent, instruction.alternate, instruction.location);

    case 'for_in_init':
      return execForInInit(state, instruction);

    case 'for_in_iterate':
      return execForInIterate(state, instruction);

    case 'while_init':
      return execWhileInit(state, instruction);

    case 'while_iterate':
      return execWhileIterate(state, instruction);

    case 'while_check':
      return execWhileCheck(state, instruction);

    case 'break_loop':
      return execBreakLoop(state, instruction);

    case 'push_value':
      return execPushValue(state);

    case 'build_object':
      return execBuildObject(state, instruction.keys);

    case 'build_array':
      return execBuildArray(state, instruction.count);

    case 'build_range':
      return execBuildRange(state, instruction.location);

    case 'collect_args':
      return execCollectArgs(state, instruction.count);

    case 'literal':
      return { ...state, lastResult: instruction.value };

    case 'interpolate_string':
      return execInterpolateRegularString(state, instruction.template, instruction.location);

    case 'interpolate_prompt_string':
      return execInterpolatePromptString(state, instruction.template, instruction.location);

    case 'clear_prompt_context':
      return execClearPromptContext(state);

    case 'interpolate_template':
      return execInterpolateRegularString(state, instruction.template, instruction.location);

    case 'binary_op':
      return execBinaryOp(state, instruction);

    case 'unary_op':
      return execUnaryOp(state, instruction);

    case 'index_access':
      return execIndexAccess(state, instruction);

    case 'slice_access':
      return execSliceAccess(state, instruction);

    case 'exec_tool_declaration':
      return execToolDeclaration(state, instruction.decl);

    case 'declare_model':
      return finalizeModelDeclaration(state, instruction.stmt);

    case 'destructure_assign':
      return execDestructureAssign(state, instruction);

    case 'member_access':
      return execMemberAccess(state, instruction);

    default:
      throw new Error(`Unknown instruction: ${(instruction as Instruction).op}`);
  }
}
