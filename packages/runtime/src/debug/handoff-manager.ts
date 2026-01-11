/**
 * Handoff Manager
 * Coordinates control transfer between Vibe runtime debugging and Bun/TS debugging
 */

import type { RuntimeState } from '../runtime/types';
import type { StackFrame, SourceLocation } from '@vibe-lang/debug-core';
import type { VibeDebugState } from './state';
import type { BunInspectorClient } from './bun-inspector';
import {
  type DebugExecutionContext,
  enterTsBlock,
  enterTsImport,
  exitTsMode,
  decrementTsCallDepth,
  incrementTsCallDepth,
  createDebugExecutionContext,
} from './stack-merger';
import {
  registerTsBlock,
  setScriptId,
  isLocationInTsBlock,
} from './ts-source-map';
import {
  getTsImportInfo,
  registerTempBreakpoint,
  popTempBreakpoint,
  clearTempBreakpoints,
} from './ts-import-tracker';

// Handoff state
export interface HandoffState {
  // Current execution context
  context: DebugExecutionContext;
  // Whether a handoff is in progress
  handoffInProgress: boolean;
  // The reason for current handoff
  handoffReason: 'ts_block' | 'ts_import' | null;
  // Target location for handoff (where to break in TS)
  handoffTarget: SourceLocation | null;
  // Saved Vibe debug state when entering TS
  savedVibeState: VibeDebugState | null;
  // Saved Vibe runtime state when entering TS
  savedRuntimeState: RuntimeState | null;
}

/**
 * Create initial handoff state
 */
export function createHandoffState(): HandoffState {
  return {
    context: createDebugExecutionContext(),
    handoffInProgress: false,
    handoffReason: null,
    handoffTarget: null,
    savedVibeState: null,
    savedRuntimeState: null,
  };
}

/**
 * Check if we should initiate a handoff to TS debugging
 */
export function shouldInitiateHandoff(
  runtimeState: RuntimeState,
  handoffState: HandoffState
): { shouldHandoff: boolean; reason: 'ts_block' | 'ts_import' | null } {
  // Already in TS mode - no new handoff needed
  if (handoffState.context.mode === 'typescript') {
    return { shouldHandoff: false, reason: null };
  }

  // Check for pending TS block execution
  if (runtimeState.status === 'awaiting_ts' && runtimeState.pendingTS) {
    return { shouldHandoff: true, reason: 'ts_block' };
  }

  // Check for pending imported TS function call
  if (runtimeState.status === 'awaiting_ts' && runtimeState.pendingImportedTsCall) {
    return { shouldHandoff: true, reason: 'ts_import' };
  }

  return { shouldHandoff: false, reason: null };
}

/**
 * Initiate handoff to TS debugging
 */
export function initiateHandoff(
  runtimeState: RuntimeState,
  debugState: VibeDebugState,
  handoffState: HandoffState,
  reason: 'ts_block' | 'ts_import'
): HandoffState {
  const vibeCallDepth = runtimeState.callStack.length;

  let newContext: DebugExecutionContext;
  let target: SourceLocation | null = null;

  if (reason === 'ts_block' && runtimeState.pendingTS) {
    // Register the TS block for source mapping
    const location = runtimeState.pendingTS.location ?? { file: '', line: 0, column: 0 };
    const tsBlockId = registerTsBlock(
      location.file ?? '',
      location,
      runtimeState.pendingTS.body,
      runtimeState.pendingTS.params
    );
    newContext = enterTsBlock(handoffState.context, tsBlockId, vibeCallDepth);
    target = { file: 'ts_block', line: 1, column: 0 }; // Entry of TS block
  } else if (reason === 'ts_import' && runtimeState.pendingImportedTsCall) {
    const { funcName } = runtimeState.pendingImportedTsCall;
    newContext = enterTsImport(handoffState.context, funcName, vibeCallDepth);
    // Target will be set when we resolve the function location via Bun inspector
  } else {
    newContext = handoffState.context;
  }

  return {
    ...handoffState,
    context: newContext,
    handoffInProgress: true,
    handoffReason: reason,
    handoffTarget: target,
    savedVibeState: debugState,
    savedRuntimeState: runtimeState,
  };
}

