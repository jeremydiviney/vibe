import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';

function analyze(source: string) {
  const ast = parse(source);
  const analyzer = new SemanticAnalyzer();
  return analyzer.analyze(ast, source);
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
      function add(a, b) {
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
      export function greet(name) {
        return do "Hello {name}" gpt default
      }
    `);
    expect(errors).toHaveLength(0);
  });

  test('valid export variable', () => {
    const errors = analyze(`
      export let counter = "0"
      export const API_KEY = "secret"
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
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/'b' is not defined/);
  });

  test('error: ts block with multiple undefined parameters', () => {
    const errors = analyze(`
      let sum = ts(x, y, z) { return x + y + z }
    `);
    expect(errors).toHaveLength(3);
  });
});
