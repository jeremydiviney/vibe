import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, type AIProvider, type AIExecutionResult } from '../index';

// Event types for tracking execution order
type EventType =
  | 'ai_call_start'
  | 'ai_call_end'
  | 'sync_op';

interface ExecutionEvent {
  type: EventType;
  id: string;
  timestamp: number;
}

// Create AI provider that logs precise execution events
function createOrderTrackingAI(
  delayMs: number,
  responses: Record<string, unknown>,
  events: ExecutionEvent[]
): AIProvider {
  return {
    async execute(prompt: string): Promise<AIExecutionResult> {
      // Extract ID from prompt for tracking
      const id = prompt.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20);

      events.push({ type: 'ai_call_start', id, timestamp: Date.now() });
      await Bun.sleep(delayMs);
      events.push({ type: 'ai_call_end', id, timestamp: Date.now() });

      // Find matching response
      for (const [key, value] of Object.entries(responses)) {
        if (prompt.includes(key)) {
          return { value };
        }
      }
      return { value: `response_${id}` };
    },
    async generateCode(): Promise<AIExecutionResult> {
      return { value: '' };
    },
    async askUser(): Promise<string> {
      return '';
    },
  };
}

// Helper to check if events overlap in time (parallel execution)
function eventsOverlap(events: ExecutionEvent[], id1: string, id2: string): boolean {
  const start1 = events.find(e => e.type === 'ai_call_start' && e.id.includes(id1));
  const end1 = events.find(e => e.type === 'ai_call_end' && e.id.includes(id1));
  const start2 = events.find(e => e.type === 'ai_call_start' && e.id.includes(id2));
  const end2 = events.find(e => e.type === 'ai_call_end' && e.id.includes(id2));

  if (!start1 || !end1 || !start2 || !end2) return false;

  // Overlap if one starts before the other ends
  return (start1.timestamp < end2.timestamp && start2.timestamp < end1.timestamp);
}

// Helper to check if event A started before event B ended
function startedBefore(events: ExecutionEvent[], idA: string, idB: string): boolean {
  const startA = events.find(e => e.type === 'ai_call_start' && e.id.includes(idA));
  const endB = events.find(e => e.type === 'ai_call_end' && e.id.includes(idB));

  if (!startA || !endB) return false;
  return startA.timestamp < endB.timestamp;
}

// Helper to get event order
function getEventOrder(events: ExecutionEvent[]): string[] {
  return events
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(e => `${e.type}:${e.id}`);
}

