import { describe, expect, test } from 'bun:test';
import type { AsyncOperation, AsyncWave, RuntimeState, VibeValue } from '../../types';
import { createVibeValue } from '../../types';
import {
  executeWave,
  awaitOperations,
  registerAsyncOperation,
  completeAsyncOperation,
  failAsyncOperation,
  hasPendingAsync,
  getPendingDependencies,
  generateAsyncId,
} from '../executor';

describe('Async Executor', () => {
  // Helper to create a mock runtime state
  function createMockState(overrides: Partial<RuntimeState> = {}): RuntimeState {
    return {
      status: 'running',
      program: { type: 'Program', body: [], location: { line: 1, column: 1 } },
      functions: {},
      tsModules: {},
      vibeModules: {},
      importedNames: {},
      callStack: [],
      instructionStack: [],
      valueStack: [],
      lastResult: null,
      lastResultSource: null,
      aiHistory: [],
      executionLog: [],
      logAiInteractions: false,
      aiInteractions: [],
      localContext: [],
      globalContext: [],
      pendingAI: null,
      pendingCompress: null,
      pendingTS: null,
      pendingImportedTsCall: null,
      pendingToolCall: null,
      pendingDestructuring: null,
      expectedFields: null,
      lastUsedModel: null,
      rootDir: '/tmp',
      error: null,
      errorObject: null,
      asyncOperations: new Map(),
      pendingAsyncIds: new Set(),
      asyncVarToOpId: new Map(),
      asyncWaves: [],
      currentWaveId: 0,
      maxParallel: 4,
      nextAsyncId: 1,
      ...overrides,
    };
  }

  // Helper to create an async operation
  function createOp(
    id: string,
    varName: string | null,
    deps: string[] = []
  ): AsyncOperation {
    return {
      id,
      variableName: varName,
      status: 'pending',
      operationType: 'do',
      dependencies: deps,
      contextSnapshot: [],
      waveId: 0,
    };
  }

  describe('generateAsyncId', () => {
    test('generates ID based on nextAsyncId', () => {
      const state1 = createMockState({ nextAsyncId: 1 });
      expect(generateAsyncId(state1)).toBe('async-000001');

      const state2 = createMockState({ nextAsyncId: 2 });
      expect(generateAsyncId(state2)).toBe('async-000002');

      const state3 = createMockState({ nextAsyncId: 3 });
      expect(generateAsyncId(state3)).toBe('async-000003');
    });

    test('pads ID with zeros', () => {
      const state = createMockState({ nextAsyncId: 100 });
      expect(generateAsyncId(state)).toBe('async-000100');
    });

    test('is a pure function (does not mutate state)', () => {
      const state = createMockState({ nextAsyncId: 42 });
      generateAsyncId(state);
      expect(state.nextAsyncId).toBe(42);  // Unchanged
    });
  });

  describe('registerAsyncOperation', () => {
    test('registers operation with generated ID', () => {
      const state = createMockState();
      const op = registerAsyncOperation(state, {
        variableName: 'x',
        status: 'pending',
        operationType: 'do',
        dependencies: [],
        contextSnapshot: [],
      });

      expect(op.id).toBe('async-000001');
      expect(state.asyncOperations.has('async-000001')).toBe(true);
    });

    test('adds operation to pendingAsyncIds', () => {
      const state = createMockState();
      const op = registerAsyncOperation(state, {
        variableName: 'x',
        status: 'pending',
        operationType: 'do',
        dependencies: [],
        contextSnapshot: [],
      });

      expect(state.pendingAsyncIds.has(op.id)).toBe(true);
    });

    test('maps variable name to operation ID', () => {
      const state = createMockState();
      const op = registerAsyncOperation(state, {
        variableName: 'myVar',
        status: 'pending',
        operationType: 'do',
        dependencies: [],
        contextSnapshot: [],
      });

      expect(state.asyncVarToOpId.get('myVar')).toBe(op.id);
    });

    test('handles null variableName (fire-and-forget)', () => {
      const state = createMockState();
      const op = registerAsyncOperation(state, {
        variableName: null,
        status: 'pending',
        operationType: 'do',
        dependencies: [],
        contextSnapshot: [],
      });

      expect(op.id).toBeDefined();
      expect(state.asyncVarToOpId.size).toBe(0);
    });
  });

  describe('completeAsyncOperation', () => {
    test('marks operation as completed', () => {
      const state = createMockState();
      const op = createOp('async-001', 'x');
      state.asyncOperations.set('async-001', op);
      state.pendingAsyncIds.add('async-001');

      const result = createVibeValue('success');
      completeAsyncOperation(state, 'async-001', result);

      expect(op.status).toBe('completed');
      expect(op.result).toBe(result);
      expect(state.pendingAsyncIds.has('async-001')).toBe(false);
    });

    test('sets endTime', () => {
      const state = createMockState();
      const op = createOp('async-001', 'x');
      state.asyncOperations.set('async-001', op);
      state.pendingAsyncIds.add('async-001');

      completeAsyncOperation(state, 'async-001', createVibeValue('success'));

      expect(op.endTime).toBeDefined();
    });
  });

  describe('failAsyncOperation', () => {
    test('marks operation as failed', () => {
      const state = createMockState();
      const op = createOp('async-001', 'x');
      state.asyncOperations.set('async-001', op);
      state.pendingAsyncIds.add('async-001');

      const error = { message: 'Test error', type: 'Error', location: null };
      failAsyncOperation(state, 'async-001', error);

      expect(op.status).toBe('failed');
      expect(op.error).toBe(error);
      expect(state.pendingAsyncIds.has('async-001')).toBe(false);
    });
  });

  describe('hasPendingAsync', () => {
    test('returns false when no pending operations', () => {
      const state = createMockState();
      expect(hasPendingAsync(state)).toBe(false);
    });

    test('returns true when operations are pending', () => {
      const state = createMockState();
      state.pendingAsyncIds.add('async-001');
      expect(hasPendingAsync(state)).toBe(true);
    });
  });

  describe('getPendingDependencies', () => {
    test('returns empty array when no variables depend on async', () => {
      const state = createMockState();
      expect(getPendingDependencies(['x', 'y'], state)).toEqual([]);
    });

    test('returns pending operation IDs', () => {
      const state = createMockState();
      state.asyncVarToOpId.set('x', 'async-001');
      state.asyncVarToOpId.set('y', 'async-002');
      state.pendingAsyncIds.add('async-001');
      state.pendingAsyncIds.add('async-002');

      const deps = getPendingDependencies(['x', 'y', 'z'], state);
      expect(deps).toContain('async-001');
      expect(deps).toContain('async-002');
      expect(deps.length).toBe(2);
    });

    test('excludes completed operations', () => {
      const state = createMockState();
      state.asyncVarToOpId.set('x', 'async-001');
      state.asyncVarToOpId.set('y', 'async-002');
      state.pendingAsyncIds.add('async-001');
      // async-002 is not in pending (completed)

      const deps = getPendingDependencies(['x', 'y'], state);
      expect(deps).toEqual(['async-001']);
    });
  });

  describe('executeWave', () => {
    test('executes all operations in wave', async () => {
      const operations = new Map<string, AsyncOperation>();
      operations.set('async-001', createOp('async-001', 'a'));
      operations.set('async-002', createOp('async-002', 'b'));

      const wave: AsyncWave = {
        id: 0,
        operationIds: ['async-001', 'async-002'],
        contextSnapshot: [],
        startTime: 0,
      };

      const executor = async () => createVibeValue('result');
      const results = await executeWave(wave, operations, executor, 4);

      expect(results.length).toBe(2);
      expect(results.every((r) => r.result?.value === 'result')).toBe(true);
    });

    test('respects maxParallel limit', async () => {
      const operations = new Map<string, AsyncOperation>();
      for (let i = 0; i < 10; i++) {
        operations.set(`async-${i}`, createOp(`async-${i}`, `v${i}`));
      }

      const wave: AsyncWave = {
        id: 0,
        operationIds: Array.from(operations.keys()),
        contextSnapshot: [],
        startTime: 0,
      };

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const executor = async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 10));
        currentConcurrent--;
        return createVibeValue('result');
      };

      await executeWave(wave, operations, executor, 2);

      expect(maxConcurrent).toBe(2);
    });

    test('handles operation errors', async () => {
      const operations = new Map<string, AsyncOperation>();
      operations.set('async-001', createOp('async-001', 'a'));

      const wave: AsyncWave = {
        id: 0,
        operationIds: ['async-001'],
        contextSnapshot: [],
        startTime: 0,
      };

      const executor = async () => {
        throw new Error('Test error');
      };

      const results = await executeWave(wave, operations, executor, 4);

      expect(results.length).toBe(1);
      expect(results[0].error?.message).toBe('Test error');
      expect(operations.get('async-001')?.status).toBe('failed');
    });

    test('updates operation status to running during execution', async () => {
      const operations = new Map<string, AsyncOperation>();
      const op = createOp('async-001', 'a');
      operations.set('async-001', op);

      const wave: AsyncWave = {
        id: 0,
        operationIds: ['async-001'],
        contextSnapshot: [],
        startTime: 0,
      };

      let statusDuringExec = '';
      const executor = async () => {
        statusDuringExec = op.status;
        return createVibeValue('result');
      };

      await executeWave(wave, operations, executor, 4);

      expect(statusDuringExec).toBe('running');
      expect(op.status).toBe('completed');
    });

    test('sets wave timing information', async () => {
      const operations = new Map<string, AsyncOperation>();
      operations.set('async-001', createOp('async-001', 'a'));

      const wave: AsyncWave = {
        id: 0,
        operationIds: ['async-001'],
        contextSnapshot: [],
        startTime: 0,
      };

      const executor = async () => createVibeValue('result');
      await executeWave(wave, operations, executor, 4);

      expect(wave.startTime).toBeGreaterThan(0);
      expect(wave.endTime).toBeGreaterThanOrEqual(wave.startTime);
    });
  });

  describe('awaitOperations', () => {
    test('returns results for completed operations', async () => {
      const operations = new Map<string, AsyncOperation>();
      const op = createOp('async-001', 'a');
      op.status = 'completed';
      op.result = createVibeValue('completed result');
      operations.set('async-001', op);

      const results = await awaitOperations(['async-001'], operations);

      expect(results.get('async-001')?.value).toBe('completed result');
    });

    test('returns error for failed operations', async () => {
      const operations = new Map<string, AsyncOperation>();
      const op = createOp('async-001', 'a');
      op.status = 'failed';
      op.error = { message: 'Failed', type: 'Error', location: null };
      operations.set('async-001', op);

      const results = await awaitOperations(['async-001'], operations);

      expect(results.get('async-001')?.err).toBeDefined();
    });

    test('returns error for missing operations', async () => {
      const operations = new Map<string, AsyncOperation>();
      const results = await awaitOperations(['nonexistent'], operations);

      expect(results.get('nonexistent')?.err).toBeDefined();
    });
  });
});
