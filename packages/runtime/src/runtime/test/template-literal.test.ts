import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, runUntilPause } from '../index';

describe('Runtime - Template Literals', () => {
  test('basic template literal without interpolation', () => {
    const ast = parse('let x = `hello world`');
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['x'].value).toBe('hello world');
  });

  test('template literal with ${var} interpolation', () => {
    const ast = parse(`
      let name = "World"
      let greeting = \`Hello \${name}!\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['greeting'].value).toBe('Hello World!');
  });

  test('template literal with multiple interpolations', () => {
    const ast = parse(`
      let first = "John"
      let last = "Doe"
      let full = \`\${first} \${last}\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['full'].value).toBe('John Doe');
  });

  test('template literal multiline preserved', () => {
    const ast = parse(`let x = \`line1
line2
line3\``);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['x'].value).toBe('line1\nline2\nline3');
  });

  test('template literal with multiline and interpolation', () => {
    const ast = parse(`
      let name = "Alice"
      let msg = \`Hello \${name},
Welcome to our app!\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Hello Alice,\nWelcome to our app!');
  });

  test('template literal undefined variable stays as placeholder', () => {
    const ast = parse('let x = `Hello ${unknown}!`');
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['x'].value).toBe('Hello ${unknown}!');
  });

  test('template literal in function with scope chain', () => {
    const ast = parse(`
      let greeting = "Hello"
      function greet(name: text): text {
        return \`\${greeting}, \${name}!\`
      }
      let result = greet("World")
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('Hello, World!');
  });

  test('template literal shadowing in function', () => {
    const ast = parse(`
      let name = "Global"
      function greet() {
        let name = "Local"
        return \`Hello \${name}!\`
      }
      let result = greet()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('Hello Local!');
  });

  test('template literal with object value', () => {
    const ast = parse(`
      let data: json = { name: "test" }
      let msg = \`Data: \${data}\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    // Objects get stringified with [object Object] by default
    expect(state.callStack[0].locals['msg'].value).toBe('Data: [object Object]');
  });

  test('template literal with boolean value', () => {
    const ast = parse(`
      let flag = true
      let msg = \`Flag is \${flag}\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Flag is true');
  });

  test('regular string still uses {var} syntax', () => {
    const ast = parse(`
      let name = "World"
      let greeting = "Hello {name}!"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['greeting'].value).toBe('Hello World!');
  });

  test('template literal does not use {var} syntax', () => {
    const ast = parse(`
      let name = "World"
      let greeting = \`Hello {name}!\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    // {name} should NOT be interpolated in template literals
    expect(state.callStack[0].locals['greeting'].value).toBe('Hello {name}!');
  });
});
