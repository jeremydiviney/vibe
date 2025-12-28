import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Analysis - Scoping', () => {
  // ============================================================================
  // Block scope isolation
  // ============================================================================

  test('variable in block not accessible outside', () => {
    const ast = parse(`
if true {
  let x = "inside"
}
let y = x
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'x' is not defined");
  });

  test('variable in else block not accessible outside', () => {
    const ast = parse(`
if false {
  let a = "if"
} else {
  let b = "else"
}
let x = b
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'b' is not defined");
  });

  test('variable in nested block not accessible outside', () => {
    const ast = parse(`
if true {
  if true {
    let deep = "nested"
  }
  let x = deep
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'deep' is not defined");
  });

  // ============================================================================
  // Function scope isolation
  // ============================================================================

  test('variable in function not accessible outside', () => {
    const ast = parse(`
function test() {
  let x = "inside"
  return x
}
let y = x
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'x' is not defined");
  });

  test('parameter not accessible outside function', () => {
    const ast = parse(`
function greet(name: text): text {
  return name
}
let x = name
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'name' is not defined");
  });

  // ============================================================================
  // Outer scope access
  // ============================================================================

  test('block can access outer scope', () => {
    const ast = parse(`
let x = "outer"
if true {
  let y = x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('function can access outer scope', () => {
    const ast = parse(`
let x = "outer"
function test() {
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('nested block can access all outer scopes', () => {
    const ast = parse(`
let a = "level1"
if true {
  let b = "level2"
  if true {
    let c = a
    let d = b
  }
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Function parameter access
  // ============================================================================

  test('function body can access parameters', () => {
    const ast = parse(`
function add(a: text): text {
  return a
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('multiple parameters accessible', () => {
    const ast = parse(`
function greet(first: text, last: text): text {
  let full = first
  return last
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('nested block in function can access parameters', () => {
    const ast = parse(`
function test(x: text, flag: boolean): text {
  if flag {
    return x
  }
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Model scope
  // ============================================================================

  test('model accessible in same scope', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = do "prompt" myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('model accessible in nested function', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
function test() {
  let x = do "prompt" myModel default
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('model accessible in nested block', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
if true {
  let x = do "prompt" myModel default
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Complex scoping scenarios
  // ============================================================================

  test('same name in parallel blocks', () => {
    const ast = parse(`
if true {
  let x = "first"
}
if true {
  let x = "second"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('shadowing and access in same function', () => {
    const ast = parse(`
let x = "outer"
function test() {
  let y = x
  let x = "inner"
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('multiple functions with same local variable names', () => {
    const ast = parse(`
function first() {
  let x = "a"
  return x
}
function second() {
  let x = "b"
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Nested function restrictions
  // ============================================================================

  test('function inside if block is not allowed', () => {
    const ast = parse(`
let name = "outer"
if true {
  function greet(name: text): text {
    return name
  }
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Functions can only be declared at global scope');
  });

  test('function inside function is not allowed', () => {
    const ast = parse(`
function outer() {
  function inner() {
    return "nested"
  }
  return inner()
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Functions can only be declared at global scope');
  });

  test('function inside else block is not allowed', () => {
    const ast = parse(`
if false {
  let x = "if"
} else {
  function helper() {
    return "help"
  }
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Functions can only be declared at global scope');
  });

  test('deeply nested function is not allowed', () => {
    const ast = parse(`
function outer() {
  if true {
    function deeplyNested() {
      return "deep"
    }
  }
  return "outer"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Functions can only be declared at global scope');
  });

  test('function at global scope is allowed', () => {
    const ast = parse(`
function topLevel() {
  return "allowed"
}
let result = topLevel()
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });
});
