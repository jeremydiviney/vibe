// Variable handling: lookup, declare, assign

import type { VibeType } from '../../ast';
import { ReferenceError, RuntimeError, TypeError, type SourceLocation } from '../../errors';
import type { RuntimeState, Instruction, VibeValue, StackFrame } from '../types';
import { createVibeValue, isVibeValue } from '../types';
import { currentFrame } from '../state';
import { validateAndCoerce } from '../validation';
import { getModuleGlobals } from '../modules';

/**
 * Look up a variable by walking the scope chain.
 * Returns the variable and its frame index, or null if not found.
 *
 * Module isolation: If we're in an imported function (frame has modulePath),
 * we check that module's globals instead of walking up to the main program.
 */
export function lookupVariable(state: RuntimeState, name: string): { variable: VibeValue; frameIndex: number } | null {
  let frameIndex: number | null = state.callStack.length - 1;
  let modulePath: string | undefined;

  while (frameIndex !== null && frameIndex >= 0) {
    const frame: StackFrame = state.callStack[frameIndex];

    // Check frame locals
    if (frame.locals[name]) {
      return { variable: frame.locals[name], frameIndex };
    }

    // Track the module path from any frame in the chain
    if (frame.modulePath && !modulePath) {
      modulePath = frame.modulePath;
    }

    // If we're in a module context and this is the module's root frame,
    // don't walk up to the caller's frames - check module globals instead
    if (modulePath && frame.modulePath === modulePath) {
      // Check module globals before walking to parent (caller's context)
      const moduleGlobals = getModuleGlobals(state, modulePath);
      if (moduleGlobals?.[name]) {
        return { variable: moduleGlobals[name], frameIndex: -1 };
      }
      // Don't continue to caller's frames - module isolation
      return null;
    }

    frameIndex = frame.parentFrameIndex;
  }

  // Not in module context - variable not found in main program
  return null;
}

/**
 * Declare a variable with value from lastResult (or explicit initialValue).
 */
