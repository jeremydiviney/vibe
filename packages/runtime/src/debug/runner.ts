/**
 * Debug Runner - Functional debug execution
 * Pure functions for running Vibe programs with debug support
 */

import type { RuntimeState } from '../runtime/types';
import type { StoppedEvent, OutputEvent, TerminatedEvent, RuntimeEvent } from '@vibe-lang/debug-core';
import { step, runUntilPause } from '../runtime/step';
import {
  resumeWithAIResponse,
  resumeWithTsResult,
  resumeWithImportedTsResult,
  resumeWithToolResult,
  resumeWithCompressResult,
} from '../runtime/state';
import { evalTsBlock } from '../runtime/ts-eval';
import { getImportedTsFunction, loadImports } from '../runtime/modules';
import type { AIProvider, AIExecutionResult } from '../runtime';
import {
  type VibeDebugState,
  createDebugState,
  getCurrentLocation,
  shouldPauseAtLocation,
  pauseExecution,
  resumeExecution,
  setStepMode,
} from './state';

// Debug execution result
export interface DebugStepResult {
  runtimeState: RuntimeState;
  debugState: VibeDebugState;
  event?: RuntimeEvent;
}

/**
 * Initialize debug session
 */
export function initDebugSession(options?: {
  stopOnEntry?: boolean;
}): VibeDebugState {
  return createDebugState(options);
}

/**
 * Step one instruction with debug support
 * Returns new states and any debug event to emit
 */
export function debugStep(
  runtimeState: RuntimeState,
  debugState: VibeDebugState
): DebugStepResult {
  // If already completed or errored, return as-is
  if (runtimeState.status === 'completed' || runtimeState.status === 'error') {
    return {
      runtimeState,
      debugState,
      event: createTerminatedEvent(),
    };
  }

  // If waiting for async operation, can't step
  if (
    runtimeState.status === 'awaiting_ai' ||
    runtimeState.status === 'awaiting_ts' ||
    runtimeState.status === 'awaiting_user' ||
    runtimeState.status === 'awaiting_tool' ||
    runtimeState.status === 'awaiting_compress'
  ) {
    return { runtimeState, debugState };
  }

  // Execute one step
  const newRuntimeState = step(runtimeState);

  // Get current location after step
  const location = getCurrentLocation(newRuntimeState);

  // Check if we should pause
  if (location) {
    const { shouldPause, reason } = shouldPauseAtLocation(debugState, newRuntimeState, location);
    if (shouldPause && reason) {
      const newDebugState = pauseExecution(debugState, location, reason);
      return {
        runtimeState: newRuntimeState,
        debugState: newDebugState,
        event: createStoppedEvent(reason, location),
      };
    }
  }

  return {
    runtimeState: newRuntimeState,
    debugState,
  };
}

/**
 * Continue execution until breakpoint, pause, or completion
 */
export function debugContinue(
  runtimeState: RuntimeState,
  debugState: VibeDebugState
): DebugStepResult {
  let state = runtimeState;
  let dState = resumeExecution(debugState);

  while (
    state.status === 'running' ||
    state.status === 'paused'
  ) {
    const result = debugStep(state, dState);
    state = result.runtimeState;
    dState = result.debugState;

    // If we got an event (stopped, terminated), return it
    if (result.event) {
      return result;
    }

    // If waiting for async, break out
    if (
      state.status === 'awaiting_ai' ||
      state.status === 'awaiting_ts' ||
      state.status === 'awaiting_user' ||
      state.status === 'awaiting_tool' ||
      state.status === 'awaiting_compress'
    ) {
      break;
    }
  }

  // Check for completion
  if (state.status === 'completed') {
    return {
      runtimeState: state,
      debugState: dState,
      event: createTerminatedEvent(),
    };
  }

  return { runtimeState: state, debugState: dState };
}

/**
 * Step into (step one statement, entering function calls)
 */
export function debugStepIn(
  runtimeState: RuntimeState,
  debugState: VibeDebugState
): DebugStepResult {
  const newDebugState = setStepMode(debugState, 'into');
  return debugStep(runtimeState, newDebugState);
}

/**
 * Step over (step one statement, skipping over function calls)
 */
export function debugStepOver(
  runtimeState: RuntimeState,
  debugState: VibeDebugState
): DebugStepResult {
  const newDebugState = setStepMode(debugState, 'over');
  // For now, step over is same as step in
  // TODO: Track call depth to skip over function bodies
  return debugStep(runtimeState, newDebugState);
}

