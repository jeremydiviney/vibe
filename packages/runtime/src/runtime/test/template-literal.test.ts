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

  test('template literal with {var} interpolation', () => {
    const ast = parse(`
      let name = "World"
      let greeting = \`Hello {name}!\`
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
      let full = \`{first} {last}\`
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
      let msg = \`Hello {name},
Welcome to our app!\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Hello Alice,\nWelcome to our app!');
  });

  test('template literal undefined property keeps placeholder', () => {
    const ast = parse(`
      let user = { name: "Alice" }
      let x = \`Hello {user.unknown}!\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    // Undefined property keeps the placeholder
    expect(state.callStack[0].locals['x'].value).toBe('Hello {user.unknown}!');
  });

  test('template literal in function with scope chain', () => {
    const ast = parse(`
      let greeting = "Hello"
      function greet(name: text): text {
        return \`{greeting}, {name}!\`
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
        return \`Hello {name}!\`
      }
      let result = greet()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('Hello Local!');
  });

  test('template literal with object value (JSON stringify)', () => {
    const ast = parse(`
      let data: json = { name: "test" }
      let msg = \`Data: {data}\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    // Objects get JSON stringified
    expect(state.callStack[0].locals['msg'].value).toBe('Data: {"name":"test"}');
  });

  test('template literal with boolean value', () => {
    const ast = parse(`
      let flag = true
      let msg = \`Flag is {flag}\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Flag is true');
  });

  test('regular string uses same {var} syntax as template literals', () => {
    const ast = parse(`
      let name = "World"
      let greeting = "Hello {name}!"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['greeting'].value).toBe('Hello World!');
  });

  test('template literal uses unified {var} syntax', () => {
    const ast = parse(`
      let name = "World"
      let greeting = \`Hello {name}!\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    // {name} IS interpolated in template literals (unified syntax)
    expect(state.callStack[0].locals['greeting'].value).toBe('Hello World!');
  });

  test('template literal with escaped braces', () => {
    const ast = parse(String.raw`
      let name = "World"
      let msg = ` + '`Use \\{name\\} for interpolation`' + `
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Use {name} for interpolation');
  });

  test('dollar sign in template literal is literal', () => {
    // Use regular string parsing to include literal $ in Vibe code
    // In Vibe: `Price: ${price}` - the $ is literal, {price} expands
    const ast = parse('let price = 100\nlet msg = `Price: \\${price}`');
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    // ${price} is NOT valid interpolation syntax - $ is literal, {price} gets expanded
    expect(state.callStack[0].locals['msg'].value).toBe('Price: $100');
  });
});
