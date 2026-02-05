// Function call execution

import * as AST from '../../ast';
import { ReferenceError, RuntimeError, TypeError, type SourceLocation } from '../../errors';
import type { RuntimeState, StackFrame, CalleeValue } from '../types';
import { resolveValue, createVibeValue, isCalleeValue, isVibeValue } from '../types';
import { isVibeToolValue } from '../tools/types';
import { createFrame } from '../state';
import { getImportedVibeFunction, getImportedVibeFunctionModulePath, getModuleFunctions } from '../modules';
import { getCoreFunction } from '../stdlib/core';
import { validateAndCoerce } from '../validation';
import { scheduleAsyncOperation, isInAsyncContext } from '../async/scheduling';

/**
 * Create a new frame with validated parameters for a Vibe function call.
 * @param modulePath - If set, this frame belongs to an imported module (for scope isolation)
 */
export function createFunctionFrame(
  funcName: string,
  params: AST.FunctionParameter[],
  args: unknown[],
  modulePath?: string
): StackFrame {
  const newFrame = createFrame(funcName, 0);

  // Set module path for imported functions (enables module scope isolation)
  if (modulePath) {
    newFrame.modulePath = modulePath;
  }

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const argValue = args[i] ?? null;

    // Extract raw value for validation, but preserve AI metadata from VibeValue
    const rawValue = isVibeValue(argValue) ? argValue.value : argValue;
    const sourceVibe = isVibeValue(argValue) ? argValue : null;

    const { value: validatedValue } = validateAndCoerce(
      rawValue,
      param.vibeType,
      param.name
    );

    // Preserve AI metadata (toolCalls, usage, textContent) through function parameters.
    // This allows AI results to flow through function calls while still stripping
    // metadata on variable assignment (const y = x).
    newFrame.locals[param.name] = createVibeValue(validatedValue, {
      isConst: false,
      vibeType: param.vibeType,
      isPrivate: param.isPrivate,
      // Preserve AI metadata from source VibeValue:
      toolCalls: sourceVibe?.toolCalls ?? [],
      usage: sourceVibe?.usage,
      textContent: sourceVibe?.textContent,
      source: sourceVibe?.source ?? null,
      err: sourceVibe?.err ?? false,
      errDetails: sourceVibe?.errDetails ?? null,
    });
    // Include snapshotted value in ordered entries for context tracking
    newFrame.orderedEntries.push({
      kind: 'variable' as const,
      name: param.name,
      value: validatedValue,
      type: param.vibeType,
      isConst: false,  // Parameters are not const
      isPrivate: param.isPrivate,
    });
  }

  return newFrame;
}

/**
 * Execute a Vibe function (local or imported) by pushing its body onto the instruction stack.
 * Note: Functions always forget context on exit (like traditional callstack).
 * @param modulePath - If set, this function belongs to an imported module (for scope isolation)
 */
function executeVibeFunction(
  state: RuntimeState,
  func: AST.FunctionDeclaration,
  args: unknown[],
  newValueStack: unknown[],
  modulePath?: string
): RuntimeState {
  const newFrame = createFunctionFrame(func.name, func.params, args, modulePath);

  const bodyInstructions = func.body.body.map((s) => ({
    op: 'exec_statement' as const,
    stmt: s,
    location: s.location,
  }));

  return {
    ...state,
    valueStack: newValueStack,
    callStack: [...state.callStack, newFrame],
    instructionStack: [
      ...bodyInstructions,
      { op: 'pop_frame', location: func.body.location },
      ...state.instructionStack,
    ],
    lastResult: null,
    // Reset prompt context - function bodies should not inherit caller's prompt context.
    // Each function manages its own prompt context via return type.
    inPromptContext: false,
  };
}

/**
 * Schedule a Vibe function for async execution.
 * Creates an async operation that will clone state and run the function in isolation.
 */
function scheduleAsyncVibeFunction(
  state: RuntimeState,
  funcName: string,
  args: unknown[],
  newValueStack: unknown[],
  modulePath?: string
): RuntimeState {
  // Use shared scheduling helper, then update valueStack
  const newState = scheduleAsyncOperation(
    state,
    {
      type: 'vibe-function',
      funcName,
      args,
      modulePath,
    },
    'async_vibe_function_scheduled'
  );
  return { ...newState, valueStack: newValueStack };
}

/**
 * Execute function call - handles local Vibe, imported Vibe, and imported TS functions.
 * Note: Functions always forget context on exit (like traditional callstack).
 */
