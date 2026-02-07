import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, runUntilPause } from '../index';

describe('TS Block Parameter Expression Resolution', () => {
  // ============================================================================
  // Simple variable binding
  // ============================================================================

  test('simple variable binding', () => {
    const ast = parse(`
      let x = 42
      let result = ts(x) { return x * 2 }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([42]);
  });

  test('named variable binding (alias)', () => {
    const ast = parse(`
      let value = "hello"
      let result = ts(v=value) { return v.length }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.params).toEqual(['v']);
    expect(state.pendingTS!.paramValues).toEqual(['hello']);
  });

  // ============================================================================
  // Member (dot) access
  // ============================================================================

  test('member access on json object', () => {
    const ast = parse(`
      let obj: json = { name: "Alice", age: 30 }
      let result = ts(n=obj.name) { return n }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual(['Alice']);
  });

  test('nested member access', () => {
    const ast = parse(`
      let obj: json = { a: { b: { c: 99 } } }
      let result = ts(val=obj.a.b.c) { return val }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([99]);
  });

  // ============================================================================
  // Array index access
  // ============================================================================

  test('array index access [0]', () => {
    const ast = parse(`
      let items = [10, 20, 30]
      let result = ts(first=items[0]) { return first }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([10]);
  });

  test('array index access [2]', () => {
    const ast = parse(`
      let items = [10, 20, 30]
      let result = ts(last=items[2]) { return last }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([30]);
  });

  test('negative array index [-1]', () => {
    const ast = parse(`
      let items = [10, 20, 30]
      let result = ts(last=items[-1]) { return last }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([30]);
  });

  test('negative array index [-2]', () => {
    const ast = parse(`
      let items = [10, 20, 30]
      let result = ts(val=items[-2]) { return val }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([20]);
  });

  // ============================================================================
  // Slice access
  // ============================================================================

  test('slice access [1:3]', () => {
    const ast = parse(`
      let items = [10, 20, 30, 40, 50]
      let result = ts(sub=items[1:3]) { return sub }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([[20, 30]]);
  });

  test('slice with open start [:2]', () => {
    const ast = parse(`
      let items = [10, 20, 30, 40]
      let result = ts(sub=items[:2]) { return sub }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([[10, 20]]);
  });

  test('slice with open end [2:]', () => {
    const ast = parse(`
      let items = [10, 20, 30, 40]
      let result = ts(sub=items[2:]) { return sub }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([[30, 40]]);
  });

  test('slice with negative indices [-2:]', () => {
    const ast = parse(`
      let items = [10, 20, 30, 40, 50]
      let result = ts(sub=items[-2:]) { return sub }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([[40, 50]]);
  });

  // ============================================================================
  // Chained access patterns
  // ============================================================================

  test('member then index: obj.list[0]', () => {
    const ast = parse(`
      let obj: json = { list: [100, 200, 300] }
      let result = ts(val=obj.list[0]) { return val }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([100]);
  });

  test('index then member: arr[0].name', () => {
    const ast = parse(`
      let arr: json[] = [{ name: "Alice" }, { name: "Bob" }]
      let result = ts(val=arr[0].name) { return val }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual(['Alice']);
  });

  test('member then slice: obj.items[1:3]', () => {
    const ast = parse(`
      let obj: json = { items: [1, 2, 3, 4, 5] }
      let result = ts(sub=obj.items[1:3]) { return sub }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([[2, 3]]);
  });

  // ============================================================================
  // Multiple params with different expression types
  // ============================================================================

  test('multiple params with different access patterns', () => {
    const ast = parse(`
      let items = [10, 20, 30, 40]
      let obj: json = { key: "value" }
      let result = ts(first=items[0], last=items[-1], k=obj.key) { return first }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([10, 40, 'value']);
    expect(state.pendingTS!.params).toEqual(['first', 'last', 'k']);
  });

  // ============================================================================
  // Model property access
  // ============================================================================

  test('model.usage returns a copy of usage array', () => {
    const ast = parse(`
      model m = { name: "gpt-4", apiKey: "key", provider: "openai" }
      let result = ts(usage=m.usage) { return usage.length }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual([[]]);
  });

  test('model.name resolves to model name', () => {
    const ast = parse(`
      model m = { name: "gpt-4o", apiKey: "key", provider: "openai" }
      let result = ts(n=m.name) { return n }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ts');
    expect(state.pendingTS!.paramValues).toEqual(['gpt-4o']);
  });
});
