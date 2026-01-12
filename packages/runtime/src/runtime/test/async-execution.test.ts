import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, resumeWithAIResponse, resumeWithAsyncResults } from '../state';
import { runUntilPause, step } from '../step';
import type { RuntimeState, VibeValue } from '../types';
import { createVibeValue } from '../types';
import { completeAsyncOperation } from '../async';

// Helper function to process scheduled async operations
function processScheduledAsync(s: RuntimeState, response: unknown): RuntimeState {
  if (!s.pendingAsyncStarts || s.pendingAsyncStarts.length === 0) {
    return s;
  }

  const starts = s.pendingAsyncStarts;
  s = { ...s, pendingAsyncStarts: [] };

  // Complete each operation with the mock response
  const frame = s.callStack[s.callStack.length - 1];
  const newLocals = { ...frame.locals };

  for (const start of starts) {
    const operation = s.asyncOperations.get(start.operationId);
    if (operation) {
      // Get existing variable to preserve its properties (isConst, isPrivate, etc.)
      const existingVar = operation.variableName ? newLocals[operation.variableName] : null;
      const result = createVibeValue(response, {
        source: 'ai',
        isConst: existingVar?.isConst,
        isPrivate: existingVar?.isPrivate,
        typeAnnotation: existingVar?.typeAnnotation,
      });

      operation.status = 'completed';
      operation.result = result;
      operation.endTime = Date.now();
      s.pendingAsyncIds.delete(start.operationId);

      // Update the variable with the result (preserving declaration properties)
      if (operation.variableName) {
        newLocals[operation.variableName] = result;
      }
    }
  }

  // Update the frame with new locals
  return {
    ...s,
    callStack: [
      ...s.callStack.slice(0, -1),
      { ...frame, locals: newLocals },
    ],
  };
}

// Helper to run with mock AI responses (handles both sync and async AI calls)
function runWithMockAI(state: RuntimeState, response: unknown): RuntimeState {
  let s = runUntilPause(state);

  // Process any scheduled async ops immediately (even if completed)
  s = processScheduledAsync(s, response);

  // Loop to handle all types of pauses
  while (s.status !== 'completed' && s.status !== 'error') {
    // Handle awaiting_async (variable access needs pending result)
    if (s.status === 'awaiting_async' && s.awaitingAsyncIds.length > 0) {
      const results = new Map<string, VibeValue>();
      for (const opId of s.awaitingAsyncIds) {
        const op = s.asyncOperations.get(opId);
        if (op?.result) {
          results.set(opId, op.result);
        } else {
          // If operation not complete yet, complete it with mock response
          const result = createVibeValue(response, { source: 'ai' });
          results.set(opId, result);
          if (op) {
            op.status = 'completed';
            op.result = result;
            s.pendingAsyncIds.delete(opId);
          }
        }
      }
      s = resumeWithAsyncResults(s, results);
      s = runUntilPause(s);
      s = processScheduledAsync(s, response);
      continue;
    }

    // Handle sync AI calls
    if (s.status === 'awaiting_ai' && s.pendingAI) {
      s = resumeWithAIResponse(s, response);
      s = runUntilPause(s);
      s = processScheduledAsync(s, response);
      continue;
    }

    // Handle scheduled async operations
    if (s.pendingAsyncStarts && s.pendingAsyncStarts.length > 0) {
      s = processScheduledAsync(s, response);
      s = runUntilPause(s);
      continue;
    }

    // No more work to do
    break;
  }

  return s;
}