/**
 * Complete handoff (control now with TS debugger)
 */
export function completeHandoff(handoffState: HandoffState): HandoffState {
  return {
    ...handoffState,
    handoffInProgress: false,
  };
}

/**
 * Check if we should return control to Vibe
 * Called when TS execution hits a return or step out
 */
export function shouldReturnControl(
  handoffState: HandoffState,
  tsCallDepth: number
): boolean {
  if (handoffState.context.mode !== 'typescript') {
    return false;
  }
  // Return control when we've stepped out of all TS frames
  return tsCallDepth <= 0;
}

/**
 * Return control to Vibe debugging
 */
export function returnToVibe(handoffState: HandoffState): HandoffState {
  return {
    ...handoffState,
    context: exitTsMode(handoffState.context),
    handoffInProgress: false,
    handoffReason: null,
    handoffTarget: null,
    savedVibeState: null,
    savedRuntimeState: null,
  };
}

/**
 * Handle step into during TS execution
 * Increments TS call depth
 */
export function handleTsStepIn(handoffState: HandoffState): HandoffState {
  return {
    ...handoffState,
    context: incrementTsCallDepth(handoffState.context),
  };
}

/**
 * Handle step out during TS execution
 * Decrements TS call depth, may trigger return to Vibe
 */
export function handleTsStepOut(handoffState: HandoffState): HandoffState {
  const newContext = decrementTsCallDepth(handoffState.context);

  // If we exited TS mode, clear the handoff state
  if (newContext.mode === 'vibe') {
    return returnToVibe(handoffState);
  }

  return {
    ...handoffState,
    context: newContext,
  };
}

/**
 * Get current debug mode
 */
export function getCurrentMode(handoffState: HandoffState): 'vibe' | 'typescript' {
  return handoffState.context.mode;
}

/**
 * Check if currently in TS mode
 */
export function isInTsMode(handoffState: HandoffState): boolean {
  return handoffState.context.mode === 'typescript';
}

/**
 * Get saved Vibe state (for continuing after TS returns)
 */
export function getSavedVibeState(handoffState: HandoffState): {
  debugState: VibeDebugState | null;
  runtimeState: RuntimeState | null;
} {
  return {
    debugState: handoffState.savedVibeState,
    runtimeState: handoffState.savedRuntimeState,
  };
}

/**
 * Setup temporary breakpoint for stepping into TS import
 */
export async function setupTsImportBreakpoint(
  bunInspector: BunInspectorClient,
  tsFile: string,
  functionName: string,
  entryLine: number
): Promise<string | null> {
  try {
    const result = await bunInspector.setBreakpointByUrl(
      tsFile,
      entryLine - 1, // CDP uses 0-based lines
      0
    );
    if (result.breakpointId) {
      registerTempBreakpoint(tsFile, entryLine, result.breakpointId);
      return result.breakpointId;
    }
  } catch (error) {
    console.error('Failed to set TS import breakpoint:', error);
  }
  return null;
}

/**
 * Clean up temporary breakpoint after hitting it
 */
export async function cleanupTempBreakpoint(
  bunInspector: BunInspectorClient,
  tsFile: string,
  line: number
): Promise<void> {
  const breakpointId = popTempBreakpoint(tsFile, line);
  if (breakpointId) {
    try {
      await bunInspector.removeBreakpoint(breakpointId);
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}

/**
 * Clean up all temporary breakpoints
 */
export async function cleanupAllTempBreakpoints(
  bunInspector: BunInspectorClient
): Promise<void> {
  const all = clearTempBreakpoints();
  for (const breakpointId of all.values()) {
    try {
      await bunInspector.removeBreakpoint(breakpointId);
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}