export function execCallFunction(
  state: RuntimeState,
  _funcName: string,
  argCount: number,
  location: SourceLocation
): RuntimeState {
  // Get args and callee from value stack
  // Keep rawArgs as VibeValues to preserve AI metadata through function parameters
  // Note: slice(-0) === slice(0) which returns entire array, so handle 0 args explicitly
  const rawArgs = argCount > 0 ? state.valueStack.slice(-argCount) : [];
  const rawCallee = state.valueStack[state.valueStack.length - argCount - 1];
  const newValueStack = state.valueStack.slice(0, -(argCount + 1));

  // Unwrap VibeValue for callee (functions don't need metadata)
  // Keep rawArgs for Vibe functions to preserve AI metadata
  // Create resolved args for TS functions and core functions that don't understand VibeValues
  const callee = resolveValue(rawCallee);
  const resolvedArgs = rawArgs.map(arg => resolveValue(arg));

  // Tool values have their own type guard (they're persistent stored values, not transient callees)
  if (isVibeToolValue(callee)) {
    throw new TypeError(
      `Cannot call tool '${callee.name}' directly. Tools can only be used by AI models via the tools array in model declarations.`,
      undefined,
      undefined,
      location
    );
  }

  // All other callable types use the CalleeValue discriminated union
  if (!isCalleeValue(callee)) {
    throw new TypeError('Cannot call non-function', undefined, undefined, location);
  }

  switch (callee.kind) {
    case 'vibe-function': {
      const func = state.functions[callee.name];
      if (!func) throw new ReferenceError(callee.name, location);
      if (isInAsyncContext(state)) {
        // Pass rawArgs to preserve AI metadata through function parameters
        return scheduleAsyncVibeFunction(state, callee.name, rawArgs, newValueStack);
      }
      return executeVibeFunction(state, func, rawArgs, newValueStack);
    }

    case 'vibe-module-function': {
      const moduleFunctions = getModuleFunctions(state, callee.modulePath);
      const func = moduleFunctions?.[callee.name];
      if (!func) throw new ReferenceError(callee.name, location);
      if (isInAsyncContext(state)) {
        return scheduleAsyncVibeFunction(state, callee.name, rawArgs, newValueStack, callee.modulePath);
      }
      return executeVibeFunction(state, func, rawArgs, newValueStack, callee.modulePath);
    }

    case 'imported-ts-function': {
      // TS functions receive resolved args (they don't understand VibeValues)
      if (isInAsyncContext(state)) {
        const newState = scheduleAsyncOperation(
          state,
          { type: 'ts-function', funcName: callee.name, args: resolvedArgs, location },
          'async_ts_function_scheduled'
        );
        return { ...newState, valueStack: newValueStack };
      }
      return {
        ...state,
        valueStack: newValueStack,
        status: 'awaiting_ts',
        pendingImportedTsCall: { funcName: callee.name, args: resolvedArgs, location },
        executionLog: [
          ...state.executionLog,
          { timestamp: Date.now(), instructionType: 'imported_ts_call_request', details: { funcName: callee.name, argCount } },
        ],
      };
    }

    case 'imported-vibe-function': {
      const func = getImportedVibeFunction(state, callee.name);
      if (!func) throw new ReferenceError(callee.name, location);
      const modulePath = getImportedVibeFunctionModulePath(state, callee.name);
      if (isInAsyncContext(state)) {
        return scheduleAsyncVibeFunction(state, callee.name, rawArgs, newValueStack, modulePath);
      }
      return executeVibeFunction(state, func, rawArgs, newValueStack, modulePath);
    }

    case 'core-function': {
      // Core functions receive state as first arg, then resolved user args
      const coreFunc = getCoreFunction(callee.name);
      if (!coreFunc) throw new ReferenceError(callee.name, location);
      return { ...state, valueStack: newValueStack, lastResult: coreFunc(state, ...resolvedArgs) };
    }

    case 'bound-method': {
      // Built-in methods receive resolved args
      const result = executeBuiltinMethod(callee.object, callee.method, resolvedArgs, location);
      return { ...state, valueStack: newValueStack, lastResult: result };
    }
  }
}

/**
 * Execute a built-in method on an object.
 */
function executeBuiltinMethod(object: unknown, method: string, args: unknown[], location: SourceLocation): unknown {
  // Universal toString() method - works on any type
  if (method === 'toString') {
    if (object === null || object === undefined) {
      return '';
    }
    if (typeof object === 'object') {
      return JSON.stringify(object);
    }
    return String(object);
  }

  // Array methods
  if (Array.isArray(object)) {
    switch (method) {
      case 'len':
        return object.length;
      case 'push':
        if (args.length === 0) {
          throw new RuntimeError('push() requires an argument', location);
        }
        object.push(args[0]);
        return object;  // Return the array for chaining
      case 'pop':
        if (object.length === 0) {
          throw new RuntimeError('Cannot pop from empty array', location);
        }
        return object.pop();  // Return the removed element
      default:
        throw new RuntimeError(`Unknown array method: ${method}`, location);
    }
  }

  // String methods
  if (typeof object === 'string') {
    switch (method) {
      case 'len':
        return object.length;
      default:
        throw new RuntimeError(`Unknown string method: ${method}`, location);
    }
  }

  throw new RuntimeError(`Cannot call method '${method}' on ${typeof object}`, location);
}
