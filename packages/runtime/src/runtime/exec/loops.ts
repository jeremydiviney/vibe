// Loop execution: for-in, while, break

import type { RuntimeState, Instruction, StackFrame, FrameEntry } from '../types';
import { isVibeValue } from '../types';
import type { ContextMode } from '../../ast';
import { RuntimeError } from '../../errors';
import { currentFrame } from '../state';
import { requireBoolean } from '../validation';
import { execDeclareVar, execAssignVar } from './variables';
import { execExitBlock } from './statements';

type ForInInitInstruction = Extract<Instruction, { op: 'for_in_init' }>;
type ForInIterateInstruction = Extract<Instruction, { op: 'for_in_iterate' }>;
type WhileInitInstruction = Extract<Instruction, { op: 'while_init' }>;
type WhileIterateInstruction = Extract<Instruction, { op: 'while_iterate' }>;
type WhileCheckInstruction = Extract<Instruction, { op: 'while_check' }>;
type BreakLoopInstruction = Extract<Instruction, { op: 'break_loop' }>;

/**
 * Apply context mode on scope exit.
 * - verbose: keep all entries (add scope-exit marker)
 * - forget: remove all entries added during scope (back to entryIndex)
 * - compress: pause for AI to summarize and replace entries with summary
 * Note: Only loops support context modes. Functions always "forget".
 */
export function applyContextMode(
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
          const varValue = lookupVariableValue(state, arg1.name);
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
function lookupVariableValue(state: RuntimeState, name: string): unknown {
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

export function execForInInit(state: RuntimeState, instruction: ForInInitInstruction): RuntimeState {
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

export function execForInIterate(state: RuntimeState, instruction: ForInIterateInstruction): RuntimeState {
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

export function execWhileInit(state: RuntimeState, instruction: WhileInitInstruction): RuntimeState {
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

export function execWhileIterate(state: RuntimeState, instruction: WhileIterateInstruction): RuntimeState {
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

export function execWhileCheck(state: RuntimeState, instruction: WhileCheckInstruction): RuntimeState {
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

export function execBreakLoop(state: RuntimeState, instruction: BreakLoopInstruction): RuntimeState {
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
