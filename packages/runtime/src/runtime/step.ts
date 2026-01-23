// Core stepping and instruction execution

import type { RuntimeState, Instruction, StackFrame, FrameEntry } from './types';
import { isVibeValue, resolveValue, createVibeError } from './types';
import type { ContextMode } from '../ast';
import { buildLocalContext, buildGlobalContext } from './context';
import { execDeclareVar, execAssignVar } from './exec/variables';
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
import { currentFrame } from './state';
import { RuntimeError, VibeError } from '../errors';
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
import {
  execInterpolatePromptString,
  execInterpolateRegularString,
  execClearPromptContext,
} from './exec/interpolation';
import { execCallFunction } from './exec/functions';
import { execPushFrame, execPopFrame } from './exec/frames';
import { execToolDeclaration } from './exec/tools';

/**
 * Apply context mode on scope exit.
 * - verbose: keep all entries (add scope-exit marker)
 * - forget: remove all entries added during scope (back to entryIndex)
 * - compress: pause for AI to summarize and replace entries with summary
 * Note: Only loops support context modes. Functions always "forget".
 */
function applyContextMode(
  state: RuntimeState,
  frame: StackFrame,
  contextMode: ContextMode,
  entryIndex: number,
  scopeType: 'for' | 'while',
  label?: string
): RuntimeState {
  if (contextMode === 'forget') {
    // Forget: remove all entries from scope (back to before scope-enter)
    const newOrderedEntries = frame.orderedEntries.slice(0, entryIndex);
    return {
      ...state,
      callStack: [
        ...state.callStack.slice(0, -1),
        { ...frame, orderedEntries: newOrderedEntries },
      ],
    };
  }

  if (contextMode === 'verbose') {
    // Verbose: add scope-exit marker, keep all entries
    const newOrderedEntries = [
      ...frame.orderedEntries,
      { kind: 'scope-exit' as const, scopeType, label },
    ];
    return {
      ...state,
      callStack: [
        ...state.callStack.slice(0, -1),
        { ...frame, orderedEntries: newOrderedEntries },
      ],
    };
  }

  // Compress mode: pause for AI summarization
  if (typeof contextMode === 'object' && 'compress' in contextMode) {
    const { arg1, arg2 } = contextMode.compress;

    // Resolve prompt and model from args
    let prompt: string | null = null;
    let modelName: string | null = null;

    if (arg1) {
      if (arg1.kind === 'literal') {
        // String literal is always a prompt
        prompt = arg1.value;
      } else {
        // Identifier - check if it's a model or prompt variable
        if (isModelVariable(state, arg1.name)) {
          // It's a model
          modelName = arg1.name;
        } else {
          // It's a prompt (text value)
          const varValue = lookupVariable(state, arg1.name);
          prompt = String(varValue ?? '');
        }
      }
    }

    if (arg2 && arg2.kind === 'identifier') {
      // Second arg is always model
      modelName = arg2.name;
    }

    // Fall back to lastUsedModel if no explicit model
    const resolvedModel = modelName ?? state.lastUsedModel;
    if (!resolvedModel) {
      throw new RuntimeError('compress requires a model but none declared', { line: 0, column: 0 }, '');
    }

    // Extract entries to summarize (from scope-enter to now)
    const entriesToSummarize = frame.orderedEntries.slice(entryIndex);

    // If empty scope, skip compression
    if (entriesToSummarize.length <= 1) {
      // Only scope-enter, nothing to summarize
      const newOrderedEntries = [
        ...frame.orderedEntries,
        { kind: 'scope-exit' as const, scopeType, label },
      ];
      return {
        ...state,
        callStack: [
          ...state.callStack.slice(0, -1),
          { ...frame, orderedEntries: newOrderedEntries },
        ],
      };
    }

    // Pause for AI summarization
    return {
      ...state,
      status: 'awaiting_compress',
      pendingCompress: {
        prompt,
        model: resolvedModel,
        entriesToSummarize,
        entryIndex,
        scopeType,
        label,
      },
    };
  }

  // Default: just return unchanged
  return state;
}

/**
 * Look up a variable's value in the current scope chain.
 */
function lookupVariable(state: RuntimeState, name: string): unknown {
  // Search from current frame up through scope chain
  for (let i = state.callStack.length - 1; i >= 0; i--) {
    const frame = state.callStack[i];
    if (name in frame.locals) {
      return frame.locals[name].value;
    }
  }
  return undefined;
}

/**
 * Check if a variable is a model by looking at the VibeValue wrapper's vibeType.
 */