describe('Async Execution Order Verification', () => {
  describe('parallel async operations start before any awaits', () => {
    test('three async lets all START before any END (true parallelism)', async () => {
      const events: ExecutionEvent[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "op_A" m default
        async let b = do "op_B" m default
        async let c = do "op_C" m default
        let result = a + b + c
      `);

      const aiProvider = createOrderTrackingAI(100, {
        'op_A': 'A',
        'op_B': 'B',
        'op_C': 'C',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // Get all start events
      const starts = events.filter(e => e.type === 'ai_call_start');
      const ends = events.filter(e => e.type === 'ai_call_end');

      // All 3 operations should have started
      expect(starts.length).toBe(3);
      expect(ends.length).toBe(3);

      // Key test: ALL operations should START before ANY operation ENDS
      // This proves true parallel execution
      const lastStartTime = Math.max(...starts.map(e => e.timestamp));
      const firstEndTime = Math.min(...ends.map(e => e.timestamp));

      expect(lastStartTime).toBeLessThan(firstEndTime);

      // Verify overlapping execution
      expect(eventsOverlap(events, 'op_A', 'op_B')).toBe(true);
      expect(eventsOverlap(events, 'op_B', 'op_C')).toBe(true);
      expect(eventsOverlap(events, 'op_A', 'op_C')).toBe(true);

      expect(runtime.getValue('result')).toBe('ABC');
    });

    test('async operations start immediately, not lazily on use', async () => {
      const events: ExecutionEvent[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "start_A" m default
        async let b = do "start_B" m default
      `);

      // Use longer delay to make timing clearer
      const aiProvider = createOrderTrackingAI(150, {
        'start_A': 'A',
        'start_B': 'B',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      const starts = events.filter(e => e.type === 'ai_call_start');

      // Both should start almost immediately (within 50ms of each other)
      // not lazily when the variable is used
      const timeDiff = Math.abs(starts[0].timestamp - starts[1].timestamp);
      expect(timeDiff).toBeLessThan(50);
    });
  });

  describe('implicit await happens at correct point', () => {
    test('await triggers when async variable is used in expression', async () => {
      const events: ExecutionEvent[] = [];
      let syncOpTime = 0;

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "async_op" m default
        let sync = "before_use"
        let result = a + "_used"
      `);

      const aiProvider = createOrderTrackingAI(100, {
        'async_op': 'ASYNC',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // The sync assignment should happen before async completes
      // (async doesn't block sync operations)
      const asyncStart = events.find(e => e.type === 'ai_call_start');
      const asyncEnd = events.find(e => e.type === 'ai_call_end');

      expect(asyncStart).toBeDefined();
      expect(asyncEnd).toBeDefined();

      // Result should be correct (await happened before concatenation)
      expect(runtime.getValue('result')).toBe('ASYNC_used');
    });

    test('multiple async variables await only when used', async () => {
      const events: ExecutionEvent[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "first" m default
        async let b = do "second" m default
        let useA = a + "!"
        let useB = b + "!"
      `);

      const aiProvider = createOrderTrackingAI(75, {
        'first': 'FIRST',
        'second': 'SECOND',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // Both should have completed
      const ends = events.filter(e => e.type === 'ai_call_end');
      expect(ends.length).toBe(2);

      expect(runtime.getValue('useA')).toBe('FIRST!');
      expect(runtime.getValue('useB')).toBe('SECOND!');
    });
  });

  describe('sequential vs parallel execution patterns', () => {
    test('sync do blocks sequentially, async do runs in parallel', async () => {
      // First: sync pattern (should be sequential)
      const syncEvents: ExecutionEvent[] = [];
      const syncAst = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let a = do "sync_1" m default
        let b = do "sync_2" m default
      `);

      const syncProvider = createOrderTrackingAI(50, {
        'sync_1': 'S1',
        'sync_2': 'S2',
      }, syncEvents);

      const syncRuntime = new Runtime(syncAst, syncProvider);
      const syncStart = Date.now();
      await syncRuntime.run();
      const syncElapsed = Date.now() - syncStart;

      // Sync: second should start AFTER first ends
      const sync1End = syncEvents.find(e => e.type === 'ai_call_end' && e.id.includes('sync_1'));
      const sync2Start = syncEvents.find(e => e.type === 'ai_call_start' && e.id.includes('sync_2'));
      expect(sync2Start!.timestamp).toBeGreaterThanOrEqual(sync1End!.timestamp);

      // Second: async pattern (should be parallel)
      const asyncEvents: ExecutionEvent[] = [];
      const asyncAst = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "async_1" m default
        async let b = do "async_2" m default
        let result = a + b
      `);

      const asyncProvider = createOrderTrackingAI(50, {
        'async_1': 'A1',
        'async_2': 'A2',
      }, asyncEvents);

      const asyncRuntime = new Runtime(asyncAst, asyncProvider);
      const asyncStart = Date.now();
      await asyncRuntime.run();
      const asyncElapsed = Date.now() - asyncStart;

      // Async: should overlap
      expect(eventsOverlap(asyncEvents, 'async_1', 'async_2')).toBe(true);

      // Async should be significantly faster than sync
      expect(asyncElapsed).toBeLessThan(syncElapsed);
    });

    test('dependent operations execute in correct order', async () => {
      const events: ExecutionEvent[] = [];

      // b depends on a (uses a's value in prompt)
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "get_value" m default
        let b = do "use_{a}" m default
      `);

      const aiProvider = createOrderTrackingAI(50, {
        'get_value': 'VALUE',
        'use_VALUE': 'RESULT',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // a should complete before b starts (b depends on a)
      const aEnd = events.find(e => e.type === 'ai_call_end' && e.id.includes('get_value'));
      const bStart = events.find(e => e.type === 'ai_call_start' && e.id.includes('use_'));

      expect(aEnd).toBeDefined();
      expect(bStart).toBeDefined();
      expect(aEnd!.timestamp).toBeLessThanOrEqual(bStart!.timestamp);

      expect(runtime.getValue('b')).toBe('RESULT');
    });
  });

  describe('execution order in functions', () => {
    test('async operations in function body run in parallel', async () => {
      const events: ExecutionEvent[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function fetchBoth() {
          async let x = do "func_X" m default
          async let y = do "func_Y" m default
          return x + y
        }

        let result = fetchBoth()
      `);

      const aiProvider = createOrderTrackingAI(75, {
        'func_X': 'X',
        'func_Y': 'Y',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // Both should overlap (parallel inside function)
      expect(eventsOverlap(events, 'func_X', 'func_Y')).toBe(true);
      expect(runtime.getValue('result')).toBe('XY');
    });

    test('nested function calls maintain correct order', async () => {
      const events: ExecutionEvent[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }

        function inner() {
          async let i = do "inner_op" m default
          return i
        }

        function outer() {
          let fromInner = inner()
          async let o = do "outer_op" m default
          return fromInner + o
        }

        let result = outer()
      `);

      const aiProvider = createOrderTrackingAI(50, {
        'inner_op': 'I',
        'outer_op': 'O',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // inner_op should complete before outer_op starts
      // (because fromInner = inner() is sync assignment that needs inner to complete)
      const innerEnd = events.find(e => e.type === 'ai_call_end' && e.id.includes('inner'));
      const outerStart = events.find(e => e.type === 'ai_call_start' && e.id.includes('outer'));

      expect(innerEnd).toBeDefined();
      expect(outerStart).toBeDefined();
      expect(innerEnd!.timestamp).toBeLessThanOrEqual(outerStart!.timestamp);

      expect(runtime.getValue('result')).toBe('IO');
    });
  });

  describe('execution order with loops', () => {
    test('async in loop iterations - each iteration awaits before next', async () => {
      const events: ExecutionEvent[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let results = []
        for i in [1, 2, 3] {
          async let r = do "iter_{i}" m default
          results.push(r)
        }
      `);

      const aiProvider = createOrderTrackingAI(30, {
        'iter_1': 'R1',
        'iter_2': 'R2',
        'iter_3': 'R3',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // Each iteration should complete before the next starts
      // (because results.push(r) uses r, triggering await)
      const iter1End = events.find(e => e.type === 'ai_call_end' && e.id.includes('iter_1'));
      const iter2Start = events.find(e => e.type === 'ai_call_start' && e.id.includes('iter_2'));
      const iter2End = events.find(e => e.type === 'ai_call_end' && e.id.includes('iter_2'));
      const iter3Start = events.find(e => e.type === 'ai_call_start' && e.id.includes('iter_3'));

      expect(iter1End!.timestamp).toBeLessThanOrEqual(iter2Start!.timestamp);
      expect(iter2End!.timestamp).toBeLessThanOrEqual(iter3Start!.timestamp);

      expect(runtime.getValue('results')).toEqual(['R1', 'R2', 'R3']);
    });

    test('multiple async in same iteration can run in parallel', async () => {
      const events: ExecutionEvent[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let results = []
        for i in [1] {
          async let a = do "loop_A" m default
          async let b = do "loop_B" m default
          results.push(a + b)
        }
      `);

      const aiProvider = createOrderTrackingAI(50, {
        'loop_A': 'A',
        'loop_B': 'B',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // A and B should overlap within the same iteration
      expect(eventsOverlap(events, 'loop_A', 'loop_B')).toBe(true);
      expect(runtime.getValue('results')).toEqual(['AB']);
    });
  });

  describe('program completion awaits all pending', () => {
    test('pending async operations complete before program ends', async () => {
      const events: ExecutionEvent[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async let a = do "fire_forget_A" m default
        async let b = do "fire_forget_B" m default
      `);

      const aiProvider = createOrderTrackingAI(75, {
        'fire_forget_A': 'A',
        'fire_forget_B': 'B',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // Both should have completed (not left pending)
      const ends = events.filter(e => e.type === 'ai_call_end');
      expect(ends.length).toBe(2);

      // Values should be set
      expect(runtime.getValue('a')).toBe('A');
      expect(runtime.getValue('b')).toBe('B');
    });

    test('standalone async (fire-and-forget) completes before program ends', async () => {
      const events: ExecutionEvent[] = [];

      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        async do "standalone_op" m default
        let x = "done"
      `);

      const aiProvider = createOrderTrackingAI(50, {
        'standalone_op': 'ignored',
      }, events);

      const runtime = new Runtime(ast, aiProvider);
      await runtime.run();

      // The standalone async should have completed
      const ends = events.filter(e => e.type === 'ai_call_end');
      expect(ends.length).toBe(1);

      expect(runtime.getValue('x')).toBe('done');
    });
  });
});
