import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';
import { join } from 'path';

// Test fixtures directory
const fixturesDir = join(__dirname, 'fixtures');

function analyze(source: string, basePath?: string) {
  const ast = parse(source);
  const analyzer = new SemanticAnalyzer();
  return analyzer.analyze(ast, source, basePath);
}

describe('Semantic Analysis - Import Declarations', () => {
  test('valid import declaration', () => {
    const errors = analyze(`
      import { add } from "./math.ts"
      let result = add("1", "2")
    `);
    expect(errors).toHaveLength(0);
  });

  test('multiple imports from same file', () => {
    const errors = analyze(`
      import { add, subtract } from "./math.ts"
      let sum = add("1", "2")
      let diff = subtract("5", "3")
    `);
    expect(errors).toHaveLength(0);
  });

  test('imports from different files', () => {
    const errors = analyze(`
      import { add } from "./math.ts"
      import { greet } from "./greet.vibe"
      let sum = add("1", "2")
      let greeting = greet("Alice")
    `);
    expect(errors).toHaveLength(0);
  });

  test('error: duplicate import name from different sources', () => {
    const errors = analyze(`
      import { helper } from "./a.ts"
      import { helper } from "./b.ts"
    `);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/already imported/);
  });

  test('error: import conflicts with local function', () => {
    const errors = analyze(`
      function add(a: text, b: text): text {
        return a
      }
      import { add } from "./math.ts"
    `);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/conflicts with existing function/);
  });

  test('error: import conflicts with local variable', () => {
    const errors = analyze(`
      let counter = "0"
      import { counter } from "./state.ts"
    `);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/conflicts with existing variable/);
  });

  test('error: import conflicts with model', () => {
    const errors = analyze(`
      model gpt = { name: "gpt-4", apiKey: "key", url: "url" }
      import { gpt } from "./models.ts"
    `);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/conflicts with existing model/);
  });

  test('error: cannot reassign import', () => {
    const errors = analyze(`
      import { counter } from "./state.ts"
      counter = "new value"
    `);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Cannot reassign imported/);
  });
});

describe('Semantic Analysis - Export Declarations', () => {
  test('valid export function', () => {
    const errors = analyze(`
      model gpt = { name: "gpt-4", apiKey: "key", url: "url" }
      export function greet(name: text): text {
        return vibe "Hello {name}" gpt default
      }
    `);
    expect(errors).toHaveLength(0);
  });

  test('valid export const', () => {
    const errors = analyze(`
      export const API_KEY = "secret"
      export const COUNT = 42
    `);
    expect(errors).toHaveLength(0);
  });

  test('valid export model', () => {
    const errors = analyze(`
      export model gpt = { name: "gpt-4", apiKey: "key", url: "url" }
    `);
    expect(errors).toHaveLength(0);
  });

  test('error: duplicate export names', () => {
    const errors = analyze(`
      export function foo() { return "a" }
      export function foo() { return "b" }
    `);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/already declared/);
  });
});

describe('Semantic Analysis - TsBlock', () => {
  test('valid ts block with defined parameters', () => {
    const errors = analyze(`
      let a = "5"
      let b = "3"
      let sum = ts(a, b) { return a + b }
    `);
    expect(errors).toHaveLength(0);
  });

  test('error: ts block with undefined parameter', () => {
    const errors = analyze(`
      let a = "5"
      let sum = ts(a, b) { return a + b }
    `);
    // 2 errors:
    // 1. 'b' is not defined (parameter validation)
    // 2. 'b' is not accessible in ts block (scope validation - only 'a' is allowed)
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toMatch(/'b' is not defined/);
    expect(errors[1].message).toMatch(/'b' is not accessible/);
  });

  test('error: ts block with multiple undefined parameters', () => {
    const errors = analyze(`
      let sum = ts(x, y, z) { return x + y + z }
    `);
    // 3 errors for x, y, z not being defined (parameter validation)
    // Note: scope validator runs with empty param set since params failed validation,
    // so we also get 3 scope errors for x, y, z not being accessible
    expect(errors).toHaveLength(6);
  });

  test('ts block with member access param resolves type', () => {
    const errors = analyze(`
      model m = { name: "gpt-4", apiKey: "key", url: "http://test" }
      let n = ts(name=m.name) { return name.length }
    `);
    // m.name resolves to 'text' -> string, .length is valid
    expect(errors).toHaveLength(0);
  });

  test('ts block with array index param resolves element type', () => {
    const errors = analyze(`
      let items: number[] = [1, 2, 3]
      let first = ts(x=items[0]) { return x * 2 }
    `);
    // items[0] resolves to 'number', x * 2 is valid
    expect(errors).toHaveLength(0);
  });

  test('ts block with negative index param resolves element type', () => {
    const errors = analyze(`
      let items: number[] = [10, 20, 30]
      let last = ts(x=items[-1]) { return x + 1 }
    `);
    // items[-1] resolves to 'number', x + 1 is valid
    expect(errors).toHaveLength(0);
  });

  test('ts block with slice param resolves array type', () => {
    const errors = analyze(`
      let items: number[] = [1, 2, 3, 4]
      let sub = ts(arr=items[1:3]) { return arr.length }
    `);
    // items[1:3] resolves to 'number[]', .length is valid
    expect(errors).toHaveLength(0);
  });

  test('ts block with chained member and index access', () => {
    const errors = analyze(`
      model m = { name: "gpt-4", apiKey: "key", url: "http://test" }
      let u = ts(usage=m.usage) { return usage.length }
    `);
    // m.usage resolves to 'json[]', .length is valid
    expect(errors).toHaveLength(0);
  });

  test('ts block type error for invalid operation on resolved type', () => {
    const errors = analyze(`
      let items: text[] = ["a", "b", "c"]
      let bad = ts(x=items[0]) { return x * 2 }
    `);
    // items[0] resolves to 'text' (string), x * 2 is a type error
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('Semantic Analysis - Vibe Import Validation', () => {
  const mainFile = join(fixturesDir, 'main.vibe');

  test('valid import of exported function from vibe file', () => {
    const errors = analyze(`
      import { greet } from "./exports.vibe"
      let msg = greet("world")
    `, mainFile);
    expect(errors).toHaveLength(0);
  });

  test('valid import of multiple exports from vibe file', () => {
    const errors = analyze(`
      import { greet, add, VERSION } from "./exports.vibe"
      let msg = greet("world")
    `, mainFile);
    expect(errors).toHaveLength(0);
  });

  test('valid import of exported model from vibe file', () => {
    const errors = analyze(`
      import { testModel } from "./exports.vibe"
      let x: text = "test"
    `, mainFile);
    expect(errors).toHaveLength(0);
  });

  test('error: import non-existent function from vibe file', () => {
    const errors = analyze(`
      import { nonExistent } from "./exports.vibe"
    `, mainFile);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/'nonExistent' is not exported from/);
  });

  test('error: import non-exported private function from vibe file', () => {
    const errors = analyze(`
      import { privateHelper } from "./exports.vibe"
    `, mainFile);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/'privateHelper' is not exported from/);
  });

  test('error: import non-exported constant from vibe file', () => {
    const errors = analyze(`
      import { INTERNAL_SECRET } from "./exports.vibe"
    `, mainFile);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/'INTERNAL_SECRET' is not exported from/);
  });

  test('error: import mix of valid and invalid from vibe file', () => {
    const errors = analyze(`
      import { greet, fakeFunction, VERSION } from "./exports.vibe"
    `, mainFile);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/'fakeFunction' is not exported from/);
  });
});
