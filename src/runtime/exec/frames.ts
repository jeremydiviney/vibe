// Frame management: push and pop stack frames

import type { RuntimeState } from '../types';
import { createFrame } from '../state';

/**
 * Push a new frame onto the call stack.
 */
export function execPushFrame(state: RuntimeState, name: string): RuntimeState {
  return {
    ...state,
    callStack: [...state.callStack, createFrame(name)],
  };
}

/**
 * Pop the current frame from the call stack.
 */
export function execPopFrame(state: RuntimeState): RuntimeState {
  return {
    ...state,
    callStack: state.callStack.slice(0, -1),
  };
}