export function execDeclareVar(
  state: RuntimeState,
  name: string,
  isConst: boolean,
  type: VibeType,
  initialValue?: unknown,
  isPrivate?: boolean,
  location?: SourceLocation
): RuntimeState {
  const frame = currentFrame(state);

  if (frame.locals[name]) {
    throw new RuntimeError(`Variable '${name}' is already declared`, location);
  }

  const rawValue = initialValue !== undefined ? initialValue : state.lastResult;

  // If value is already a VibeValue (e.g., from AI response or error), extract its properties.
  //
  // AI interaction metadata (toolCalls, usage, textContent) is handled specially:
  // - When lastResultSource === 'ai', this is a DIRECT assignment from an AI call (const result = do "...")
  //   In this case, preserve all AI metadata.
  // - When lastResultSource !== 'ai', this is a variable-to-variable assignment (const copy = result)
  //   In this case, strip AI metadata - it should only be available on the original variable.
  //
  // Note: AI metadata CAN flow through function parameters/returns (handled in functions.ts).
  let innerValue: unknown;
  let source = initialValue !== undefined ? null : state.lastResultSource;
  let err: VibeValue['err'] = false;
  let errDetails: VibeValue['errDetails'] = null;
  let asyncOperationId: string | undefined;
  let sourceVibeType: VibeType = null;

  // AI metadata - only preserved for direct AI assignments
  let toolCalls: VibeValue['toolCalls'] = [];
  let usage: VibeValue['usage'];
  let textContent: VibeValue['textContent'];

  // Check if this is a direct assignment from AI (not a variable-to-variable copy)
  const isDirectFromAI = state.lastResultSource === 'ai';

  if (isVibeValue(rawValue)) {
    innerValue = rawValue.value;
    source = rawValue.source ?? source;
    err = rawValue.err;  // Preserve error boolean from operations like null arithmetic
    errDetails = rawValue.errDetails;  // Preserve error details
    asyncOperationId = rawValue.asyncOperationId;  // Preserve async operation ID for pending async
    sourceVibeType = rawValue.vibeType;  // Preserve type from source value

    // Only preserve AI metadata for direct AI assignments, not variable-to-variable copies
    if (isDirectFromAI) {
      toolCalls = rawValue.toolCalls;
      usage = rawValue.usage;
      textContent = rawValue.textContent;
    }
  } else {
    innerValue = rawValue;
  }

  const { value: validatedValue, inferredType } = validateAndCoerce(innerValue, type, name, location, source);

  // Use explicit type if provided, then source type, then inferred type
  const finalType = type ?? sourceVibeType ?? inferredType;

  const newLocals = {
    ...frame.locals,
    [name]: createVibeValue(validatedValue, { isConst, vibeType: finalType, source, err, errDetails, isPrivate, asyncOperationId, toolCalls, usage, textContent }),
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
      ...(isPrivate ? { isPrivate: true } : {}),
    },
  ];

  const newState: RuntimeState = {
    ...state,
    lastResultSource: null,  // Clear after consuming
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
    throw new ReferenceError(name, location);
  }

  const { variable, frameIndex } = found;

  if (variable.isConst) {
    throw new TypeError(`Cannot assign to constant '${name}'`, undefined, undefined, location);
  }

  // Warn if modifying non-local variable in async isolation
  // (modifications won't persist after the async function returns)
  const currentFrameIndex = state.callStack.length - 1;
  if (state.isInAsyncIsolation && frameIndex !== currentFrameIndex && frameIndex >= 0) {
    console.warn(
      `Warning: Modifying non-local variable '${name}' in async function. ` +
      `This modification will not persist after the function returns.`
    );
  }

  const rawValue = state.lastResult;

  // If value is already a VibeValue (e.g., from AI response or error), extract its properties.
  // AI interaction metadata (toolCalls, usage, textContent) is only preserved for direct AI assignments.
  let innerValue: unknown;
  let source = state.lastResultSource;
  let err: VibeValue['err'] = false;
  let errDetails: VibeValue['errDetails'] = null;

  // AI metadata - only preserved for direct AI assignments
  let toolCalls: VibeValue['toolCalls'] = [];
  let usage: VibeValue['usage'];
  let textContent: VibeValue['textContent'];

  // Check if this is a direct assignment from AI (not a variable-to-variable copy)
  const isDirectFromAI = state.lastResultSource === 'ai';

  if (isVibeValue(rawValue)) {
    innerValue = rawValue.value;
    source = rawValue.source ?? source;
    err = rawValue.err;  // Preserve error boolean from operations like null arithmetic
    errDetails = rawValue.errDetails;  // Preserve error details

    // Only preserve AI metadata for direct AI assignments
    if (isDirectFromAI) {
      toolCalls = rawValue.toolCalls;
      usage = rawValue.usage;
      textContent = rawValue.textContent;
    }
  } else {
    innerValue = rawValue;
  }

  const { value: validatedValue } = validateAndCoerce(innerValue, variable.vibeType, name, location, source);

  // Handle module global assignment (frameIndex -1)
  if (frameIndex === -1) {
    // Find which module this belongs to by checking current frame's modulePath
    const currentModulePath = getCurrentModulePath(state);
    if (!currentModulePath) {
      throw new RuntimeError('Internal error: module global assignment without module context', location);
    }

    const module = state.vibeModules[currentModulePath];
    if (!module) {
      throw new RuntimeError(`Internal error: module not found: ${currentModulePath}`, location);
    }

    const newGlobals = {
      ...module.globals,
      [name]: { ...variable, value: validatedValue, source, err, errDetails, toolCalls, usage, textContent },
    };

    return {
      ...state,
      lastResultSource: null,
      vibeModules: {
        ...state.vibeModules,
        [currentModulePath]: { ...module, globals: newGlobals },
      },
      executionLog: [
        ...state.executionLog,
        {
          timestamp: Date.now(),
          instructionType: 'assignment',
          details: { name, moduleGlobal: true },
          result: validatedValue,
        },
      ],
    };
  }

  // Regular frame local assignment
  const frame = state.callStack[frameIndex];
  const newLocals = {
    ...frame.locals,
    [name]: { ...variable, value: validatedValue, source, err, errDetails, toolCalls, usage, textContent },
  };

  // Add assignment to ordered entries with snapshotted value for context tracking
  // This captures the history of value changes
  const newOrderedEntries = [
    ...frame.orderedEntries,
    {
      kind: 'variable' as const,
      name,
      value: validatedValue,  // Snapshot at assignment time
      type: variable.vibeType,
      isConst: false,  // Assignments only happen to non-const variables
      source,
    },
  ];

  // Update the correct frame in the call stack
  return {
    ...state,
    lastResultSource: null,  // Clear after consuming
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

/**
 * Get the module path from the current execution context.
 * Walks up the call stack to find a frame with modulePath.
 */
function getCurrentModulePath(state: RuntimeState): string | undefined {
  let frameIndex: number | null = state.callStack.length - 1;
  while (frameIndex !== null && frameIndex >= 0) {
    const frame: StackFrame = state.callStack[frameIndex];
    if (frame.modulePath) {
      return frame.modulePath;
    }
    frameIndex = frame.parentFrameIndex;
  }
  return undefined;
}

type DestructureAssignInstruction = Extract<Instruction, { op: 'destructure_assign' }>;

/**
 * Destructure an object result into individual variable declarations.
 * Handles pending async operations by triggering await if needed.
 */
export function execDestructureAssign(state: RuntimeState, instruction: DestructureAssignInstruction): RuntimeState {
  const { fields, isConst } = instruction;

  // Get the result value (should be Record<string, unknown> from AI return)
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

  let fieldValues: Record<string, unknown>;
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
