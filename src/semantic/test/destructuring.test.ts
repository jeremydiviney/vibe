import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Validation - Destructuring Declarations', () => {
  // ============================================================================
  // Valid cases
  // ============================================================================

  test('valid const destructuring from do expression', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
const {name: text, age: number} = do "get info" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid let destructuring from do expression', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
let {valid: boolean, reason: text} = do "validate" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid destructuring with array types', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
const {items: text[], counts: number[]} = do "get lists" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Duplicate field names within destructuring pattern
  // ============================================================================

  test('duplicate field name in destructuring pattern', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
const {name: text, name: number} = do "get info" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Duplicate field 'name'");
  });

  test('multiple duplicate field names in pattern', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
const {x: number, y: number, x: text, y: text} = do "get" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toContain("Duplicate field 'x'");
    expect(errors[1].message).toContain("Duplicate field 'y'");
  });

  // ============================================================================
  // Destructuring creates variables that can conflict
  // ============================================================================

  test('destructuring field conflicts with existing variable', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
let name = "existing"
const {name: text, age: number} = do "get info" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'name' is already declared");
  });

  test('destructuring field conflicts with function', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
function greet() { return "hi" }
const {greet: text} = do "get" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'greet' is already declared");
  });

  test('two destructurings with conflicting fields', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
const {name: text} = do "get name" m
const {name: number} = do "get another" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'name' is already declared");
  });

  // ============================================================================
  // Invalid initializer (must be AI expression)
  // ============================================================================

  test('destructuring from string literal is invalid', () => {
    const ast = parse(`
const {name: text} = "not an AI call"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Destructuring assignment requires a do or vibe expression');
  });

  test('destructuring from number is invalid', () => {
    const ast = parse(`
const {value: number} = 42
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Destructuring assignment requires a do or vibe expression');
  });

  test('destructuring from variable is invalid', () => {
    const ast = parse(`
let data = "test"
const {name: text} = data
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Destructuring assignment requires a do or vibe expression');
  });

  // ============================================================================
  // Shadowing in nested scopes (valid)
  // ============================================================================

  test('destructuring in block can shadow outer variable', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
let name = "outer"
if true {
  const {name: text} = do "get" m
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('destructuring in function can shadow outer variable', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
let name = "outer"
function test() {
  const {name: text} = do "get" m
  return name
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Using destructured variables
  // ============================================================================

  test('can use destructured variables', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
const {name: text, age: number} = do "get" m
let greeting = name
let years = age
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('cannot use destructured variable before declaration', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
let x = name
const {name: text} = do "get" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("'name' is not defined");
  });
});
