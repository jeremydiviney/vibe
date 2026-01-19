// Function call execution

import * as AST from '../../ast';
import type { SourceLocation } from '../../errors';
import type { RuntimeState, StackFrame } from '../types';
import { resolveValue, createVibeValue } from '../types';
import type { VibeToolValue } from '../tools/types';
import { createFrame } from '../state';
import { getImportedVibeFunction, getImportedVibeFunctionModulePath } from '../modules';
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

    const { value: validatedValue } = validateAndCoerce(
      argValue,
      param.typeAnnotation,
      param.name
    );

    newFrame.locals[param.name] = createVibeValue(validatedValue, {
      isConst: false,
      typeAnnotation: param.typeAnnotation,
    });
    // Include snapshotted value in ordered entries for context tracking
    newFrame.orderedEntries.push({
      kind: 'variable' as const,
      name: param.name,
      value: validatedValue,
      type: param.typeAnnotation,
      isConst: false,  // Parameters are not const
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
      vibeFuncDetails: {
        funcName,
        args,
        modulePath,
      },
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
  // Get args and callee from value stack, unwrapping VibeValues
  const rawArgs = state.valueStack.slice(-argCount);
  const rawCallee = state.valueStack[state.valueStack.length - argCount - 1];
  const newValueStack = state.valueStack.slice(0, -(argCount + 1));

  // Unwrap VibeValue for callee and args
  const callee = resolveValue(rawCallee);
  const args = rawArgs.map(arg => resolveValue(arg));

  // Handle local Vibe function
  if (typeof callee === 'object' && callee !== null && '__vibeFunction' in callee) {
    const funcName = (callee as { __vibeFunction: boolean; name: string }).name;
    const func = state.functions[funcName];

    if (!func) {
      throw new Error(`ReferenceError: '${funcName}' is not defined`);
    }

    // Check if we're in async context (variable, destructuring, or fire-and-forget)
    if (isInAsyncContext(state)) {
      return scheduleAsyncVibeFunction(state, funcName, args, newValueStack);
    }

    return executeVibeFunction(state, func, args, newValueStack);
  }

  // Handle imported TS function
  if (typeof callee === 'object' && callee !== null && '__vibeImportedTsFunction' in callee) {
    const funcName = (callee as { __vibeImportedTsFunction: boolean; name: string }).name;
    // Resolve AIResultObject values to primitives for TS functions
    const resolvedArgs = args.map(arg => resolveValue(arg));

    // Check if we're in async context (variable, destructuring, or fire-and-forget)
    if (isInAsyncContext(state)) {
      // Schedule for non-blocking execution using shared helper
      const newState = scheduleAsyncOperation(
        state,
        {
          type: 'ts-function',
          tsFuncDetails: {
            funcName,
            args: resolvedArgs,
            location,
          },
        },
        'async_ts_function_scheduled'
      );
      return { ...newState, valueStack: newValueStack };
    }

    // Normal blocking execution
    return {
      ...state,
      valueStack: newValueStack,
      status: 'awaiting_ts',
      pendingImportedTsCall: { funcName, args: resolvedArgs, location },
      executionLog: [
        ...state.executionLog,
        {
          timestamp: Date.now(),
          instructionType: 'imported_ts_call_request',
          details: { funcName, argCount },
        },
      ],
    };
  }

  // Handle imported Vibe function
  if (typeof callee === 'object' && callee !== null && '__vibeImportedVibeFunction' in callee) {
    const funcName = (callee as { __vibeImportedVibeFunction: boolean; name: string }).name;
    const func = getImportedVibeFunction(state, funcName);

    if (!func) {
      throw new Error(`ReferenceError: '${funcName}' is not defined`);
    }

    // Get the module path for scope isolation
    const modulePath = getImportedVibeFunctionModulePath(state, funcName);

    // Check if we're in async context (variable, destructuring, or fire-and-forget)
    if (isInAsyncContext(state)) {
      return scheduleAsyncVibeFunction(state, funcName, args, newValueStack, modulePath);
    }

    return executeVibeFunction(state, func, args, newValueStack, modulePath);
  }

  // Handle tool call - tools cannot be called directly from vibe scripts
  // They can only be used by AI models via the tools array
  if (typeof callee === 'object' && callee !== null && '__vibeTool' in callee) {
    const tool = callee as VibeToolValue;
    throw new Error(
      `TypeError: Cannot call tool '${tool.name}' directly. Tools can only be used by AI models via the tools array in model declarations.`
    );
  }

  // Handle core function (auto-imported, available everywhere without import)
  if (typeof callee === 'object' && callee !== null && '__vibeCoreFunction' in callee) {
    const funcName = (callee as { __vibeCoreFunction: boolean; name: string }).name;
    const coreFunc = getCoreFunction(funcName);

    if (!coreFunc) {
      throw new Error(`ReferenceError: Core function '${funcName}' is not defined`);
    }

    // Core functions are synchronous, execute directly
    const result = coreFunc(...args);

    return {
      ...state,
      valueStack: newValueStack,
      lastResult: result,
    };
  }

  // Handle bound method call on object (built-in methods)
  if (typeof callee === 'object' && callee !== null && '__boundMethod' in callee) {
    const { object, method } = callee as { __boundMethod: boolean; object: unknown; method: string };
    const result = executeBuiltinMethod(object, method, args);

    return {
      ...state,
      valueStack: newValueStack,
      lastResult: result,
    };
  }

  throw new Error('TypeError: Cannot call non-function');
}

/**
 * Execute a built-in method on an object.
 */
function executeBuiltinMethod(object: unknown, method: string, args: unknown[]): unknown {
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
          throw new Error('push() requires an argument');
        }
        object.push(args[0]);
        return object;  // Return the array for chaining
      case 'pop':
        if (object.length === 0) {
          throw new Error('Cannot pop from empty array');
        }
        return object.pop();  // Return the removed element
      default:
        throw new Error(`Unknown array method: ${method}`);
    }
  }

  // String methods
  if (typeof object === 'string') {
    switch (method) {
      case 'len':
        return object.length;
      default:
        throw new Error(`Unknown string method: ${method}`);
    }
  }

  throw new Error(`Cannot call method '${method}' on ${typeof object}`);
}
