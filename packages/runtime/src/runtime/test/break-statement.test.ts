/**
 * Break Statement Tests
 *
 * Tests for the break statement which exits the innermost loop.
 */
import { describe, test, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, runUntilPause, currentFrame } from '..';
import { resolveValue } from '../types';

describe('break statement', () => {
  test('break exits for-in loop immediately', () => {
    const source = `
      let count = 0
      for i in [1, 2, 3, 4, 5] {
        if i == 3 {
          break
        }
        count = count + 1
      }
    `;
    const program = parse(source);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const count = resolveValue(frame.locals['count']);
    // Loop should have run for i=1, i=2, then break at i=3
    expect(count).toBe(2);
  });

  test('break exits while loop immediately', () => {
    const source = `
      let count = 0
      let i = 0
      while i < 10 {
        i = i + 1
        if i == 5 {
          break
        }
        count = count + 1
      }
    `;
    const program = parse(source);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const count = resolveValue(frame.locals['count']);
    // Loop should have run for i=1,2,3,4, then break at i=5
    expect(count).toBe(4);
    const i = resolveValue(frame.locals['i']);
    expect(i).toBe(5);
  });

  test('break only exits innermost loop (nested for-in)', () => {
    const source = `
      let outerCount = 0
      let innerCount = 0
      for i in [1, 2, 3] {
        outerCount = outerCount + 1
        for j in [1, 2, 3, 4, 5] {
          if j == 2 {
            break
          }
          innerCount = innerCount + 1
        }
      }
    `;
    const program = parse(source);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const outerCount = resolveValue(frame.locals['outerCount']);
    const innerCount = resolveValue(frame.locals['innerCount']);
    // Outer loop runs 3 times
    expect(outerCount).toBe(3);
    // Inner loop breaks at j=2 each time, so only j=1 increments count = 1 per outer iteration
    expect(innerCount).toBe(3);
  });

  test('break only exits innermost loop (nested while)', () => {
    const source = `
      let outerCount = 0
      let innerCount = 0
      let i = 0
      while i < 3 {
        i = i + 1
        outerCount = outerCount + 1
        let j = 0
        while j < 10 {
          j = j + 1
          if j == 3 {
            break
          }
          innerCount = innerCount + 1
        }
      }
    `;
    const program = parse(source);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const outerCount = resolveValue(frame.locals['outerCount']);
    const innerCount = resolveValue(frame.locals['innerCount']);
    // Outer loop runs 3 times
    expect(outerCount).toBe(3);
    // Inner loop breaks at j=3 each time, so j=1,2 increment count = 2 per outer iteration
    expect(innerCount).toBe(6);
  });

  test('break works in for-in inside while', () => {
    const source = `
      let result = 0
      let i = 0
      while i < 2 {
        i = i + 1
        for j in [10, 20, 30, 40] {
          result = result + j
          if j == 20 {
            break
          }
        }
      }
    `;
    const program = parse(source);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const result = resolveValue(frame.locals['result']);
    // Each outer iteration: 10 + 20 = 30 (break at 20)
    // 2 outer iterations: 30 * 2 = 60
    expect(result).toBe(60);
  });

  test('break works in while inside for-in', () => {
    const source = `
      let result = 0
      for i in [1, 2] {
        let j = 0
        while j < 100 {
          j = j + 1
          result = result + 1
          if j == 5 {
            break
          }
        }
      }
    `;
    const program = parse(source);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const result = resolveValue(frame.locals['result']);
    // Each outer iteration: while runs 5 times (j=1,2,3,4,5 then break)
    // 2 outer iterations: 5 * 2 = 10
    expect(result).toBe(10);
  });

  test('break as first statement in loop body', () => {
    const source = `
      let count = 0
      for i in [1, 2, 3] {
        break
        count = count + 1
      }
    `;
    const program = parse(source);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const count = resolveValue(frame.locals['count']);
    // Break immediately, count never incremented
    expect(count).toBe(0);
  });

  test('break preserves variables declared before loop', () => {
    const source = `
      let x = 100
      for i in [1, 2, 3, 4, 5] {
        x = x + i
        if i == 3 {
          break
        }
      }
    `;
    const program = parse(source);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const x = resolveValue(frame.locals['x']);
    // x = 100 + 1 + 2 + 3 = 106 (break at i=3, after adding 3)
    expect(x).toBe(106);
  });

  test('break cleans up loop variable scope', () => {
    const source = `
      let result = 0
      for i in [1, 2, 3] {
        let temp = i * 10
        if i == 2 {
          break
        }
        result = result + temp
      }
    `;
    const program = parse(source);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const result = resolveValue(frame.locals['result']);
    // i=1: temp=10, result=10
    // i=2: temp=20, break before adding
    expect(result).toBe(10);
    // temp should be cleaned up (not in frame.locals at top level)
    expect(frame.locals['temp']).toBeUndefined();
    // i should be cleaned up too
    expect(frame.locals['i']).toBeUndefined();
  });

  test('conditional break with complex condition', () => {
    const source = `
      let sum = 0
      for n in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] {
        sum = sum + n
        if sum > 15 {
          break
        }
      }
    `;
    const program = parse(source);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const sum = resolveValue(frame.locals['sum']);
    // 1+2+3+4+5 = 15, then 1+2+3+4+5+6 = 21 > 15, break
    expect(sum).toBe(21);
  });
});