/**
 * Step out (run until current function returns)
 */
export function debugStepOut(
  runtimeState: RuntimeState,
  debugState: VibeDebugState
): DebugStepResult {
  const newDebugState = setStepMode(debugState, 'out');
  // TODO: Track call depth to run until return
  return debugContinue(runtimeState, newDebugState);
}

/**
 * Handle async AI call during debug
 */
export async function handleDebugAICall(
  runtimeState: RuntimeState,
  debugState: VibeDebugState,
  aiProvider: AIProvider
): Promise<DebugStepResult> {
  if (runtimeState.status !== 'awaiting_ai' || !runtimeState.pendingAI) {
    return { runtimeState, debugState };
  }

  // Execute AI call
  const result: AIExecutionResult = await aiProvider.execute(runtimeState.pendingAI.prompt);

  // Resume with response
  const newRuntimeState = resumeWithAIResponse(runtimeState, result.value);

  return { runtimeState: newRuntimeState, debugState };
}

/**
 * Handle async TypeScript evaluation during debug
 */
export async function handleDebugTSCall(
  runtimeState: RuntimeState,
  debugState: VibeDebugState
): Promise<DebugStepResult> {
  if (runtimeState.status !== 'awaiting_ts') {
    return { runtimeState, debugState };
  }

  let newRuntimeState = runtimeState;

  if (runtimeState.pendingTS) {
    // Handle inline ts block
    const { params, body, paramValues, location } = runtimeState.pendingTS;
    const result = await evalTsBlock(params, body, paramValues, location);
    newRuntimeState = resumeWithTsResult(runtimeState, result);
  } else if (runtimeState.pendingImportedTsCall) {
    // Handle imported TS function
    const { funcName, args } = runtimeState.pendingImportedTsCall;
    const fn = getImportedTsFunction(runtimeState, funcName);
    if (fn) {
      const result = await fn(...args);
      newRuntimeState = resumeWithImportedTsResult(runtimeState, result);
    }
  }

  return { runtimeState: newRuntimeState, debugState };
}

/**
 * Run program with debug support until stopped or completed
 * This is the main debug loop
 */
export async function runWithDebug(
  runtimeState: RuntimeState,
  debugState: VibeDebugState,
  aiProvider: AIProvider,
  onEvent: (event: RuntimeEvent) => void
): Promise<{ runtimeState: RuntimeState; debugState: VibeDebugState }> {
  let state = runtimeState;
  let dState = debugState;

  // If stop on entry, emit stopped event
  if (dState.paused && dState.stopReason === 'entry') {
    const location = getCurrentLocation(state);
    if (location) {
      onEvent(createStoppedEvent('entry', location));
    }
    return { runtimeState: state, debugState: dState };
  }

  while (state.status !== 'completed' && state.status !== 'error') {
    // Handle async operations
    if (state.status === 'awaiting_ai') {
      const result = await handleDebugAICall(state, dState, aiProvider);
      state = result.runtimeState;
      dState = result.debugState;
      continue;
    }

    if (state.status === 'awaiting_ts') {
      const result = await handleDebugTSCall(state, dState);
      state = result.runtimeState;
      dState = result.debugState;
      continue;
    }

    // Step execution
    const result = debugContinue(state, dState);
    state = result.runtimeState;
    dState = result.debugState;

    // Emit events
    if (result.event) {
      onEvent(result.event);

      // If stopped, pause the loop
      if (result.event.type === 'event' && result.event.event === 'stopped') {
        return { runtimeState: state, debugState: dState };
      }

      // If terminated, exit
      if (result.event.type === 'event' && result.event.event === 'terminated') {
        return { runtimeState: state, debugState: dState };
      }
    }
  }

  // Emit terminated event
  onEvent(createTerminatedEvent());
  return { runtimeState: state, debugState: dState };
}

// Event creators

function createStoppedEvent(reason: string, location: { file: string; line: number; column: number }): StoppedEvent {
  return {
    type: 'event',
    event: 'stopped',
    body: {
      reason: reason as any,
      location,
      threadId: 1,
      allThreadsStopped: true,
    },
  };
}

function createTerminatedEvent(): TerminatedEvent {
  return {
    type: 'event',
    event: 'terminated',
  };
}

export function createOutputEvent(
  output: string,
  category: 'stdout' | 'stderr' | 'console' = 'stdout'
): OutputEvent {
  return {
    type: 'event',
    event: 'output',
    body: {
      category,
      output,
    },
  };
}
