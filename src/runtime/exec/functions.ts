// Function call execution

import * as AST from '../../ast';
import type { RuntimeState, StackFrame } from '../types';
import { createFrame } from '../state';
import { getImportedVibeFunction } from '../modules';
import { validateAndCoerce } from '../validation';

/**
 * Create a new frame with validated parameters for a Vibe function call.
 */
function createFunctionFrame(
  funcName: string,
  params: AST.Parameter[],
  args: unknown[]
): StackFrame {
  const newFrame = createFrame(funcName, 0);

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const argValue = args[i] ?? null;

    const { value: validatedValue } = validateAndCoerce(
      argValue,
      param.typeAnnotation,
      param.name
    );

    newFrame.locals[param.name] = {
      value: validatedValue,
      isConst: false,
      typeAnnotation: param.typeAnnotation,
    };
    newFrame.orderedEntries.push({ kind: 'variable' as const, name: param.name });
  }

  return newFrame;
}

/**
 * Execute a Vibe function (local or imported) by pushing its body onto the instruction stack.
 */
function executeVibeFunction(
  state: RuntimeState,
  func: AST.FunctionDeclaration,
  args: unknown[],
  newValueStack: unknown[]
): RuntimeState {
  const newFrame = createFunctionFrame(func.name, func.params, args);

  const bodyInstructions = func.body.body.map((s) => ({
    op: 'exec_statement' as const,
    stmt: s,
  }));

  return {
    ...state,
    valueStack: newValueStack,
    callStack: [...state.callStack, newFrame],
    instructionStack: [
      ...bodyInstructions,
      { op: 'pop_frame' },
      ...state.instructionStack,
    ],
    lastResult: null,
  };
}

/**
 * Execute function call - handles local Vibe, imported Vibe, and imported TS functions.
 */
export function execCallFunction(
  state: RuntimeState,
  _funcName: string,
  argCount: number
): RuntimeState {
  const args = state.valueStack.slice(-argCount);
  const callee = state.valueStack[state.valueStack.length - argCount - 1];
  const newValueStack = state.valueStack.slice(0, -(argCount + 1));

  // Handle local Vibe function
  if (typeof callee === 'object' && callee !== null && '__vibeFunction' in callee) {
    const funcName = (callee as { __vibeFunction: boolean; name: string }).name;
    const func = state.functions[funcName];

    if (!func) {
      throw new Error(`ReferenceError: '${funcName}' is not defined`);
    }

    return executeVibeFunction(state, func, args, newValueStack);
  }

  // Handle imported TS function
  if (typeof callee === 'object' && callee !== null && '__vibeImportedTsFunction' in callee) {
    const funcName = (callee as { __vibeImportedTsFunction: boolean; name: string }).name;

    return {
      ...state,
      valueStack: newValueStack,
      status: 'awaiting_ts',
      pendingImportedTsCall: { funcName, args },
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

    return executeVibeFunction(state, func, args, newValueStack);
  }

  // Handle method call on object (built-in methods)
  if (typeof callee === 'object' && callee !== null && '__methodRef' in callee) {
    const { method } = callee as { __methodRef: boolean; method: string };
    // The object is the item before the method reference on the value stack
    // Since we've already sliced off argCount+1 items, the object is now at the end of newValueStack
    const object = newValueStack[newValueStack.length - 1];
    const finalValueStack = newValueStack.slice(0, -1);

    const result = executeBuiltinMethod(object, method, args);

    return {
      ...state,
      valueStack: finalValueStack,
      lastResult: result,
    };
  }

  throw new Error('TypeError: Cannot call non-function');
}

/**
 * Execute a built-in method on an object.
 */
function executeBuiltinMethod(object: unknown, method: string, args: unknown[]): unknown {
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
