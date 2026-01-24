// Property and index access: member access, index, slice

import type { RuntimeState, Instruction } from '../types';
import { isVibeValue, resolveValue } from '../types';
import { RuntimeError } from '../../errors';

type MemberAccessInstruction = Extract<Instruction, { op: 'member_access' }>;
type IndexAccessInstruction = Extract<Instruction, { op: 'index_access' }>;
type SliceAccessInstruction = Extract<Instruction, { op: 'slice_access' }>;

export function execMemberAccess(state: RuntimeState, instruction: MemberAccessInstruction): RuntimeState {
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
    return { ...state, lastResult: { kind: 'bound-method', object, method: 'toString' } };
  }

  // Handle built-in methods on arrays
  if (Array.isArray(object)) {
    if (property === 'len' || property === 'push' || property === 'pop') {
      // Block mutating methods on const arrays
      if ((property === 'push' || property === 'pop') && isVibeValue(rawObject) && rawObject.isConst) {
        throw new RuntimeError(`Cannot ${property} on a constant array`, instruction.location);
      }
      // Return bound method for calling
      return { ...state, lastResult: { kind: 'bound-method', object, method: property } };
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
      return { ...state, lastResult: { kind: 'bound-method', object, method: property } };
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

export function execIndexAccess(state: RuntimeState, instruction: IndexAccessInstruction): RuntimeState {
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

export function execSliceAccess(state: RuntimeState, instruction: SliceAccessInstruction): RuntimeState {
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
