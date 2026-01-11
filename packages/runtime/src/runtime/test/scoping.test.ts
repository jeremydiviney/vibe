import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, runUntilPause } from '../index';

describe('Runtime Lexical Scoping', () => {
  // ============================================================================
  // Function access to global scope
  // ============================================================================

  test('function can read global variable', () => {
    const ast = parse(`
      let globalVar = "global_value"
      function readGlobal() {
        return globalVar
      }
      let result = readGlobal()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('global_value');
  });

  test('function can modify global variable', () => {
    const ast = parse(`
      let counter = "before"
      function updateCounter() {
        counter = "after"
        return counter
      }
      updateCounter()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['counter'].value).toBe('after');
  });

  test('function can access global constant', () => {
    const ast = parse(`
      const CONFIG = "config_value"
      function useConfig() {
        return CONFIG
      }
      let result = useConfig()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('config_value');
  });

  test('function can call other global function', () => {
    const ast = parse(`
      function helper() {
        return "helped"
      }
      function main() {
        return helper()
      }
      let result = main()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('helped');
  });

  test('recursion works', () => {
    const ast = parse(`
      let depth = "0"
      function recurse(shouldRecurse: boolean): text {
        if shouldRecurse {
          depth = "reached"
          return recurse(false)
        }
        return depth
      }
      let result = recurse(true)
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('reached');
  });

  // ============================================================================
  // Shadowing
  // ============================================================================

  test('local variable shadows global', () => {
    const ast = parse(`
      let x = "global"
      function shadow() {
        let x = "local"
        return x
      }
      let result = shadow()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('local');
    // Global x unchanged
    expect(state.callStack[0].locals['x'].value).toBe('global');
  });

  test('parameter shadows global', () => {
    const ast = parse(`
      let name = "global_name"
      function greet(name: text): text {
        return name
      }
      let result = greet("param_name")
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('param_name');
    // Global name unchanged
    expect(state.callStack[0].locals['name'].value).toBe('global_name');
  });

  // ============================================================================
  // String interpolation with scope chain
  // ============================================================================

  test('string interpolation can access global variables from function', () => {
    const ast = parse(`
      let name = "World"
      function greet() {
        return "Hello, {name}!"
      }
      let result = greet()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('Hello, World!');
  });

  test('string interpolation prefers local over global (shadowing)', () => {
    const ast = parse(`
      let name = "Global"
      function greet() {
        let name = "Local"
        return "Hello, {name}!"
      }
      let result = greet()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('Hello, Local!');
  });

  // ============================================================================
  // Model access from functions
  // ============================================================================

  test('function can access global model', () => {
    const ast = parse(`
      model myModel = { name: "test", apiKey: "key", url: "http://test" }
      function useModel() {
        return myModel
      }
      let result = useModel()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const result = state.callStack[0].locals['result'].value as any;
    // Model is accessible from function - just verify it's a model object
    expect(result.__vibeModel).toBe(true);
  });

  test('cannot assign to global model from function', () => {
    const ast = parse(`
      model myModel = { name: "test", apiKey: "key", url: "http://test" }
      function tryModify() {
        myModel = "something else"
        return myModel
      }
      tryModify()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain("Cannot assign to constant 'myModel'");
  });

  test('local variable can shadow global model', () => {
    const ast = parse(`
      model myModel = { name: "test", apiKey: "key", url: "http://test" }
      function shadowModel() {
        let myModel = "shadowed"
        return myModel
      }
      let result = shadowModel()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('shadowed');
    // Global model unchanged
    const globalModel = state.callStack[0].locals['myModel'].value as any;
    expect(globalModel.__vibeModel).toBe(true);
  });

  // ============================================================================
  // Block scope within functions
  // ============================================================================

  test('block in function can access function locals', () => {
    const ast = parse(`
      function test() {
        let funcVar = "func_value"
        if true {
          return funcVar
        }
        return "not reached"
      }
      let result = test()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('func_value');
  });

  test('block in function can access function parameters', () => {
    const ast = parse(`
      function test(param: text): text {
        if true {
          return param
        }
        return "not reached"
      }
      let result = test("param_value")
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('param_value');
  });

  test('block in function can access global scope', () => {
    const ast = parse(`
      let globalVar = "global"
      function test() {
        if true {
          return globalVar
        }
        return "not reached"
      }
      let result = test()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('global');
  });

  // ============================================================================
  // Nested blocks
  // ============================================================================

  test('nested blocks can access all outer scopes', () => {
    const ast = parse(`
      let a = "level0"
      if true {
        let b = "level1"
        if true {
          let c = "level2"
          if true {
            a = b
            b = c
          }
        }
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['a'].value).toBe('level1');
  });

  // ============================================================================
  // Const protection across scopes
  // ============================================================================

  test('cannot assign to global const from function', () => {
    const ast = parse(`
      const CONFIG = "original"
      function tryModify() {
        CONFIG = "modified"
        return CONFIG
      }
      tryModify()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain("Cannot assign to constant 'CONFIG'");
  });

  // ============================================================================
  // Complex scenarios
  // ============================================================================

  test('multiple functions sharing global state', () => {
    const ast = parse(`
      let state = "initial"
      function setState(val: text): text {
        state = val
        return state
      }
      function getState() {
        return state
      }
      setState("updated")
      let result = getState()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('updated');
  });

  test('function chain using global variables', () => {
    const ast = parse(`
      let prefix = "Hello"
      let suffix = "!"
      function addPrefix(msg: text): text {
        return "{prefix}, {msg}"
      }
      function addSuffix(msg: text): text {
        return "{msg}{suffix}"
      }
      function greet(name: text): text {
        let withPrefix = addPrefix(name)
        return addSuffix(withPrefix)
      }
      let result = greet("World")
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('Hello, World!');
  });
});
