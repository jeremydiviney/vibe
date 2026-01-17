import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, runUntilPause } from '../index';
import { analyze } from '../../semantic';

describe('String Interpolation - Regular Strings', () => {
  test('{var} expands to value in regular string', () => {
    const ast = parse(`
      let name = "World"
      let greeting = "Hello {name}!"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['greeting'].value).toBe('Hello World!');
  });

  test('{obj.prop} expands to property value', () => {
    const ast = parse(`
      let user = { name: "Alice", age: 30 }
      let msg = "Name: {user.name}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Name: Alice');
  });

  test('{arr[0]} expands to array element', () => {
    const ast = parse(`
      let items = ["first", "second", "third"]
      let msg = "First item: {items[0]}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('First item: first');
  });

  test('{arr[1:3]} expands to array slice', () => {
    const ast = parse(`
      let items = ["a", "b", "c", "d"]
      let msg = "Middle: {items[1:3]}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    // Array slice should be JSON stringified
    expect(state.callStack[0].locals['msg'].value).toBe('Middle: ["b","c"]');
  });

  test('multiple interpolations in one string', () => {
    const ast = parse(`
      let first = "John"
      let last = "Doe"
      let full = "{first} {last}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['full'].value).toBe('John Doe');
  });

  test('private variable can be interpolated in regular strings', () => {
    const ast = parse(`
      let private secret = "hidden"
      let msg = "Secret: {secret}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Secret: hidden');
  });
});

describe('String Interpolation - Escape Sequences', () => {
  test('\\{var\\} produces literal {var}', () => {
    const ast = parse(String.raw`
      let name = "World"
      let literal = "Use \{name\} for interpolation"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['literal'].value).toBe('Use {name} for interpolation');
  });

  test('\\{ escapes opening brace', () => {
    const ast = parse(String.raw`
      let result = "JSON example: \{ key: value \}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('JSON example: { key: value }');
  });

  test('\\\\ produces literal backslash', () => {
    const ast = parse(String.raw`
      let path = "C:\\Users\\test"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['path'].value).toBe('C:\\Users\\test');
  });

  test('mixed escapes and interpolations', () => {
    const ast = parse(String.raw`
      let name = "World"
      let mixed = "Hello {name}, use \{braces\} for refs"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['mixed'].value).toBe('Hello World, use {braces} for refs');
  });
});

describe('String Interpolation - Template Literals (Unified)', () => {
  test('backticks use {var} pattern (not ${var})', () => {
    const ast = parse(`
      let name = "World"
      let greeting = \`Hello {name}!\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['greeting'].value).toBe('Hello World!');
  });

  test('multiline template with {var} interpolation', () => {
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

  test('template literal with property access', () => {
    const ast = parse(`
      let user = { name: "Bob" }
      let msg = \`User: {user.name}\`
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('User: Bob');
  });
});

describe('String Interpolation - Semantic Validation', () => {
  test('!{var} in regular string produces semantic error', () => {
    const ast = parse(`
      let name = "World"
      let msg = "Hello !{name}"
    `);
    const errors = analyze(ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Expansion syntax !{name} is only valid in prompt strings');
  });

  test('undefined variable in interpolation produces error', () => {
    const ast = parse(`
      let msg = "Hello {unknown}!"
    `);
    const errors = analyze(ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("'unknown' is not defined");
  });
});

describe('String Interpolation - Prompt-Typed Variables', () => {
  test('prompt variable {var} leaves literal in string', () => {
    const ast = parse(`
      let name = "World"
      let p: prompt = "Greet {name}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    // In prompt context, {var} is left as-is (reference, not expansion)
    expect(state.callStack[0].locals['p'].value).toBe('Greet {name}');
  });

  test('prompt variable !{var} expands to value', () => {
    const ast = parse(`
      let name = "World"
      let p: prompt = "Greet !{name}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['p'].value).toBe('Greet World');
  });

  test('const prompt variable works the same', () => {
    const ast = parse(`
      let target = "user"
      const PROMPT: prompt = "Help the {target}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['PROMPT'].value).toBe('Help the {target}');
  });
});

describe('String Interpolation - Complex Access Paths', () => {
  test('{obj.nested.prop} deep property access', () => {
    const ast = parse(`
      let data = { user: { name: "Alice" } }
      let msg = "Name: {data.user.name}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Name: Alice');
  });

  test('{arr[0].prop} array element property access', () => {
    const ast = parse(`
      let users = [{ name: "Alice" }, { name: "Bob" }]
      let msg = "First: {users[0].name}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('First: Alice');
  });

  test('{obj.arr[1]} property then index access', () => {
    const ast = parse(`
      let data = { items: ["a", "b", "c"] }
      let msg = "Second: {data.items[1]}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Second: b');
  });

  test('slice with only end index {arr[:2]}', () => {
    const ast = parse(`
      let items = ["a", "b", "c", "d"]
      let msg = "First two: {items[:2]}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('First two: ["a","b"]');
  });

  test('slice with only start index {arr[2:]}', () => {
    const ast = parse(`
      let items = ["a", "b", "c", "d"]
      let msg = "From third: {items[2:]}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('From third: ["c","d"]');
  });
});

describe('String Interpolation - Edge Cases', () => {
  test('undefined property returns placeholder', () => {
    const ast = parse(`
      let user = { name: "Alice" }
      let msg = "Age: {user.age}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    // Undefined property keeps the placeholder
    expect(state.callStack[0].locals['msg'].value).toBe('Age: {user.age}');
  });

  test('null value interpolates as "null"', () => {
    const ast = parse(`
      let x: text = null
      let msg = "Value: {x}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Value: null');
  });

  test('number interpolation', () => {
    const ast = parse(`
      let count = 42
      let msg = "Count: {count}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Count: 42');
  });

  test('boolean interpolation', () => {
    const ast = parse(`
      let flag = true
      let msg = "Flag: {flag}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Flag: true');
  });

  test('object interpolation (JSON stringify)', () => {
    const ast = parse(`
      let obj = { a: 1, b: 2 }
      let msg = "Object: {obj}"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['msg'].value).toBe('Object: {"a":1,"b":2}');
  });
});