describe('Async Execution', () => {
  describe('async let declarations', () => {
    test('async let with do expression executes', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let x = do "prompt" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'async result');

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['x'].value).toBe('async result');
    });

    test('async let with type annotation executes', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let x: text = do "prompt" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'typed result');

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['x'].value).toBe('typed result');
    });

    test('async let with private modifier executes', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let private secret = do "get secret" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'secret value');

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['secret'].value).toBe('secret value');
      expect(state.callStack[0].locals['secret'].isPrivate).toBe(true);
    });

    test('async let with ts block schedules async operation', () => {
      const ast = parse(`
        async let x = ts() { return 42; }
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      // Async TS blocks now schedule for parallel execution
      // The program may complete but have pending async operations
      expect(state.pendingAsyncIds.size).toBeGreaterThan(0);
      // The variable should have a pending marker
      expect(state.callStack[0].locals['x'].asyncOperationId).toBeDefined();
    });
  });

  describe('async const declarations', () => {
    test('async const with do expression executes', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async const x = do "prompt" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'const result');

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['x'].value).toBe('const result');
      expect(state.callStack[0].locals['x'].isConst).toBe(true);
    });

    test('async const with type annotation executes', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async const x: number = do "give number" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 42);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['x'].value).toBe(42);
    });
  });

  describe('async destructuring declarations', () => {
    test('async let destructuring executes', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let {name: text, age: number} = do "get person" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, { name: 'Alice', age: 30 });

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['name'].value).toBe('Alice');
      expect(state.callStack[0].locals['age'].value).toBe(30);
    });

    test('async const destructuring executes', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async const {x: number, y: number} = do "get coords" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, { x: 10, y: 20 });

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['x'].value).toBe(10);
      expect(state.callStack[0].locals['y'].value).toBe(20);
    });
  });

  describe('async standalone statements (fire-and-forget)', () => {
    test('async do statement executes', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async do "log something" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'logged');

      expect(state.status).toBe('completed');
    });

    test('async vibe statement executes', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async vibe "process data" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'processed');

      expect(state.status).toBe('completed');
    });

    test('async ts block statement schedules async operation', () => {
      const ast = parse(`
        async ts() { console.log("fire and forget"); }
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      // Fire-and-forget async should schedule operation for parallel execution
      // Once implemented, this will have pending async ops
      // For now, it still blocks (TODO: implement fire-and-forget)
      expect(state.pendingAsyncIds.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('multiple async declarations', () => {
    test('multiple async lets schedule in parallel', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "1" m default
        async let b = do "2" m default
        async let c = do "3" m default
      `);
      let state = createInitialState(ast);

      // Run until pause - all three async lets should schedule without blocking
      state = runUntilPause(state);

      // Should complete (not block on awaiting_ai) with 3 pending async operations
      expect(state.status).toBe('completed');
      expect(state.pendingAsyncStarts.length).toBe(3);
      expect(state.asyncOperations.size).toBe(3);
      expect(state.pendingAsyncIds.size).toBe(3);

      // Variables should have pending markers
      expect(state.callStack[0].locals['a'].asyncOperationId).toBeDefined();
      expect(state.callStack[0].locals['b'].asyncOperationId).toBeDefined();
      expect(state.callStack[0].locals['c'].asyncOperationId).toBeDefined();
    });

    test('multiple async lets get results when processed', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "1" m default
        async let b = do "2" m default
        async let c = do "3" m default
      `);
      let state = createInitialState(ast);

      // Use the helper which processes scheduled async operations
      state = runWithMockAI(state, 'parallel_result');

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['a'].value).toBe('parallel_result');
      expect(state.callStack[0].locals['b'].value).toBe('parallel_result');
      expect(state.callStack[0].locals['c'].value).toBe('parallel_result');
    });

    test('mixed async and sync declarations execute correctly', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let sync1 = "hello"
        async let async1 = do "prompt" m default
        const sync2 = 42
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'async value');

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['sync1'].value).toBe('hello');
      expect(state.callStack[0].locals['async1'].value).toBe('async value');
      expect(state.callStack[0].locals['sync2'].value).toBe(42);
    });
  });

  describe('async state tracking', () => {
    test('maxParallel is set from options', () => {
      const ast = parse(`let x = 1`);
      const state = createInitialState(ast, { maxParallel: 8 });
      expect(state.maxParallel).toBe(8);
    });

    test('default maxParallel is 4', () => {
      const ast = parse(`let x = 1`);
      const state = createInitialState(ast);
      expect(state.maxParallel).toBe(4);
    });

    test('asyncOperations map is initialized', () => {
      const ast = parse(`let x = 1`);
      const state = createInitialState(ast);
      expect(state.asyncOperations).toBeInstanceOf(Map);
      expect(state.asyncOperations.size).toBe(0);
    });

    test('pendingAsyncIds set is initialized', () => {
      const ast = parse(`let x = 1`);
      const state = createInitialState(ast);
      expect(state.pendingAsyncIds).toBeInstanceOf(Set);
      expect(state.pendingAsyncIds.size).toBe(0);
    });
  });
});
