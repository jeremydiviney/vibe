import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, runUntilPause } from '../index';

describe('Runtime While Loop', () => {
  // ============================================================================
  // Basic while loop
  // ============================================================================

  test('while loop executes while condition is true', () => {
    const ast = parse(`
      let keepGoing = true
      let executed = false
      while keepGoing {
        executed = true
        keepGoing = false
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['executed'].value).toBe(true);
    expect(frame.locals['keepGoing'].value).toBe(false);
  });

  test('while loop with false condition never executes', () => {
    const ast = parse(`
      let executed = false
      while false {
        executed = true
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['executed'].value).toBe(false);
  });

  test('while loop with true initial condition executes once then exits', () => {
    const ast = parse(`
      let counter = true
      let loopRan = false
      while counter {
        loopRan = true
        counter = false
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['loopRan'].value).toBe(true);
    expect(frame.locals['counter'].value).toBe(false);
  });

  // ============================================================================
  // Scoping
  // ============================================================================

  test('variables declared in while body are cleaned up each iteration', () => {
    // This tests that body-scoped variables don't persist
    const ast = parse(`
      let flag = true
      let outsideVar = false
      while flag {
        let insideVar = true
        outsideVar = insideVar
        flag = false
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['outsideVar'].value).toBe(true);
    // insideVar should not exist in the frame after loop completes
    expect(frame.locals['insideVar']).toBeUndefined();
  });

  test('while loop does not leak scope to outer context', () => {
    const ast = parse(`
      let preLoop = true
      while false {
        let loopVar = true
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['preLoop'].value).toBe(true);
    expect(frame.locals['loopVar']).toBeUndefined();
  });

  // ============================================================================
  // Nested while loops
  // ============================================================================

  test('nested while loops work correctly', () => {
    const ast = parse(`
      let outer = true
      let inner = true
      let outerRan = false
      let innerRan = false
      while outer {
        outerRan = true
        while inner {
          innerRan = true
          inner = false
        }
        outer = false
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['outerRan'].value).toBe(true);
    expect(frame.locals['innerRan'].value).toBe(true);
    expect(frame.locals['outer'].value).toBe(false);
    expect(frame.locals['inner'].value).toBe(false);
  });

  // ============================================================================
  // Error cases
  // ============================================================================

  test('while with non-boolean condition throws error', () => {
    const ast = parse(`
      while "not a boolean" {
        let x = 1
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain('boolean');
  });

  test('while with number condition throws error', () => {
    const ast = parse(`
      while 1 {
        let x = 1
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain('boolean');
  });

  test('while with string variable condition throws error', () => {
    const ast = parse(`
      const x = "test"
      while x {
        let y = 1
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain('boolean');
  });

  test('while with number variable condition throws error', () => {
    const ast = parse(`
      let count = 5
      while count {
        count = 0
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain('boolean');
  });

  // ============================================================================
  // Integration with other constructs
  // ============================================================================

  test('while loop with if statement inside', () => {
    const ast = parse(`
      let flag = true
      let tookBranch = false
      while flag {
        if true {
          tookBranch = true
        }
        flag = false
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['tookBranch'].value).toBe(true);
  });

  test('while loop inside function', () => {
    const ast = parse(`
      function loopOnce(): boolean {
        let done = false
        while true {
          done = true
          return done
        }
        return false
      }
      let result = loopOnce()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = state.callStack[0];
    expect(frame.locals['result'].value).toBe(true);
  });
});
