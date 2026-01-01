// Variable handling: lookup, declare, assign

import type { SourceLocation } from '../../errors';
import type { RuntimeState, Variable, StackFrame } from '../types';
import { currentFrame } from '../state';
import { validateAndCoerce } from '../validation';

/**
 * Look up a variable by walking the scope chain.
 * Returns the variable and its frame index, or null if not found.
 */
export function lookupVariable(state: RuntimeState, name: string): { variable: Variable; frameIndex: number } | null {
  let frameIndex: number | null = state.callStack.length - 1;
  while (frameIndex !== null && frameIndex >= 0) {
    const frame: StackFrame = state.callStack[frameIndex];
    if (frame.locals[name]) {
      return { variable: frame.locals[name], frameIndex };
    }
    frameIndex = frame.parentFrameIndex;
  }
  return null;
}

/**
 * Declare a variable with value from lastResult (or explicit initialValue).
 */
export function execDeclareVar(
  state: RuntimeState,
  name: string,
  isConst: boolean,
  type: string | null,
  initialValue?: unknown,
  location?: SourceLocation
): RuntimeState {
  const frame = currentFrame(state);

  if (frame.locals[name]) {
    throw new Error(`Variable '${name}' is already declared`);
  }

  const value = initialValue !== undefined ? initialValue : state.lastResult;
  const { value: validatedValue, inferredType } = validateAndCoerce(value, type, name, location);

  // Use explicit type if provided, otherwise use inferred type
  const finalType = type ?? inferredType;

  // Copy source from lastResultSource if using lastResult (not explicit initialValue)
  const source = initialValue !== undefined ? undefined : state.lastResultSource;

  const newLocals = {
    ...frame.locals,
    [name]: { value: validatedValue, isConst, typeAnnotation: finalType, source },
  };

  // Add variable to ordered entries with snapshotted value for context tracking
  const newOrderedEntries = [
    ...frame.orderedEntries,
    {
      kind: 'variable' as const,
      name,
      value: validatedValue,  // Snapshot at assignment time
      type: finalType,
      isConst,
      source,
    },
  ];

  const newState: RuntimeState = {
    ...state,
    lastResultSource: undefined,  // Clear after consuming
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, locals: newLocals, orderedEntries: newOrderedEntries },
    ],
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: isConst ? 'const_declaration' : 'let_declaration',
        details: { name, type, isConst },
        result: validatedValue,
      },
    ],
  };

  return newState;
}

/**
 * Assign a value to an existing variable (from lastResult).
 */
export function execAssignVar(state: RuntimeState, name: string, location?: SourceLocation): RuntimeState {
  // Walk scope chain to find the variable
  const found = lookupVariable(state, name);

  if (!found) {
    throw new Error(`ReferenceError: '${name}' is not defined`);
  }

  const { variable, frameIndex } = found;

  if (variable.isConst) {
    throw new Error(`TypeError: Cannot assign to constant '${name}'`);
  }

  const { value: validatedValue } = validateAndCoerce(state.lastResult, variable.typeAnnotation, name, location);

  const frame = state.callStack[frameIndex];
  const newLocals = {
    ...frame.locals,
    [name]: { ...variable, value: validatedValue, source: state.lastResultSource },
  };

  // Add assignment to ordered entries with snapshotted value for context tracking
  // This captures the history of value changes
  const newOrderedEntries = [
    ...frame.orderedEntries,
    {
      kind: 'variable' as const,
      name,
      value: validatedValue,  // Snapshot at assignment time
      type: variable.typeAnnotation,
      isConst: false,  // Assignments only happen to non-const variables
      source: state.lastResultSource,
    },
  ];

  // Update the correct frame in the call stack
  return {
    ...state,
    lastResultSource: undefined,  // Clear after consuming
    callStack: [
      ...state.callStack.slice(0, frameIndex),
      { ...frame, locals: newLocals, orderedEntries: newOrderedEntries },
      ...state.callStack.slice(frameIndex + 1),
    ],
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'assignment',
        details: { name },
        result: validatedValue,
      },
    ],
  };
}
