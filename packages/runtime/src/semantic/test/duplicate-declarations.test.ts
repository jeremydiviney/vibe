import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Errors - Duplicate Declarations', () => {
  // ============================================================================
  // Basic duplicate declarations
  // ============================================================================

  test('duplicate let declaration', () => {
    const ast = parse(`
let x = "hello"
let x = "world"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'x' is already declared");
  });

  test('duplicate const declaration', () => {
    const ast = parse(`
const x = "hello"
const x = "world"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'x' is already declared");
  });

  test('let and const with same name', () => {
    const ast = parse(`
let x = "hello"
const x = "world"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'x' is already declared");
  });

  test('duplicate function declaration', () => {
    const ast = parse(`
function greet(name: text): text {
  return name
}
function greet(x: text): text {
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'greet' is already declared");
  });

  test('duplicate model declaration', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
model myModel = { name: "test2", apiKey: "key2", url: "http://test2" }
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'myModel' is already declared");
  });

  // ============================================================================
  // Cross-type duplicates
  // ============================================================================

  test('variable and function with same name', () => {
    const ast = parse(`
let greet = "hello"
function greet(name: text): text {
  return name
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'greet' is already declared");
  });

  test('variable and model with same name', () => {
    const ast = parse(`
let myModel = "test"
model myModel = { name: "test", apiKey: "key", url: "http://test" }
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'myModel' is already declared");
  });

  test('function and model with same name', () => {
    const ast = parse(`
function myModel() {
  return "test"
}
model myModel = { name: "test", apiKey: "key", url: "http://test" }
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'myModel' is already declared");
  });

  // ============================================================================
  // Shadowing in nested scopes (valid)
  // ============================================================================

  test('shadowing in block scope is valid', () => {
    const ast = parse(`
let x = "outer"
if true {
  let x = "inner"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('shadowing in function scope is valid', () => {
    const ast = parse(`
let x = "outer"
function test() {
  let x = "inner"
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('function parameter shadows outer variable is valid', () => {
    const ast = parse(`
let name = "outer"
function greet(name: text): text {
  return name
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Multiple duplicates
  // ============================================================================

  test('multiple duplicate declarations', () => {
    const ast = parse(`
let x = "first"
let x = "second"
let x = "third"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe("'x' is already declared");
    expect(errors[1].message).toBe("'x' is already declared");
  });

  test('different duplicate declarations', () => {
    const ast = parse(`
let x = "first"
let y = "first"
let x = "second"
let y = "second"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe("'x' is already declared");
    expect(errors[1].message).toBe("'y' is already declared");
  });
});