function isModelVariable(state: RuntimeState, name: string): boolean {
  for (let i = state.callStack.length - 1; i >= 0; i--) {
    const frame = state.callStack[i];
    if (name in frame.locals) {
      return frame.locals[name].vibeType === 'model';
    }
  }
  return false;
}

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
      // Clear all async context flags (used after fire-and-forget async statements)
      return {
        ...state,
        currentAsyncVarName: null,
        currentAsyncIsConst: false,
        currentAsyncType: null,
        currentAsyncIsPrivate: false,
        currentAsyncIsDestructure: false,
        currentAsyncIsFireAndForget: false,
      };

    case 'ai_vibe':
      return execAIVibe(state, instruction.model, instruction.context, instruction.operationType, instruction.location);

    case 'ts_eval':
      return execTsEval(state, instruction.params, instruction.body, instruction.location);

    case 'call_imported_ts':
      throw new Error('call_imported_ts should be handled in execCallFunction');

    case 'if_branch':
      return execIfBranch(state, instruction.consequent, instruction.alternate, instruction.location);

    case 'for_in_init': {
      const { stmt } = instruction;
      let items = state.lastResult;

      // Handle VibeValue with error - throw the error
      if (isVibeValue(items) && items.err && items.errDetails) {
        throw new RuntimeError(
          `${items.errDetails.type}: ${items.errDetails.message}`,
          instruction.location,
          ''
        );
      }

      // Auto-unwrap VibeValue - check if value is iterable
      if (isVibeValue(items)) {
        const innerValue = items.value;
        if (!Array.isArray(innerValue) && typeof innerValue !== 'number') {
          const valueType = innerValue === null ? 'null' : typeof innerValue;
          throw new RuntimeError(
            `Cannot iterate over VibeValue: value is ${valueType}, not an array. Use .toolCalls to iterate tool calls.`,
            instruction.location,
            ''
          );
        }
        items = innerValue;
      }

      // Handle range: single number N → [1, 2, ..., N] (inclusive)
      if (typeof items === 'number') {
        if (!Number.isInteger(items)) {
          throw new RuntimeError(`for-in range must be an integer, got ${items}`, instruction.location, '');
        }
        if (items < 0) {
          throw new RuntimeError(`for-in range must be non-negative, got ${items}`, instruction.location, '');
        }
        items = Array.from({ length: items }, (_, i) => i + 1);
      }

      // Note: Explicit ranges now use the `..` operator (e.g., 2..5)
      // which produces an array before reaching for_in_init

      if (!Array.isArray(items)) {
        throw new RuntimeError('for-in requires array or range', instruction.location, '');
      }

      const frame = currentFrame(state);
      const savedKeys = Object.keys(frame.locals);

      // Add scope-enter marker
      const label = stmt.variable;
      const entryIndex = frame.orderedEntries.length;
      const newOrderedEntries = [
        ...frame.orderedEntries,
        { kind: 'scope-enter' as const, scopeType: 'for' as const, label },
      ];
      const updatedState = {
        ...state,
        callStack: [
          ...state.callStack.slice(0, -1),
          { ...frame, orderedEntries: newOrderedEntries },
        ],
      };

      return {
        ...updatedState,
        instructionStack: [
          { op: 'for_in_iterate', variable: stmt.variable, items, index: 0, body: stmt.body, savedKeys, contextMode: stmt.contextMode, label, entryIndex, location: instruction.location },
          ...state.instructionStack,
        ],
      };
    }

    case 'for_in_iterate': {
      const { variable, items, index, body, savedKeys, contextMode, label, entryIndex, location } = instruction;

      if (index >= items.length) {
        // Loop complete - add scope-exit marker and apply context mode
        const frame = currentFrame(state);
        const exitState = applyContextMode(state, frame, contextMode!, entryIndex, 'for', label);

        // Cleanup scope variables (will await pending async first)
        return execExitBlock(exitState, savedKeys, location);
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
          { op: 'enter_block', savedKeys: bodyKeys, location: instruction.location },
          ...body.body.map(s => ({ op: 'exec_statement' as const, stmt: s, location: s.location })),
          { op: 'exit_block', savedKeys: bodyKeys, location: instruction.location },
          { op: 'for_in_iterate', variable, items, index: index + 1, body, savedKeys, contextMode, label, entryIndex, location: instruction.location },
          ...state.instructionStack,
        ],
      };
    }

    case 'while_init': {
      const { stmt, savedKeys, location } = instruction;
      const condition = requireBoolean(state.lastResult, 'while condition', location);

      if (!condition) {
        // Condition false - exit loop (first check, no scope entered yet)
        return state;
      }

      // Add scope-enter marker on first true condition
      const frame = currentFrame(state);
      const label = undefined;
      const entryIndex = frame.orderedEntries.length;
      const newOrderedEntries = [
        ...frame.orderedEntries,
        { kind: 'scope-enter' as const, scopeType: 'while' as const },
      ];
      const updatedState = {
        ...state,
        callStack: [
          ...state.callStack.slice(0, -1),
          { ...frame, orderedEntries: newOrderedEntries },
        ],
      };

      // Condition true - execute body then re-check condition
      return {
        ...updatedState,
        instructionStack: [
          { op: 'while_iterate', stmt, savedKeys, contextMode: stmt.contextMode, label, entryIndex, location: instruction.location },
          ...state.instructionStack,
        ],
      };
    }

    case 'while_iterate': {
      const { stmt, savedKeys, contextMode, label, entryIndex } = instruction;
      const bodyFrame = currentFrame(state);
      const bodyKeys = Object.keys(bodyFrame.locals);

      // Execute body, cleanup, re-evaluate condition, then check if loop continues
      return {
        ...state,
        instructionStack: [
          { op: 'enter_block', savedKeys: bodyKeys, location: instruction.location },
          ...stmt.body.body.map(s => ({ op: 'exec_statement' as const, stmt: s, location: s.location })),
          { op: 'exit_block', savedKeys: bodyKeys, location: instruction.location },
          { op: 'exec_expression', expr: stmt.condition, location: stmt.condition.location },
          { op: 'while_check', stmt, savedKeys, contextMode, label, entryIndex, location: instruction.location },
          ...state.instructionStack,
        ],
      };
    }

    case 'while_check': {
      const { stmt, savedKeys, contextMode, label, entryIndex, location } = instruction;
      const condition = requireBoolean(state.lastResult, 'while condition', location);

      if (!condition) {
        // Loop complete - add scope-exit marker and apply context mode
        const frame = currentFrame(state);
        const exitState = applyContextMode(state, frame, contextMode!, entryIndex, 'while', label);

        // Cleanup scope variables (will await pending async first)
        return execExitBlock(exitState, savedKeys, location);
      }

      // Condition still true - continue loop
      return {
        ...state,
        instructionStack: [
          { op: 'while_iterate', stmt, savedKeys, contextMode, label, entryIndex, location: instruction.location },
          ...state.instructionStack,
        ],
      };
    }

    case 'break_loop': {
      const { savedKeys, contextMode, label, entryIndex, scopeType, location } = instruction;

      // First, await any pending async operations in the current scope
      const pendingAsyncIds: string[] = [];
      for (const opId of state.pendingAsyncIds) {
        const operation = state.asyncOperations.get(opId);
        if (operation && (operation.status === 'pending' || operation.status === 'running')) {
          pendingAsyncIds.push(opId);
        }
      }

      if (pendingAsyncIds.length > 0) {
        // Need to await async operations before breaking
        return {
          ...state,
          status: 'awaiting_async',
          awaitingAsyncIds: pendingAsyncIds,
          // Re-queue break_loop to continue after async completes
          instructionStack: [instruction, ...state.instructionStack],
        };
      }

      // Apply context mode (may trigger compress for summarization)
      const frame = currentFrame(state);
      const exitState = applyContextMode(state, frame, contextMode ?? 'forget', entryIndex, scopeType, label);

      // If compress triggered awaiting_compress, don't proceed with exit_block yet
      if (exitState.status === 'awaiting_compress') {
        // Re-queue a simplified break cleanup after compress completes
        return {
          ...exitState,
          instructionStack: [
            { op: 'exit_block', savedKeys, location },
            ...state.instructionStack,
          ],
        };
      }

      // Cleanup scope variables
      return execExitBlock(exitState, savedKeys, location);
    }

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
      // Regular string interpolation - {var} expands to value
      return execInterpolateRegularString(state, instruction.template, instruction.location);

    case 'interpolate_prompt_string':
      // Prompt string interpolation - {var} = reference, !{var} = expand
      return execInterpolatePromptString(state, instruction.template, instruction.location);

    case 'clear_prompt_context':
      // Clear the inPromptContext flag after evaluating prompt
      return execClearPromptContext(state);

    case 'interpolate_template':
      // Legacy template literal handling - redirect to regular string (unified to {var} pattern)
      return execInterpolateRegularString(state, instruction.template, instruction.location);

    case 'binary_op': {
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

    case 'unary_op': {
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

    case 'index_access': {
      const rawIndex = state.lastResult;
      const rawArr = state.valueStack[state.valueStack.length - 1];
      const newStack = state.valueStack.slice(0, -1);

      // Error propagation: if array or index is a VibeValue with error, propagate it
      if (isVibeValue(rawArr) && rawArr.err) {
        return { ...state, valueStack: newStack, lastResult: rawArr };
      }
      if (isVibeValue(rawIndex) && rawIndex.err) {
        return { ...state, valueStack: newStack, lastResult: rawIndex };
      }

      // Auto-unwrap VibeValue
      const arr = resolveValue(rawArr) as unknown[];
      const index = resolveValue(rawIndex) as number;

      if (!Array.isArray(arr)) {
        throw new RuntimeError(`Cannot index non-array: ${typeof arr}`, instruction.location);
      }
      if (typeof index !== 'number' || !Number.isInteger(index)) {
        throw new RuntimeError(`Array index must be an integer, got ${typeof index}`, instruction.location);
      }

      // Support negative indices (Python-style: -1 = last, -2 = second to last, etc.)
      const normalizedIndex = index < 0 ? arr.length + index : index;
      if (normalizedIndex < 0 || normalizedIndex >= arr.length) {
        throw new RuntimeError(`Array index out of bounds: ${index} (length: ${arr.length})`, instruction.location);
      }

      return { ...state, valueStack: newStack, lastResult: arr[normalizedIndex] };
    }

    case 'slice_access': {
      const { hasStart, hasEnd } = instruction;

      // Pop values in reverse order they were pushed
      let rawEnd: unknown;
      let rawStart: unknown;
      let newStack = state.valueStack;

      if (hasEnd) {
        rawEnd = newStack[newStack.length - 1];
        newStack = newStack.slice(0, -1);
      }
      if (hasStart) {
        rawStart = newStack[newStack.length - 1];
        newStack = newStack.slice(0, -1);
      }

      const rawArr = newStack[newStack.length - 1];
      newStack = newStack.slice(0, -1);

      // Error propagation: if array or indices are VibeValues with errors, propagate
      if (isVibeValue(rawArr) && rawArr.err) {
        return { ...state, valueStack: newStack, lastResult: rawArr };
      }
      if (hasStart && isVibeValue(rawStart) && rawStart.err) {
        return { ...state, valueStack: newStack, lastResult: rawStart };
      }
      if (hasEnd && isVibeValue(rawEnd) && rawEnd.err) {
        return { ...state, valueStack: newStack, lastResult: rawEnd };
      }

      // Auto-unwrap VibeValue
      const arr = resolveValue(rawArr) as unknown[];
      const start = hasStart ? resolveValue(rawStart) as number : undefined;
      const end = hasEnd ? resolveValue(rawEnd) as number : undefined;

      if (!Array.isArray(arr)) {
        throw new RuntimeError(`Cannot slice non-array: ${typeof arr}`, instruction.location);
      }

      // Default values: start=0, end=arr.length (Python-style)
      let startIdx = start ?? 0;
      let endIdx = end ?? arr.length;

      if (typeof startIdx !== 'number' || !Number.isInteger(startIdx)) {
        throw new RuntimeError(`Slice start must be an integer, got ${typeof startIdx}`, instruction.location);
      }
      if (typeof endIdx !== 'number' || !Number.isInteger(endIdx)) {
        throw new RuntimeError(`Slice end must be an integer, got ${typeof endIdx}`, instruction.location);
      }

      // Support negative indices (Python-style: -1 = last, -2 = second to last, etc.)
      if (startIdx < 0) startIdx = arr.length + startIdx;
      if (endIdx < 0) endIdx = arr.length + endIdx;

      // Exclusive end slice (Python-style)
      const sliced = arr.slice(startIdx, endIdx);
      return { ...state, valueStack: newStack, lastResult: sliced };
    }

    // Tool operations
    case 'exec_tool_declaration':
      return execToolDeclaration(state, instruction.decl);

    // Model declaration - config values are on the valueStack
    case 'declare_model': {
      return finalizeModelDeclaration(state, instruction.stmt);
    }

    // Destructuring assignment - assign AI result fields to variables
    case 'destructure_assign': {
      const { fields, isConst } = instruction;

      // Get the result value (should be Record<string, unknown> from AI return)
      let fieldValues: Record<string, unknown>;
      let rawResult = state.lastResult;

      // Check if this is a pending async operation - if so, await it
      if (isVibeValue(rawResult) && rawResult.asyncOperationId) {
        const opId = rawResult.asyncOperationId;
        const operation = state.asyncOperations.get(opId);

        // If operation is still pending or running, trigger await
        if (operation && (operation.status === 'pending' || operation.status === 'running')) {
          return {
            ...state,
            status: 'awaiting_async',
            awaitingAsyncIds: [opId],
            // Re-add current instruction to retry after await
            instructionStack: [instruction, ...state.instructionStack],
          };
        }

        // If operation completed, use the result
        if (operation && operation.status === 'completed' && operation.result) {
          rawResult = operation.result;
        }
      }

      // Unwrap VibeValue if present
      if (isVibeValue(rawResult)) {
        rawResult = rawResult.value;
      }

      if (typeof rawResult === 'object' && rawResult !== null) {
        fieldValues = rawResult as Record<string, unknown>;
      } else {
        throw new RuntimeError(
          `Destructuring requires an object, got ${typeof rawResult}`,
          instruction.location,
          ''
        );
      }

      // Declare each field as a variable
      let newState: RuntimeState = { ...state, pendingDestructuring: null };
      for (const field of fields) {
        const value = fieldValues[field.name];
        if (value === undefined) {
          throw new RuntimeError(
            `Missing field '${field.name}' in destructuring result`,
            instruction.location,
            ''
          );
        }
        newState = execDeclareVar(newState, field.name, isConst, field.type, value, field.isPrivate);
      }

      return newState;
    }

    // Member/property access
    case 'member_access': {
      const rawObject = state.lastResult;
      const property = instruction.property;

      // Handle VibeValue reserved properties first
      if (isVibeValue(rawObject)) {
        // Reserved property: .err - return boolean (true if error)
        if (property === 'err') {
          return { ...state, lastResult: rawObject.err };
        }
        // Reserved property: .errDetails - return error details object
        if (property === 'errDetails') {
          return { ...state, lastResult: rawObject.errDetails };
        }
        // Reserved property: .toolCalls - return tool calls array
        if (property === 'toolCalls') {
          return { ...state, lastResult: rawObject.toolCalls };
        }
        // Reserved property: .usage - return per-request usage record (AI results)
        // or a defensive copy of the model's accumulated usage array (models).
        if (property === 'usage') {
          if (rawObject.usage !== undefined) {
            return { ...state, lastResult: rawObject.usage };
          }
          // For model variables, return a copy so push/pop can't mutate the original
          if (rawObject.vibeType === 'model') {
            const model = rawObject.value as { usage: unknown[] };
            return { ...state, lastResult: [...model.usage] };
          }
        }
        // For all other properties, unwrap and continue with normal handling below
      }

      // Unwrap VibeValue and AIResultObject for normal property access
      const object = resolveValue(rawObject);

      // Handle toString() method on any type
      if (property === 'toString') {
        return { ...state, lastResult: { __boundMethod: true, object, method: 'toString' } };
      }

      // Handle built-in methods on arrays
      if (Array.isArray(object)) {
        if (property === 'len' || property === 'push' || property === 'pop') {
          // Block mutating methods on const arrays
          if ((property === 'push' || property === 'pop') && isVibeValue(rawObject) && rawObject.isConst) {
            throw new RuntimeError(`Cannot ${property} on a constant array`, instruction.location);
          }
          // Return bound method for calling
          return { ...state, lastResult: { __boundMethod: true, object, method: property } };
        }
        // For numeric properties, do index access
        const index = Number(property);
        if (!isNaN(index)) {
          return { ...state, lastResult: object[index] };
        }
        throw new RuntimeError(`Unknown array property: ${property}`, instruction.location);
      }

      // Handle built-in methods on strings
      if (typeof object === 'string') {
        if (property === 'len') {
          return { ...state, lastResult: { __boundMethod: true, object, method: property } };
        }
        throw new RuntimeError(`Unknown string property: ${property}`, instruction.location);
      }

      // Handle regular object property access
      if (typeof object === 'object' && object !== null) {
        const val = (object as Record<string, unknown>)[property];
        return { ...state, lastResult: val };
      }

      throw new RuntimeError(`Cannot access property '${property}' on ${typeof object}`, instruction.location);
    }

    default:
      throw new Error(`Unknown instruction: ${(instruction as Instruction).op}`);
  }
}

// Evaluate binary operators
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
