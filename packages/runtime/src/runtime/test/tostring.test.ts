/**
 * toString() Method Tests
 *
 * Tests for the toString() method for explicit type coercion.
 */
import { describe, test, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, runUntilPause, currentFrame } from '..';
import { resolveValue } from '../types';

describe('toString() method', () => {
  // ============================================================================
  // Number toString
  // ============================================================================

  test('number.toString() returns string', () => {
    const program = parse(`
      let num: number = 42
      let str = num.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    expect(resolveValue(frame.locals['str'])).toBe('42');
  });

  test('negative number.toString()', () => {
    const program = parse(`
      let num: number = -123
      let str = num.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    expect(resolveValue(frame.locals['str'])).toBe('-123');
  });

  test('decimal number.toString()', () => {
    const program = parse(`
      let num: number = 3.14159
      let str = num.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    expect(resolveValue(frame.locals['str'])).toBe('3.14159');
  });

  // ============================================================================
  // Boolean toString
  // ============================================================================

  test('true.toString() returns "true"', () => {
    const program = parse(`
      let flag: boolean = true
      let str = flag.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    expect(resolveValue(frame.locals['str'])).toBe('true');
  });

  test('false.toString() returns "false"', () => {
    const program = parse(`
      let flag: boolean = false
      let str = flag.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    expect(resolveValue(frame.locals['str'])).toBe('false');
  });

  // ============================================================================
  // Object/JSON toString
  // ============================================================================

  test('object.toString() returns JSON string', () => {
    const program = parse(`
      let data: json = { name: "Alice", age: 30 }
      let str = data.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const result = resolveValue(frame.locals['str']);
    expect(result).toBe('{"name":"Alice","age":30}');
  });

  test('nested object.toString()', () => {
    const program = parse(`
      let data: json = { user: { name: "Bob" } }
      let str = data.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    const result = resolveValue(frame.locals['str']);
    expect(result).toBe('{"user":{"name":"Bob"}}');
  });

  // ============================================================================
  // Array toString
  // ============================================================================

  test('array.toString() returns JSON string', () => {
    const program = parse(`
      let arr = [1, 2, 3]
      let str = arr.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    expect(resolveValue(frame.locals['str'])).toBe('[1,2,3]');
  });

  test('array of strings.toString()', () => {
    const program = parse(`
      let arr = ["a", "b", "c"]
      let str = arr.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    expect(resolveValue(frame.locals['str'])).toBe('["a","b","c"]');
  });

  // ============================================================================
  // Null toString
  // ============================================================================

  test('null.toString() returns empty string', () => {
    const program = parse(`
      let x: text = null
      let str = x.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    expect(resolveValue(frame.locals['str'])).toBe('');
  });

  // ============================================================================
  // String toString (identity)
  // ============================================================================

  test('string.toString() returns same string', () => {
    const program = parse(`
      let s: text = "hello"
      let str = s.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    expect(resolveValue(frame.locals['str'])).toBe('hello');
  });

  // ============================================================================
  // Chaining and expressions
  // ============================================================================

  test('toString in expression', () => {
    const program = parse(`
      let num: number = 42
      let msg = "Value: " + num.toString()
    `);
    let state = createInitialState(program);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const frame = currentFrame(state);
    expect(resolveValue(frame.locals['msg'])).toBe('Value: 42');
  });
});
