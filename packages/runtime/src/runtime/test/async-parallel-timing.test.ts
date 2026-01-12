import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, type AIProvider, type AIExecutionResult } from '../index';

// Mock AI provider that uses delays to simulate network latency
function createDelayedMockAI(delayMs: number, responseValue: unknown = 'response'): AIProvider {
  return {
    async execute(prompt: string): Promise<AIExecutionResult> {
      await Bun.sleep(delayMs);
      return { value: responseValue };
    },
    async generateCode(prompt: string): Promise<AIExecutionResult> {
      await Bun.sleep(delayMs);
      return { value: `let x = 1;` };
    },
    async askUser(prompt: string): Promise<string> {
      return 'user input';
    },
  };
}

// Mock AI provider that returns different values based on prompt
function createMultiResponseMockAI(delayMs: number, responses: Record<string, unknown>): AIProvider {
  return {
    async execute(prompt: string): Promise<AIExecutionResult> {
      await Bun.sleep(delayMs);
      // Find matching response key in prompt
      for (const [key, value] of Object.entries(responses)) {
        if (prompt.includes(key)) {
          return { value };
        }
      }
      return { value: 'default' };
    },
    async generateCode(prompt: string): Promise<AIExecutionResult> {
      await Bun.sleep(delayMs);
      return { value: `let x = 1;` };
    },
    async askUser(prompt: string): Promise<string> {
      return 'user input';
    },
  };
}

