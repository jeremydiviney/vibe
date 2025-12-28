import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, runUntilPause } from '../index';

describe('Runtime For-In Loop', () => {
  // ============================================================================
  // Basic array iteration
  // ============================================================================

  test('for-in iterates over string array', () => {
    const ast = parse(`
      let items = ["a", "b", "c"]
      let result = ""
      for item in items {
        result = result
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
  });

  test('for-in iterates over number array', () => {
    const ast = parse(`
      let sum: number = 0
      for n in [1, 2, 3] {
        sum = ts(sum, n) { return sum + n }
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
  });

  // ============================================================================
  // Range iteration with .. operator
  // ============================================================================

  test('range operator 2..5 creates [2,3,4,5]', () => {
    const ast = parse(`
      let range = 2..5
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['range'].value).toEqual([2, 3, 4, 5]);
  });

  test('range operator with variables', () => {
    const ast = parse(`
      let start: number = 1
      let end: number = 3
      let range = start..end
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['range'].value).toEqual([1, 2, 3]);
  });

  test('range operator with negative to positive', () => {
    const ast = parse(`
      let range = -3..4
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['range'].value).toEqual([-3, -2, -1, 0, 1, 2, 3, 4]);
  });

  test('range operator with negative to negative', () => {
    const ast = parse(`
      let range = -5..-2
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['range'].value).toEqual([-5, -4, -3, -2]);
  });

  test('range operator with variable bounds (start > end at runtime) produces empty array', () => {
    // When bounds are variables, we can't check at compile time
    // so runtime produces empty array for start > end
    const ast = parse(`
      let start: number = 5
      let end: number = 2
      let range = start..end
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['range'].value).toEqual([]);
  });

  test('range operator same start and end produces single element', () => {
    const ast = parse(`
      let range = 3..3
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['range'].value).toEqual([3]);
  });

  test('for-in with range operator', () => {
    const ast = parse(`
      let visited = false
      for i in 1..3 {
        visited = true
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['visited'].value).toBe(true);
  });

  // ============================================================================
  // Range iteration with single number (for i in N)
  // ============================================================================

  test('for-in with number creates inclusive range (1 to N)', () => {
    const ast = parse(`
      let count: number = 0
      for i in 3 {
        count = ts(count) { return count + 1 }
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // First iteration pauses for ts eval
    expect(state.status).toBe('awaiting_ts');
  });

  test('for-in with zero iterations', () => {
    const ast = parse(`
      let executed = false
      for i in 0 {
        executed = true
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['executed'].value).toBe(false);
  });

  // ============================================================================
  // Loop variable scoping
  // ============================================================================

  test('loop variable is accessible inside loop', () => {
    const ast = parse(`
      let captured = ""
      for item in ["test"] {
        captured = item
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['captured'].value).toBe('test');
  });

  test('loop variable is cleaned up after loop', () => {
    const ast = parse(`
      for item in ["a", "b"] {
        let temp = item
      }
      let outside = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    // 'item' and 'temp' should not be visible
    expect(state.callStack[0].locals['item']).toBeUndefined();
    expect(state.callStack[0].locals['temp']).toBeUndefined();
    expect(state.callStack[0].locals['outside'].value).toBe('done');
  });

  // ============================================================================
  // Empty array
  // ============================================================================

  test('for-in with empty array does nothing', () => {
    const ast = parse(`
      let executed = false
      for item in [] {
        executed = true
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['executed'].value).toBe(false);
  });

  // ============================================================================
  // Nested loops
  // ============================================================================

  test('nested for-in loops', () => {
    const ast = parse(`
      let count: number = 0
      for i in 2 {
        for j in 2 {
          count = ts(count) { return count + 1 }
        }
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // First iteration of inner loop pauses for ts eval
    expect(state.status).toBe('awaiting_ts');
  });
});

describe('Runtime For-In Error Cases', () => {
  test('for-in with non-integer range throws error', () => {
    const ast = parse(`
      for i in 3.5 {
        let x = i
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain('integer');
  });

  test('for-in with negative range throws error', () => {
    const ast = parse(`
      for i in -3 {
        let x = i
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain('non-negative');
  });

  test('for-in with non-integer range bounds throws error', () => {
    const ast = parse(`
      for i in 1.5..5 {
        let x = i
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain('integer');
  });

  test('[x, y] is treated as a plain array, not a range', () => {
    // Explicit array literal [2, 5] should iterate as a 2-element array,
    // NOT be interpreted as a range 2..5 = [2,3,4,5]
    // The .. operator now handles ranges explicitly
    const ast = parse(`
      let visited = false
      for i in [2, 5] {
        visited = true
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['visited'].value).toBe(true);
  });

  test('for-in with string throws error', () => {
    const ast = parse(`
      let x = "not an array"
      for i in x {
        let y = i
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain('array or range');
  });
});
