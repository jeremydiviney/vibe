/**
 * Stack Frame Merger
 * Combines Vibe runtime stack frames with TS/Bun inspector stack frames
 * to present a unified debugging view
 */

import type { StackFrame, SourceLocation } from '@vibe-lang/debug-core';
import type { RuntimeState } from '../runtime/types';
import { getStackTrace } from './state';

// Stack frame origin
export type FrameOrigin = 'vibe' | 'typescript' | 'hybrid';

// Extended stack frame with origin info
export interface MergedStackFrame extends StackFrame {
  origin: FrameOrigin;
  // For TS frames, the original CDP call frame ID
  cdpCallFrameId?: string;
  // For TS block frames, the mapping ID
  tsBlockMappingId?: string;
}

// Current debug mode
export type DebugMode = 'vibe' | 'typescript';

// Debug execution context tracking
export interface DebugExecutionContext {
  // Current mode - are we in Vibe code or TS code?
  mode: DebugMode;
  // If in TS mode, depth into TS calls (for step out)
  tsCallDepth: number;
  // The Vibe call stack depth when we entered TS
  vibeCallDepthOnTsEntry: number;
  // TS block mapping ID if we're in a ts block
  currentTsBlockId: string | null;
  // Imported TS function if we stepped into one
  currentTsImport: string | null;
}

/**
 * Create initial debug execution context
 */
export function createDebugExecutionContext(): DebugExecutionContext {
  return {
    mode: 'vibe',
    tsCallDepth: 0,
    vibeCallDepthOnTsEntry: 0,
    currentTsBlockId: null,
    currentTsImport: null,
  };
}

/**
 * Enter TS block mode
 */
export function enterTsBlock(
  context: DebugExecutionContext,
  tsBlockId: string,
  vibeCallDepth: number
): DebugExecutionContext {
  return {
    ...context,
    mode: 'typescript',
    tsCallDepth: 1,
    vibeCallDepthOnTsEntry: vibeCallDepth,
    currentTsBlockId: tsBlockId,
    currentTsImport: null,
  };
}

/**
 * Enter imported TS function mode
 */
export function enterTsImport(
  context: DebugExecutionContext,
  tsImportName: string,
  vibeCallDepth: number
): DebugExecutionContext {
  return {
    ...context,
    mode: 'typescript',
    tsCallDepth: 1,
    vibeCallDepthOnTsEntry: vibeCallDepth,
    currentTsBlockId: null,
    currentTsImport: tsImportName,
  };
}

/**
 * Return to Vibe mode
 */
export function exitTsMode(context: DebugExecutionContext): DebugExecutionContext {
  return {
    ...context,
    mode: 'vibe',
    tsCallDepth: 0,
    vibeCallDepthOnTsEntry: 0,
    currentTsBlockId: null,
    currentTsImport: null,
  };
}

/**
 * Increment TS call depth (when stepping into TS functions)
 */
export function incrementTsCallDepth(context: DebugExecutionContext): DebugExecutionContext {
  return {
    ...context,
    tsCallDepth: context.tsCallDepth + 1,
  };
}

/**
 * Decrement TS call depth (when stepping out of TS functions)
 */
export function decrementTsCallDepth(context: DebugExecutionContext): DebugExecutionContext {
  const newDepth = context.tsCallDepth - 1;
  if (newDepth <= 0) {
    // Returning to Vibe
    return exitTsMode(context);
  }
  return {
    ...context,
    tsCallDepth: newDepth,
  };
}

/**
 * Merge Vibe and TS stack frames
 *
 * When in TS mode, the stack looks like:
 * - TS frames from Bun inspector (top of stack)
 * - Vibe frames from runtime (below)
 *
 * We merge them into a single unified stack.
 */
export function mergeStackFrames(
  vibeFrames: StackFrame[],
  tsFrames: StackFrame[],
  context: DebugExecutionContext
): MergedStackFrame[] {
  const merged: MergedStackFrame[] = [];

  if (context.mode === 'vibe') {
    // In pure Vibe mode, just return Vibe frames
    for (const frame of vibeFrames) {
      merged.push({
        ...frame,
        origin: 'vibe',
      });
    }
  } else {
    // In TS mode, merge frames
    // TS frames go on top (most recent)
    for (const frame of tsFrames) {
      merged.push({
        ...frame,
        origin: 'typescript',
        tsBlockMappingId: context.currentTsBlockId ?? undefined,
      });
    }

    // Then Vibe frames (skip frames above where we entered TS)
    // The Vibe frames below the entry point are still valid
    const vibeFramesToShow = vibeFrames.slice(0, vibeFrames.length - context.vibeCallDepthOnTsEntry + 1);
    for (const frame of vibeFramesToShow) {
      merged.push({
        ...frame,
        origin: 'vibe',
      });
    }
  }

  // Reassign IDs sequentially
  merged.forEach((frame, index) => {
    frame.id = index;
  });

  return merged;
}

/**
 * Get unified stack trace from both Vibe runtime and TS inspector
 */
export function getUnifiedStackTrace(
  runtimeState: RuntimeState,
  tsFrames: StackFrame[] | null,
  context: DebugExecutionContext
): { stackFrames: MergedStackFrame[]; totalFrames: number } {
  const { stackFrames: vibeFrames } = getStackTrace(runtimeState);

  const merged = mergeStackFrames(
    vibeFrames,
    tsFrames ?? [],
    context
  );

  return {
    stackFrames: merged,
    totalFrames: merged.length,
  };
}

/**
 * Determine if we should hand off to TS debugger
 * Called when stepping into code
 */
export function shouldHandoffToTs(
  runtimeState: RuntimeState,
  currentLocation: SourceLocation
): { shouldHandoff: boolean; reason: 'ts_block' | 'ts_import' | null; target?: string } {
  // Check if the current instruction is about to execute a TS block
  const instruction = runtimeState.instructionStack[0];
  if (!instruction) {
    return { shouldHandoff: false, reason: null };
  }

  // Check for ts block execution
  if (instruction.type === 'awaiting_ts' && runtimeState.pendingTS) {
    return {
      shouldHandoff: true,
      reason: 'ts_block',
      target: `ts_block_at_${currentLocation.line}`,
    };
  }

  // Check for imported TS function call
  if (instruction.type === 'awaiting_ts' && runtimeState.pendingImportedTsCall) {
    return {
      shouldHandoff: true,
      reason: 'ts_import',
      target: runtimeState.pendingImportedTsCall.funcName,
    };
  }

  return { shouldHandoff: false, reason: null };
}

/**
 * Determine if we should return control to Vibe debugger
 * Called when TS execution completes
 */
export function shouldReturnToVibe(
  context: DebugExecutionContext,
  tsCallDepth: number
): boolean {
  // If we're at or below the entry depth, return to Vibe
  return context.mode === 'typescript' && tsCallDepth <= 0;
}

/**
 * Get the appropriate frame ID for variable requests
 * Maps unified frame IDs back to origin-specific IDs
 */
export function getFrameIdForOrigin(
  mergedFrames: MergedStackFrame[],
  unifiedFrameId: number
): { origin: FrameOrigin; frameId: number; cdpCallFrameId?: string } | null {
  const frame = mergedFrames[unifiedFrameId];
  if (!frame) return null;

  return {
    origin: frame.origin,
    frameId: frame.id,
    cdpCallFrameId: frame.cdpCallFrameId,
  };
}
