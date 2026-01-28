import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';
import { validateTsBlockScope } from '../ts-block-scope-validator';
import { join } from 'path';

// Test fixtures directory
const fixturesDir = join(__dirname, 'fixtures');

describe('TS Block Scope Validation - Unit Tests', () => {
  test('allows parameter references', () => {
    const errors = validateTsBlockScope(
      'return x * 2',
      new Set(['x']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows multiple parameters', () => {
    const errors = validateTsBlockScope(
      'return a + b + c',
      new Set(['a', 'b', 'c']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows local variable declarations', () => {
    const errors = validateTsBlockScope(
      'const helper = 10; return helper * 2',
      new Set([]),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows local let declarations', () => {
    const errors = validateTsBlockScope(
      'let sum = 0; sum += 10; return sum',
      new Set([]),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows JS globals - JSON', () => {
    const errors = validateTsBlockScope(
      'return JSON.stringify(obj)',
      new Set(['obj']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows JS globals - Math', () => {
    const errors = validateTsBlockScope(
      'return Math.floor(3.5)',
      new Set([]),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows JS globals - console', () => {
    const errors = validateTsBlockScope(
      'console.log("hi"); return 1',
      new Set([]),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows JS globals - Array methods', () => {
    const errors = validateTsBlockScope(
      'return Array.isArray(items)',
      new Set(['items']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows arrow function parameters', () => {
    const errors = validateTsBlockScope(
      'return items.map(x => x * 2)',
      new Set(['items']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows destructuring in arrow functions', () => {
    const errors = validateTsBlockScope(
      'return items.map(({ name, value }) => name + value)',
      new Set(['items']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows object destructuring in const', () => {
    const errors = validateTsBlockScope(
      'const { a, b } = obj; return a + b',
      new Set(['obj']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows array destructuring in const', () => {
    const errors = validateTsBlockScope(
      'const [first, second] = arr; return first + second',
      new Set(['arr']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows nested property access', () => {
    const errors = validateTsBlockScope(
      'return obj.nested.deep.value',
      new Set(['obj']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows method calls on parameters', () => {
    const errors = validateTsBlockScope(
      'return str.toLowerCase().trim()',
      new Set(['str']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('errors on undefined variable access', () => {
    const errors = validateTsBlockScope(
      'return undefinedVar + 1',
      new Set([]),
      { line: 1, column: 1 }
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('undefinedVar');
    expect(errors[0].message).toContain('not accessible');
  });

  test('errors on variable not passed as parameter', () => {
    const errors = validateTsBlockScope(
      'return secret + known',
      new Set(['known']),
      { line: 1, column: 1 }
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('secret');
  });

  test('errors on imported value not passed as parameter', () => {
    const errors = validateTsBlockScope(
      'return API_KEYS["openai"]',
      new Set([]),
      { line: 1, column: 1 }
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('API_KEYS');
  });

  test('errors on multiple undefined variables', () => {
    const errors = validateTsBlockScope(
      'return first + second + third',
      new Set([]),
      { line: 1, column: 1 }
    );
    expect(errors.length).toBe(3);
  });

  test('allows shorthand property names that ARE parameters', () => {
    const errors = validateTsBlockScope(
      'return { name }',
      new Set(['name']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('errors on shorthand property names that are NOT parameters', () => {
    const errors = validateTsBlockScope(
      'return { unknownProp }',
      new Set([]),
      { line: 1, column: 1 }
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('unknownProp');
  });

  test('allows local function declarations', () => {
    const errors = validateTsBlockScope(
      'function helper(x: number) { return x * 2 }; return helper(5)',
      new Set([]),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows try-catch with error variable', () => {
    const errors = validateTsBlockScope(
      'try { return doSomething() } catch (e) { return e.message }',
      new Set(['doSomething']),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });

  test('allows Promise constructor', () => {
    const errors = validateTsBlockScope(
      'return new Promise((resolve, reject) => resolve(42))',
      new Set([]),
      { line: 1, column: 1 }
    );
    expect(errors).toEqual([]);
  });
});

describe('TS Block Scope Validation - Integration Tests', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string, basePath?: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code, basePath ?? fixturesDir + '/main.vibe');
    return errors.map((e) => e.message);
  }

  test('allows parameter references in ts block', () => {
    const errors = getErrors(`
let x = 42
let result = ts(x) { return x * 2 }
`);
    expect(errors).toEqual([]);
  });

  test('allows renamed parameter references', () => {
    const errors = getErrors(`
let longVariableName = 42
let result = ts(n=longVariableName) { return n * 2 }
`);
    expect(errors).toEqual([]);
  });

  test('allows local declarations inside ts block', () => {
    const errors = getErrors(`
let result = ts() {
  const helper = 10;
  return helper * 2;
}
`);
    expect(errors).toEqual([]);
  });

  test('allows JS globals', () => {
    const errors = getErrors(`
let obj: json = { key: "value" }
let result = ts(obj) { return JSON.stringify(obj) }
`);
    expect(errors).toEqual([]);
  });

  test('allows Math global', () => {
    const errors = getErrors(`
let result = ts() { return Math.floor(3.5) }
`);
    expect(errors).toEqual([]);
  });

  test('allows console global', () => {
    const errors = getErrors(`
let result = ts() { console.log("hi"); return 1 }
`);
    expect(errors).toEqual([]);
  });

  test('allows array methods with arrow functions', () => {
    const errors = getErrors(`
let items: number[] = [1, 2, 3]
let result = ts(items) { return items.map(x => x * 2) }
`);
    expect(errors).toEqual([]);
  });

  test('allows filter with arrow function', () => {
    const errors = getErrors(`
let items: number[] = [1, 2, 3, 4, 5]
let result = ts(items) { return items.filter(x => x > 2) }
`);
    expect(errors).toEqual([]);
  });

  test('errors on Vibe variable not passed as parameter', () => {
    const errors = getErrors(`
let secret = "my-api-key"
let result = ts() { return secret }
`);
    expect(errors.some(e => e.includes('secret') && e.includes('not accessible'))).toBe(true);
  });

  test('errors on using original name instead of renamed binding', () => {
    const errors = getErrors(`
let originalName = 42
let result = ts(n=originalName) { return originalName * 2 }
`);
    expect(errors.some(e => e.includes('originalName') && e.includes('not accessible'))).toBe(true);
  });

  test('errors on accessing import without passing as parameter', () => {
    const errors = getErrors(`
import { API_KEYS } from "./config.ts"
let result = ts() { return API_KEYS["openai"] }
`);
    expect(errors.some(e => e.includes('API_KEYS') && e.includes('not accessible'))).toBe(true);
  });

  test('allows import when passed as parameter', () => {
    const errors = getErrors(`
import { API_KEYS } from "./config.ts"
let result = ts(API_KEYS) { return API_KEYS["openai"] }
`);
    expect(errors).toEqual([]);
  });

  test('allows multiple parameters', () => {
    const errors = getErrors(`
let a = 1
let b = 2
let result = ts(a, b) { return a + b }
`);
    expect(errors).toEqual([]);
  });

  test('complex example with import, param, and local', () => {
    const errors = getErrors(`
import { API_KEYS } from "./config.ts"
let provider: text = "openai"
let result = ts(API_KEYS, provider) {
  const key = API_KEYS[provider];
  return key;
}
`);
    expect(errors).toEqual([]);
  });
});
