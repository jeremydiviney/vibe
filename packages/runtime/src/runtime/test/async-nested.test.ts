import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, type AIProvider, type AIExecutionResult } from '../index';

// Track execution order and timing
interface ExecutionLog {
  event: string;
  time: number;
  prompt?: string;
}

// Create AI provider that logs execution and uses delays
function createLoggingMockAI(
  delayMs: number,
  responses: Record<string, unknown>,
  log: ExecutionLog[]
): AIProvider {
  const startTime = Date.now();
  return {
    async execute(prompt: string): Promise<AIExecutionResult> {
      log.push({ event: 'ai_start', time: Date.now() - startTime, prompt });
      await Bun.sleep(delayMs);
      log.push({ event: 'ai_end', time: Date.now() - startTime, prompt });

      // Find matching response
      for (const [key, value] of Object.entries(responses)) {
        if (prompt.includes(key)) {
          return { value };
        }
      }
      return { value: `response_to_${prompt}` };
    },
    async generateCode(): Promise<AIExecutionResult> {
      return { value: '' };
    },
    async askUser(): Promise<string> {
      return '';
    },
  };
}

describe('Nested Async Execution', () => {
  describe('async function with async operations inside', () => {
    test('vibe function with single async do inside', async () => {
      const log: ExecutionLog[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function getData() {
          async let result = do "fetch_data" m default
          return result
        }

        let data = getData()
      `);

      const aiProvider = createLoggingMockAI(50, {
        'fetch_data': 'fetched_data'
      }, log);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('data')).toBe('fetched_data');
    });

    test('vibe function with multiple async operations inside (parallel)', async () => {
      const log: ExecutionLog[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function fetchAll() {
          async let a = do "fetch_a" m default
          async let b = do "fetch_b" m default
          async let c = do "fetch_c" m default
          return a + b + c
        }

        let result = fetchAll()
      `);

      const aiProvider = createLoggingMockAI(50, {
        'fetch_a': 'A',
        'fetch_b': 'B',
        'fetch_c': 'C',
      }, log);

      const runtime = new Runtime(ast, aiProvider);
      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      expect(runtime.getValue('result')).toBe('ABC');
      // Should run in parallel inside function (~50ms, not 150ms)
      expect(elapsed).toBeLessThan(150);
    });

    test('async call to vibe function', async () => {
      const log: ExecutionLog[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function slowOperation() {
          let x = do "slow_op" m default
          return x + "_processed"
        }

        async let result = slowOperation()
        let other = "done"
      `);

      const aiProvider = createLoggingMockAI(50, {
        'slow_op': 'slow_result'
      }, log);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('result')).toBe('slow_result_processed');
      expect(runtime.getValue('other')).toBe('done');
    });
  });

  describe('multiple async function calls in parallel', () => {
    test('two async function calls run in parallel', async () => {
      const log: ExecutionLog[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function getA() {
          let x = do "get_A" m default
          return x
        }

        function getB() {
          let x = do "get_B" m default
          return x
        }

        async let a = getA()
        async let b = getB()
        let combined = a + b
      `);

      const aiProvider = createLoggingMockAI(75, {
        'get_A': 'ValueA',
        'get_B': 'ValueB',
      }, log);

      const runtime = new Runtime(ast, aiProvider);
      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      expect(runtime.getValue('combined')).toBe('ValueAValueB');
      // Two parallel calls should take ~75ms, not 150ms (with some margin for overhead)
      expect(elapsed).toBeLessThan(200);
    });

    test('three async function calls with internal async ops', async () => {
      const log: ExecutionLog[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function process1() {
          async let x = do "proc1_step1" m default
          async let y = do "proc1_step2" m default
          return x + y
        }

        function process2() {
          async let x = do "proc2_step1" m default
          async let y = do "proc2_step2" m default
          return x + y
        }

        function process3() {
          async let x = do "proc3_step1" m default
          return x
        }

        async let r1 = process1()
        async let r2 = process2()
        async let r3 = process3()
        let final = r1 + "_" + r2 + "_" + r3
      `);

      const aiProvider = createLoggingMockAI(40, {
        'proc1_step1': 'A',
        'proc1_step2': 'B',
        'proc2_step1': 'C',
        'proc2_step2': 'D',
        'proc3_step1': 'E',
      }, log);

      const runtime = new Runtime(ast, aiProvider);
      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      expect(runtime.getValue('final')).toBe('AB_CD_E');
      // All operations should run with parallelism
      // 3 functions with 2+2+1=5 ops at 40ms each
      // With maxParallel=4, should be ~80ms (2 waves)
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('nested function calls', () => {
    test('function calling another function with async inside', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function inner() {
          async let x = do "inner_call" m default
          return x + "_inner"
        }

        function outer() {
          let i = inner()
          return i + "_outer"
        }

        let result = outer()
      `);

      const aiProvider = createLoggingMockAI(50, {
        'inner_call': 'data'
      }, []);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('result')).toBe('data_inner_outer');
    });

    test('deeply nested functions with async at each level', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function level3() {
          async let x = do "level3_op" m default
          return x
        }

        function level2() {
          let inner = level3()
          async let y = do "level2_op" m default
          return inner + y
        }

        function level1() {
          let inner = level2()
          async let z = do "level1_op" m default
          return inner + z
        }

        let result = level1()
      `);

      const aiProvider = createLoggingMockAI(30, {
        'level3_op': 'L3',
        'level2_op': 'L2',
        'level1_op': 'L1',
      }, []);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('result')).toBe('L3L2L1');
    });
  });

  describe('async with loops inside functions', () => {
    test('function with for loop containing async', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function processItems() {
          let results = []
          for item in [1, 2, 3] {
            async let processed = do "process_!{item}" m default
            results.push(processed)
          }
          return results
        }

        let output = processItems()
      `);

      const aiProvider = createLoggingMockAI(30, {
        'process_1': 'P1',
        'process_2': 'P2',
        'process_3': 'P3',
      }, []);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('output')).toEqual(['P1', 'P2', 'P3']);
    });

    test('async function call inside loop', async () => {
      const log: ExecutionLog[] = [];

      // Use !{id} to expand the value in the prompt for unique mock matching
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function getData(id: number) {
          async let x = do "get_data_!{id}" m default
          return x
        }

        let results = []
        for i in [1, 2, 3] {
          async let r = getData(i)
          results.push(r)
        }
      `);

      const aiProvider = createLoggingMockAI(30, {
        'get_data_1': 'D1',
        'get_data_2': 'D2',
        'get_data_3': 'D3',
      }, log);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('results')).toEqual(['D1', 'D2', 'D3']);
    });
  });

  describe('async destructuring in functions', () => {
    test('function with async destructuring', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function getPerson() {
          async let {name: text, age: number} = do "get_person" m default
          return name + " is " + age
        }

        let description = getPerson()
      `);

      const aiProvider = createLoggingMockAI(50, {
        'get_person': { name: 'Alice', age: 30 }
      }, []);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('description')).toBe('Alice is 30');
    });

    test('multiple async destructurings in parallel inside function', async () => {
      const log: ExecutionLog[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function fetchData() {
          async let {x: number, y: number} = do "get_coords" m default
          async let {name: text, value: number} = do "get_item" m default
          return name + " at " + x + "," + y + " = " + value
        }

        let result = fetchData()
      `);

      const aiProvider = createLoggingMockAI(50, {
        'get_coords': { x: 10, y: 20 },
        'get_item': { name: 'Item', value: 100 },
      }, log);

      const runtime = new Runtime(ast, aiProvider);
      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      expect(runtime.getValue('result')).toBe('Item at 10,20 = 100');
      // Both destructurings should run in parallel (with margin for overhead)
      expect(elapsed).toBeLessThan(175);
    });
  });

  describe('error handling in nested async', () => {
    test('error in async function propagates correctly', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function failing() {
          async let x = do "fail_op" m default
          return x
        }

        async let result = failing()
        let used = result + "_suffix"
      `);

      const aiProvider: AIProvider = {
        async execute(prompt: string): Promise<AIExecutionResult> {
          if (prompt.includes('fail_op')) {
            throw new Error('Simulated failure');
          }
          return { value: 'ok' };
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

      // The error should be captured in the VibeValue
      const state = runtime.getState();
      expect(state.callStack[0].locals['result'].err).toBe(true);  // err is now boolean
    });

    test('one failing async in parallel does not block others', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function good1() {
          let x = do "good_1" m default
          return x
        }

        function failing() {
          let x = do "fail" m default
          return x
        }

        function good2() {
          let x = do "good_2" m default
          return x
        }

        async let r1 = good1()
        async let r2 = failing()
        async let r3 = good2()
      `);

      let callCount = 0;
      const aiProvider: AIProvider = {
        async execute(prompt: string): Promise<AIExecutionResult> {
          callCount++;
          await Bun.sleep(30);
          if (prompt.includes('fail')) {
            throw new Error('Simulated failure');
          }
          if (prompt.includes('good_1')) return { value: 'G1' };
          if (prompt.includes('good_2')) return { value: 'G2' };
          return { value: 'unknown' };
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

      // Good ones should have values
      expect(runtime.getValue('r1')).toBe('G1');
      expect(runtime.getValue('r3')).toBe('G2');

      // Failing one should have error
      const state = runtime.getState();
      expect(state.callStack[0].locals['r2'].err).toBe(true);  // err is now boolean
    });
  });

  describe('mixed sync and async in nested calls', () => {
    test('sync function calling async function', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function asyncWork() {
          async let x = do "async_op" m default
          return x
        }

        function syncWrapper() {
          let prefix = "PREFIX_"
          let asyncResult = asyncWork()
          let suffix = "_SUFFIX"
          return prefix + asyncResult + suffix
        }

        let result = syncWrapper()
      `);

      const aiProvider = createLoggingMockAI(50, {
        'async_op': 'ASYNC'
      }, []);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('result')).toBe('PREFIX_ASYNC_SUFFIX');
    });

    test('interleaved sync and async at multiple levels', async () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function level2() {
          let sync1 = "S1"
          async let async1 = do "A1" m default
          let sync2 = "S2"
          return sync1 + async1 + sync2
        }

        function level1() {
          let before = "B_"
          let middle = level2()
          async let after = do "A2" m default
          return before + middle + "_" + after
        }

        let result = level1()
      `);

      const aiProvider = createLoggingMockAI(30, {
        'A1': 'ASYNC1',
        'A2': 'ASYNC2',
      }, []);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('result')).toBe('B_S1ASYNC1S2_ASYNC2');
    });
  });

  describe('deeply nested async Vibe function calls', () => {
    test('three levels of async function calls', async () => {
      // Use !{prefix} to expand the value in the prompt for unique mock matching
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function level3(prefix: text) {
          async let x = do "L3_!{prefix}" m default
          return prefix + "_" + x
        }

        function level2(id: number) {
          async let r = level3("L2_" + id)
          return "L2:" + r
        }

        function level1() {
          async let a = level2(1)
          async let b = level2(2)
          return a + "|" + b
        }

        let result = level1()
      `);

      const aiProvider = createLoggingMockAI(30, {
        'L3_L2_1': 'A',
        'L3_L2_2': 'B',
      }, []);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('result')).toBe('L2:L2_1_A|L2:L2_2_B');
    });

    test('recursive async function with base case', async () => {
      // Use !{n} to expand the value in the prompt for unique mock matching
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function countdown(n: number) {
          if n <= 0 {
            return "done"
          }
          async let prefix = do "step_!{n}" m default
          let rest = countdown(n - 1)
          return prefix + "-" + rest
        }

        let result = countdown(3)
      `);

      const aiProvider = createLoggingMockAI(30, {
        'step_3': 'S3',
        'step_2': 'S2',
        'step_1': 'S1',
      }, []);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      expect(runtime.getValue('result')).toBe('S3-S2-S1-done');
    });

    test('parallel async calls within nested functions', async () => {
      const log: ExecutionLog[] = [];

      // Use !{id} to expand the value in the prompt for unique mock matching
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function innerWork(id: text) {
          async let x = do "work_!{id}" m default
          return x
        }

        function middleLevel() {
          async let a = innerWork("A")
          async let b = innerWork("B")
          return a + "+" + b
        }

        let results = []
        for i in [1, 2] {
          async let r = middleLevel()
          results.push(r)
        }
      `);

      const aiProvider = createLoggingMockAI(30, {
        'work_A': 'WA',
        'work_B': 'WB',
      }, log);

      const runtime = new Runtime(ast, aiProvider);
      const startTime = Date.now();
      await runtime.run();
      const elapsed = Date.now() - startTime;

      expect(runtime.getValue('results')).toEqual(['WA+WB', 'WA+WB']);
      // Two outer calls in parallel, each with two inner parallel calls
      // Should be ~60ms (30ms for outer level + 30ms for inner level), not ~120ms
      expect(elapsed).toBeLessThan(200);
    });
  });
});