describe('Async Parallel Execution Timing', () => {
  describe('parallel AI calls', () => {
    test('multiple async AI calls run in parallel (timing)', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "prompt1" m default
        async let b = do "prompt2" m default
        async let c = do "prompt3" m default
        let result = a + " " + b + " " + c
      `);

      const delayMs = 100;
      const aiProvider = createDelayedMockAI(delayMs, 'result');
      const runtime = new Runtime(ast, aiProvider);

      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      // If running in parallel, should take ~100ms (+ overhead)
      // If running sequentially, would take ~300ms
      // Allow some margin for overhead
      expect(elapsed).toBeLessThan(250); // Much less than 300ms sequential time
      expect(runtime.getValue('result')).toBe('result result result');
    });

    test('async calls with different responses', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "get_A" m default
        async let b = do "get_B" m default
        async let c = do "get_C" m default
        let result = a + b + c
      `);

      const delayMs = 50;
      const aiProvider = createMultiResponseMockAI(delayMs, {
        'get_A': 'A',
        'get_B': 'B',
        'get_C': 'C',
      });
      const runtime = new Runtime(ast, aiProvider);

      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      // Parallel execution should be fast
      expect(elapsed).toBeLessThan(150);
      expect(runtime.getValue('result')).toBe('ABC');
    });

    test('six parallel calls with maxParallel=4 (throttling)', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "1" m default
        async let b = do "2" m default
        async let c = do "3" m default
        async let d = do "4" m default
        async let e = do "5" m default
        async let f = do "6" m default
        let result = a + b + c + d + e + f
      `);

      const delayMs = 50;
      const aiProvider = createDelayedMockAI(delayMs, 'x');
      const runtime = new Runtime(ast, aiProvider, { maxParallel: 4 });

      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      // With maxParallel=4 and 6 operations each taking 50ms:
      // Wave 1: 4 parallel (50ms)
      // Wave 2: 2 parallel (50ms)
      // Total: ~100ms (+ overhead), definitely less than 6*50=300ms
      expect(elapsed).toBeLessThan(200);
      expect(runtime.getValue('result')).toBe('xxxxxx');
    });
  });

  describe('execution order', () => {
    test('sync operations before async are executed first', async () => {
      // Track execution order
      const executionOrder: string[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let sync1 = "first"
        async let async1 = do "async_op" m default
        let sync2 = "second"
        let result = sync1 + " " + sync2
      `);

      const aiProvider: AIProvider = {
        async execute(prompt: string): Promise<AIExecutionResult> {
          executionOrder.push('ai_start');
          await Bun.sleep(50);
          executionOrder.push('ai_end');
          return { value: 'async_result' };
        },
        async generateCode(): Promise<AIExecutionResult> {
          return { value: '' };
        },
        async askUser(): Promise<string> {
          return '';
        },
      };

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // Sync operations should complete before waiting for async
      expect(runtime.getValue('sync1')).toBe('first');
      expect(runtime.getValue('sync2')).toBe('second');
      expect(runtime.getValue('result')).toBe('first second');
    });

    test('implicit await when using async variable', async () => {
      const executionLog: string[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let x = do "get_x" m default
        let y = x + "_used"
      `);

      const aiProvider: AIProvider = {
        async execute(prompt: string): Promise<AIExecutionResult> {
          executionLog.push('ai_called');
          await Bun.sleep(50);
          executionLog.push('ai_returned');
          return { value: 'async_value' };
        },
        async generateCode(): Promise<AIExecutionResult> {
          return { value: '' };
        },
        async askUser(): Promise<string> {
          return '';
        },
      };

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // Variable y should have awaited x
      expect(runtime.getValue('y')).toBe('async_value_used');
      expect(executionLog).toContain('ai_returned');
    });

    test('destructuring waits for single AI call', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let {name: text, age: number} = do "get_person" m default
        let greeting = "Hello " + name
      `);

      const aiProvider: AIProvider = {
        async execute(prompt: string): Promise<AIExecutionResult> {
          await Bun.sleep(50);
          return { value: { name: 'Alice', age: 30 } };
        },
        async generateCode(): Promise<AIExecutionResult> {
          return { value: '' };
        },
        async askUser(): Promise<string> {
          return '';
        },
      };

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('name')).toBe('Alice');
      expect(runtime.getValue('age')).toBe(30);
      expect(runtime.getValue('greeting')).toBe('Hello Alice');
    });
  });

  describe('mixed async operations', () => {
    test('async and sync declarations interleaved', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let a = 1
        async let b = do "get_b" m default
        let c = 2
        async let d = do "get_d" m default
        let e = 3
        let sum = a + c + e
      `);

      const delayMs = 50;
      const aiProvider = createMultiResponseMockAI(delayMs, {
        'get_b': 'B',
        'get_d': 'D',
      });

      const runtime = new Runtime(ast, aiProvider);
      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      // Sync operations should complete quickly
      expect(runtime.getValue('sum')).toBe(6);
      // Async operations should complete in parallel
      expect(elapsed).toBeLessThan(150);
    });

    test('multiple async destructurings run in parallel', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let {x: number, y: number} = do "get_coords" m default
        async let {name: text, age: number} = do "get_person" m default
        let result = name + " at " + x + "," + y
      `);

      const delayMs = 75;
      const aiProvider: AIProvider = {
        async execute(prompt: string): Promise<AIExecutionResult> {
          await Bun.sleep(delayMs);
          if (prompt.includes('coords')) {
            return { value: { x: 10, y: 20 } };
          }
          return { value: { name: 'Bob', age: 25 } };
        },
        async generateCode(): Promise<AIExecutionResult> {
          return { value: '' };
        },
        async askUser(): Promise<string> {
          return '';
        },
      };

      const runtime = new Runtime(ast, aiProvider);
      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      // Both should run in parallel
      expect(elapsed).toBeLessThan(200); // Less than 150ms * 2 = 300ms
      expect(runtime.getValue('result')).toBe('Bob at 10,20');
    });
  });

  describe('async const declarations', () => {
    test('async const preserves const property', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async const x = do "get_value" m default
        let y = x + "_suffix"
      `);

      const aiProvider = createDelayedMockAI(50, 'const_value');
      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('x')).toBe('const_value');
      expect(runtime.getValue('y')).toBe('const_value_suffix');

      // Verify const property is preserved
      const state = runtime.getState();
      expect(state.callStack[0].locals['x'].isConst).toBe(true);
    });

    test('multiple async consts in parallel', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async const a = do "get_a" m default
        async const b = do "get_b" m default
        async const c = do "get_c" m default
        let result = a + b + c
      `);

      const delayMs = 60;
      const aiProvider = createMultiResponseMockAI(delayMs, {
        'get_a': '1',
        'get_b': '2',
        'get_c': '3',
      });

      const runtime = new Runtime(ast, aiProvider);
      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(150); // Parallel, not 180ms
      expect(runtime.getValue('result')).toBe('123');
    });
  });

  describe('private async declarations', () => {
    test('async let private preserves private property', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let private secret = do "get_secret" m default
        let visible = "public"
      `);

      const aiProvider = createDelayedMockAI(50, 'secret_value');
      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('secret')).toBe('secret_value');

      // Verify private property is preserved
      const state = runtime.getState();
      expect(state.callStack[0].locals['secret'].isPrivate).toBe(true);
    });
  });

  describe('standalone async (fire-and-forget)', () => {
    test('standalone async do executes', async () => {
      let aiCalled = false;

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async do "fire_and_forget" m default
        let x = "done"
      `);

      const aiProvider: AIProvider = {
        async execute(prompt: string): Promise<AIExecutionResult> {
          aiCalled = true;
          await Bun.sleep(50);
          return { value: 'ignored' };
        },
        async generateCode(): Promise<AIExecutionResult> {
          return { value: '' };
        },
        async askUser(): Promise<string> {
          return '';
        },
      };

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(aiCalled).toBe(true);
      expect(runtime.getValue('x')).toBe('done');
    });
  });

  describe('error handling in parallel', () => {
    test('error in one async does not block others', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let good1 = do "good1" m default
        async let bad = do "bad" m default
        async let good2 = do "good2" m default
      `);

      let callCount = 0;
      const aiProvider: AIProvider = {
        async execute(prompt: string): Promise<AIExecutionResult> {
          callCount++;
          await Bun.sleep(30);
          if (prompt.includes('bad')) {
            throw new Error('Simulated failure');
          }
          return { value: 'success' };
        },
        async generateCode(): Promise<AIExecutionResult> {
          return { value: '' };
        },
        async askUser(): Promise<string> {
          return '';
        },
      };

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // All three should have been called
      expect(callCount).toBe(3);

      // Good ones should have results
      expect(runtime.getValue('good1')).toBe('success');
      expect(runtime.getValue('good2')).toBe('success');

      // Bad one should have error in VibeValue
      const state = runtime.getState();
      expect(state.callStack[0].locals['bad'].err).toBeDefined();
      expect(state.callStack[0].locals['bad'].err?.message).toBe('Simulated failure');
    });
  });
});
