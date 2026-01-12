/**
 * Async execution module for parallel operations.
 *
 * This module provides:
 * - Dependency detection for async operations
 * - Wave-based execution with throttling
 * - Async operation scheduling helpers
 * - Utilities for managing async operation state
 */

// Dependency detection
export {
  getReferencedVariables,
  detectAsyncDependencies,
  buildExecutionWaves,
  getInstructionDependencies,
} from './dependencies';

// Execution engine
export {
  executeWave,
  awaitOperations,
  awaitAllPending,
  awaitVariable,
  generateAsyncId,
  registerAsyncOperation,
  completeAsyncOperation,
  failAsyncOperation,
  hasPendingAsync,
  getPendingDependencies,
} from './executor';

// Scheduling helpers
export {
  scheduleAsyncOperation,
  clearAsyncContext,
  isInAsyncContext,
  createAsyncVibeError,
  startAsyncOperation,
} from './scheduling';

export type { AsyncExecutionResult, AsyncOperationExecutor } from './executor';
export type { AsyncOperationDetails } from './scheduling';
