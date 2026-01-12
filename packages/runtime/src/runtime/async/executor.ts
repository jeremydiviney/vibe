/**
 * Async execution engine.
 * Executes async operations in waves with throttling.
 */

import type { RuntimeState, AsyncOperation, AsyncWave, VibeValue, VibeError, ContextEntry } from '../types';
import { createVibeValue, createVibeError } from '../types';

/**
 * Simple semaphore for limiting concurrent operations.
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

/**
 * Result of executing an async operation.
 */
export interface AsyncExecutionResult {
  operationId: string;
  result?: VibeValue;
  error?: VibeError;
}

/**
 * Executor function type for running a single async operation.
 * This will be provided by the runtime to handle different operation types.
 */
export type AsyncOperationExecutor = (
  operation: AsyncOperation,
  contextSnapshot: ContextEntry[]
) => Promise<VibeValue>;

/**
 * Executes all operations in a wave with parallelism throttling.
 * Returns the results of all operations.
 */
export async function executeWave(
  wave: AsyncWave,
  operations: Map<string, AsyncOperation>,
  executor: AsyncOperationExecutor,
  maxParallel: number
): Promise<AsyncExecutionResult[]> {
  const semaphore = new Semaphore(maxParallel);
  const startTime = Date.now();

  // Update wave start time
  wave.startTime = startTime;

  const results = await Promise.all(
    wave.operationIds.map(async (opId) => {
      const operation = operations.get(opId);
      if (!operation) {
        return {
          operationId: opId,
          error: {
            message: `Operation ${opId} not found`,
            type: 'InternalError',
            location: null,
          },
        };
      }

      await semaphore.acquire();

      try {
        // Update operation status
        operation.status = 'running';
        operation.startTime = Date.now();

        // Execute the operation
        const result = await executor(operation, wave.contextSnapshot);

        // Update operation with result
        operation.status = 'completed';
        operation.endTime = Date.now();
        operation.result = result;

        return { operationId: opId, result };
      } catch (err) {
        // Handle exceptions (these crash the program per design)
        const error: VibeError = {
          message: err instanceof Error ? err.message : String(err),
          type: err instanceof Error ? err.constructor.name : 'Error',
          location: null,
          stack: err instanceof Error ? err.stack : undefined,
        };

        operation.status = 'failed';
        operation.endTime = Date.now();
        operation.error = error;

        return { operationId: opId, error };
      } finally {
        semaphore.release();
      }
    })
  );

  wave.endTime = Date.now();
  return results;
}

/**
 * Awaits specific async operations by their IDs.
 * Returns when all specified operations are complete.
 */
export async function awaitOperations(
  operationIds: string[],
  operations: Map<string, AsyncOperation>
): Promise<Map<string, VibeValue>> {
  const results = new Map<string, VibeValue>();

  for (const opId of operationIds) {
    const operation = operations.get(opId);
    if (!operation) {
      results.set(opId, createVibeError(`Operation ${opId} not found`));
      continue;
    }

    // If operation has a promise, wait for it
    if (operation.promise) {
      try {
        const result = await operation.promise;
        results.set(opId, result);
      } catch (err) {
        results.set(opId, createVibeError(err instanceof Error ? err : String(err)));
      }
    } else if (operation.result) {
      // Already completed
      results.set(opId, operation.result);
    } else if (operation.error) {
      // Already failed
      results.set(opId, createVibeError(operation.error.message));
    } else {
      // Operation not started yet - this shouldn't happen
      results.set(opId, createVibeError(`Operation ${opId} has not started`));
    }
  }

  return results;
}

/**
 * Awaits all pending async operations in the state.
 * Used at block boundaries and before sync instructions that need async results.
 */
export async function awaitAllPending(
  state: RuntimeState
): Promise<Map<string, VibeValue>> {
  const pendingIds = Array.from(state.pendingAsyncIds);
  return awaitOperations(pendingIds, state.asyncOperations);
}

/**
 * Awaits async operations that a variable depends on.
 * Used for implicit await when a variable's value is needed.
 */
export async function awaitVariable(
  variableName: string,
  state: RuntimeState
): Promise<VibeValue | null> {
  const opId = state.asyncVarToOpId.get(variableName);
  if (!opId) {
    return null; // Not an async variable
  }

  if (!state.pendingAsyncIds.has(opId)) {
    // Already completed
    const operation = state.asyncOperations.get(opId);
    return operation?.result ?? null;
  }

  const results = await awaitOperations([opId], state.asyncOperations);
  return results.get(opId) ?? null;
}

/**
 * Generates a unique async operation ID.
 * Note: Caller is responsible for incrementing state.nextAsyncId.
 */
export function generateAsyncId(state: RuntimeState): string {
  return `async-${String(state.nextAsyncId).padStart(6, '0')}`;
}

/**
 * Registers a new async operation in the state.
 */
export function registerAsyncOperation(
  state: RuntimeState,
  operation: Omit<AsyncOperation, 'id' | 'waveId'>
): AsyncOperation {
  const id = generateAsyncId(state);
  const fullOperation: AsyncOperation = {
    ...operation,
    id,
    waveId: state.currentWaveId,
  };

  state.asyncOperations.set(id, fullOperation);
  state.pendingAsyncIds.add(id);

  if (operation.variableName) {
    state.asyncVarToOpId.set(operation.variableName, id);
  }

  return fullOperation;
}

/**
 * Marks an async operation as complete and removes from pending.
 */
export function completeAsyncOperation(
  state: RuntimeState,
  operationId: string,
  result: VibeValue
): void {
  const operation = state.asyncOperations.get(operationId);
  if (operation) {
    operation.status = 'completed';
    operation.endTime = Date.now();
    operation.result = result;
  }
  state.pendingAsyncIds.delete(operationId);
}

/**
 * Marks an async operation as failed and removes from pending.
 */
export function failAsyncOperation(
  state: RuntimeState,
  operationId: string,
  error: VibeError
): void {
  const operation = state.asyncOperations.get(operationId);
  if (operation) {
    operation.status = 'failed';
    operation.endTime = Date.now();
    operation.error = error;
  }
  state.pendingAsyncIds.delete(operationId);
}

/**
 * Checks if any async operations are still pending.
 */
export function hasPendingAsync(state: RuntimeState): boolean {
  return state.pendingAsyncIds.size > 0;
}

/**
 * Gets the IDs of pending async operations that a list of variables depend on.
 */
export function getPendingDependencies(
  variableNames: string[],
  state: RuntimeState
): string[] {
  const deps: string[] = [];

  for (const varName of variableNames) {
    const opId = state.asyncVarToOpId.get(varName);
    if (opId && state.pendingAsyncIds.has(opId)) {
      deps.push(opId);
    }
  }

  return deps;
}
