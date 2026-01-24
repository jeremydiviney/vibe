/**
 * Async scheduling helpers.
 * Consolidates the common pattern of scheduling async operations.
 */

import type { RuntimeState, AsyncOperation, PendingAsyncStart, VibeValue, VibeError, SourceLocation } from '../types';
import { createVibeValue } from '../types';
import { generateAsyncId } from './executor';

/**
 * Details for different async operation types (without operationId/variableName which are added by scheduleAsyncOperation).
 */
export type AsyncOperationDetails =
  | { type: 'do' | 'vibe'; prompt: string; model: string; context: unknown[]; operationType: 'do' | 'vibe' }
  | { type: 'ts'; params: string[]; body: string; paramValues: unknown[]; location: SourceLocation }
  | { type: 'ts-function'; funcName: string; args: unknown[]; location: SourceLocation }
  | { type: 'vibe-function'; funcName: string; args: unknown[]; modulePath?: string };

/**
 * Source type for VibeValue based on operation type.
 */
function getSourceFromType(type: string): 'ai' | 'ts' | 'vibe-function' {
  if (type === 'do' || type === 'vibe') return 'ai';
  if (type === 'ts' || type === 'ts-function') return 'ts';
  return 'vibe-function';
}

/**
 * Schedules an async operation and returns the updated state.
 * This consolidates the common pattern used across AI, TS, and Vibe function async scheduling.
 */
export function scheduleAsyncOperation(
  state: RuntimeState,
  details: AsyncOperationDetails,
  logInstructionType: string
): RuntimeState {
  const operationId = generateAsyncId(state);

  // Determine variable name (null for destructuring or fire-and-forget)
  const ctx = state.asyncContext!;
  const variableName = ctx.isDestructure || ctx.isFireAndForget
    ? null
    : ctx.varName;

  // Create async operation record
  const asyncOp: AsyncOperation = {
    id: operationId,
    variableName,
    status: 'pending',
    operationType: details.type,
    dependencies: [],
    contextSnapshot: [],
    waveId: state.currentWaveId,
  };

  // Create pending start record by combining common fields with operation-specific details
  const pendingStart: PendingAsyncStart = {
    ...details,
    operationId,
    variableName,
  };

  // Create pending marker for variable
  const pendingMarker: VibeValue = createVibeValue(null, {
    source: getSourceFromType(details.type),
    asyncOperationId: operationId,
  });

  // Update maps
  const newAsyncOps = new Map(state.asyncOperations);
  newAsyncOps.set(operationId, asyncOp);

  const newPendingIds = new Set(state.pendingAsyncIds);
  newPendingIds.add(operationId);

  const newVarToOp = new Map(state.asyncVarToOpId);
  if (variableName !== null) {
    newVarToOp.set(variableName, operationId);
  }

  return {
    ...state,
    // Clear async context
    ...clearAsyncContext(),
    // Set the pending marker as lastResult
    lastResult: pendingMarker,
    lastResultSource: getSourceFromType(details.type),
    // Track async operation
    asyncOperations: newAsyncOps,
    pendingAsyncIds: newPendingIds,
    asyncVarToOpId: newVarToOp,
    nextAsyncId: state.nextAsyncId + 1,
    // Schedule for start
    pendingAsyncStarts: [...state.pendingAsyncStarts, pendingStart],
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: logInstructionType,
        details: { operationId },
      },
    ],
  };
}

/**
 * Returns the properties needed to clear async context.
 * Used when exiting async scheduling mode.
 */
export function clearAsyncContext(): Partial<RuntimeState> {
  return { asyncContext: null };
}

/**
 * Checks if we're currently in an async context.
 */
export function isInAsyncContext(state: RuntimeState): boolean {
  return state.asyncContext !== null;
}

/**
 * Creates a VibeError from an error.
 */
export function createAsyncVibeError(error: unknown, location: { line: number; column: number } | null = null): VibeError {
  return {
    message: error instanceof Error ? error.message : String(error),
    type: error instanceof Error ? error.constructor.name : 'Error',
    location,
    stack: error instanceof Error ? error.stack : undefined,
  };
}

/**
 * Marks an async operation as running with its promise.
 * Consolidates the repeated pattern of setting promise, status, and startTime.
 */
export function startAsyncOperation(
  operation: { promise?: Promise<VibeValue>; status: string; startTime?: number },
  promise: Promise<VibeValue>
): void {
  operation.promise = promise;
  operation.status = 'running';
  operation.startTime = Date.now();
}
