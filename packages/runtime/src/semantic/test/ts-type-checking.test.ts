import { describe, expect, test, beforeEach } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';
import { extractFunctionSignature, clearSignatureCache } from '../ts-signatures';
import { checkTsBlockTypes, inferTsBlockReturnType } from '../ts-block-checker';
import { join } from 'path';

// Test fixtures directory
const fixturesDir = join(__dirname, 'fixtures');

describe('TS Signature Extraction', () => {
  beforeEach(() => {
    clearSignatureCache();
  });

  test('extracts function declaration signature', () => {
    const sig = extractFunctionSignature(
      join(fixturesDir, 'math.ts'),
      'add'
    );
    expect(sig).toBeDefined();
    expect(sig!.name).toBe('add');
    expect(sig!.params).toHaveLength(2);
    expect(sig!.params[0]).toEqual({ name: 'a', tsType: 'number', optional: false });
    expect(sig!.params[1]).toEqual({ name: 'b', tsType: 'number', optional: false });
    expect(sig!.returnType).toBe('number');
  });

  test('extracts arrow function signature', () => {
    const sig = extractFunctionSignature(
      join(fixturesDir, 'math.ts'),
      'multiply'
    );
    expect(sig).toBeDefined();
    expect(sig!.name).toBe('multiply');
    expect(sig!.params).toHaveLength(2);
    expect(sig!.params[0].tsType).toBe('number');
    expect(sig!.params[1].tsType).toBe('number');
    expect(sig!.returnType).toBe('number');
  });

  test('extracts function with optional parameter', () => {
    const sig = extractFunctionSignature(
      join(fixturesDir, 'math.ts'),
      'greet'
    );
    expect(sig).toBeDefined();
    expect(sig!.params).toHaveLength(2);
    expect(sig!.params[0]).toEqual({ name: 'name', tsType: 'string', optional: false });
    expect(sig!.params[1].optional).toBe(true);
  });

  test('extracts function with object parameter', () => {
    const sig = extractFunctionSignature(
      join(fixturesDir, 'math.ts'),
      'processData'
    );
    expect(sig).toBeDefined();
    expect(sig!.params).toHaveLength(1);
    // The type should be object-like
    expect(sig!.params[0].name).toBe('data');
  });

  test('returns undefined for non-existent function', () => {
    const sig = extractFunctionSignature(
      join(fixturesDir, 'math.ts'),
      'nonExistent'
    );
    expect(sig).toBeUndefined();
  });

  test('caches extracted signatures', () => {
    const sig1 = extractFunctionSignature(join(fixturesDir, 'math.ts'), 'add');
    const sig2 = extractFunctionSignature(join(fixturesDir, 'math.ts'), 'add');
    expect(sig1).toBe(sig2); // Same object reference (cached)
  });
});

describe('TS Block Return Type Inference', () => {
  test('infers text from string return', () => {
    const type = inferTsBlockReturnType([], 'return "hello"');
    expect(type).toBe('text');
  });

  test('infers number from number return', () => {
    const type = inferTsBlockReturnType([], 'return 42');
    expect(type).toBe('number');
  });

  test('infers boolean from boolean return', () => {
    const type = inferTsBlockReturnType([], 'return true');
    expect(type).toBe('boolean');
  });

  test('infers json from object return', () => {
    const type = inferTsBlockReturnType([], 'return { key: "value" }');
    expect(type).toBe('json');
  });

  test('infers json[] from array return', () => {
    const type = inferTsBlockReturnType([], 'return [1, 2, 3]');
    // Arrays of numbers become number[]
    expect(type).toBe('number[]');
  });

  test('infers type from parameter operation', () => {
    const type = inferTsBlockReturnType(
      [{ name: 'x', vibeType: 'number' }],
      'return x * 2'
    );
    expect(type).toBe('number');
  });

  test('infers text from string concatenation', () => {
    const type = inferTsBlockReturnType(
      [{ name: 's', vibeType: 'text' }],
      'return s + "!"'
    );
    expect(type).toBe('text');
  });

  test('infers null from void return', () => {
    // Note: 'return undefined' and 'return null' are expressions that TS types as 'any'
    // Only bare 'return' (void) maps to null
    const type = inferTsBlockReturnType([], 'return');
    expect(type).toBe('null');
  });
});

describe('TS Block Type Checking', () => {
  test('no errors for valid type usage', () => {
    const errors = checkTsBlockTypes(
      [{ name: 'x', vibeType: 'number' }],
      'return x * 2',
      { line: 1, column: 1 }
    );
    expect(errors).toHaveLength(0);
  });

  test('error for invalid operation on string', () => {
    const errors = checkTsBlockTypes(
      [{ name: 'x', vibeType: 'text' }],
      'return x * 2',
      { line: 1, column: 1 }
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('TypeScript error');
  });

  test('no errors when no typed parameters', () => {
    // If no parameters have types, we skip checking
    const errors = checkTsBlockTypes(
      [],
      'return undefinedVar * 2',
      { line: 1, column: 1 }
    );
    expect(errors).toHaveLength(0);
  });

  test('no errors for external function calls', () => {
    // External functions like fetchData() should not error
    const errors = checkTsBlockTypes(
      [{ name: 'x', vibeType: 'number' }],
      'return externalFunction(x)',
      { line: 1, column: 1 }
    );
    expect(errors).toHaveLength(0);
  });

  test('error includes location info', () => {
    const errors = checkTsBlockTypes(
      [{ name: 's', vibeType: 'text' }],
      'return s * 2',
      { line: 10, column: 5 }
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].location.line).toBeGreaterThanOrEqual(10);
  });

  test('handles multiple parameters', () => {
    const errors = checkTsBlockTypes(
      [
        { name: 'a', vibeType: 'number' },
        { name: 'b', vibeType: 'text' },
      ],
      'return a + b.length',
      { line: 1, column: 1 }
    );
    expect(errors).toHaveLength(0);
  });

  test('handles json type as Record', () => {
    const errors = checkTsBlockTypes(
      [{ name: 'data', vibeType: 'json' }],
      'return data.key',
      { line: 1, column: 1 }
    );
    expect(errors).toHaveLength(0);
  });

  test('prompt type maps to string in ts blocks', () => {
    // prompt should be treated as string, allowing string operations
    const errors = checkTsBlockTypes(
      [{ name: 'p', vibeType: 'prompt' }],
      'return p.toUpperCase()',
      { line: 1, column: 1 }
    );
    expect(errors).toHaveLength(0);
  });

  test('prompt type allows string concatenation', () => {
    const errors = checkTsBlockTypes(
      [{ name: 'p', vibeType: 'prompt' }],
      'return "Hello: " + p',
      { line: 1, column: 1 }
    );
    expect(errors).toHaveLength(0);
  });

  test('prompt type disallows number operations', () => {
    // prompt maps to string, so number operations should fail
    const errors = checkTsBlockTypes(
      [{ name: 'p', vibeType: 'prompt' }],
      'return p * 2',
      { line: 1, column: 1 }
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('Semantic Analyzer - TS Import Type Checking', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string, basePath?: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code, basePath ?? fixturesDir + '/main.vibe');
    return errors.map((e) => e.message);
  }

  test('TS function call with correct types passes', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
let x: number = 5
let result = add(x, 10)
`);
    expect(errors).toEqual([]);
  });

  test('TS function call with wrong arg type errors', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
let x: text = "hi"
let result = add(x, 5)
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('expected number') && e.includes('got text'))).toBe(true);
  });

  test('TS function call with too few arguments errors', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
let result = add(5)
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('requires 2 arguments'))).toBe(true);
  });

  test('TS function call with too many arguments errors', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
let result = add(1, 2, 3)
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('accepts at most'))).toBe(true);
  });

  test('TS function with optional param - missing optional is ok', () => {
    const errors = getErrors(`
import { greet } from "./math.ts"
let result = greet("Alice")
`);
    expect(errors).toEqual([]);
  });

  test('json type is compatible with object params', () => {
    const errors = getErrors(`
import { processData } from "./math.ts"
let data: json = "{}"
processData(data)
`);
    expect(errors).toEqual([]);
  });

  test('text type incompatible with number param', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
let s: text = "hello"
add(s, s)
`);
    expect(errors.length).toBe(2); // Both args wrong
  });

  test('number literal is compatible with number param', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
add(1, 2)
`);
    expect(errors).toEqual([]);
  });

  test('boolean type incompatible with string param', () => {
    const errors = getErrors(`
import { greet } from "./math.ts"
let b: boolean = true
greet(b)
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('expected string') && e.includes('got boolean'))).toBe(true);
  });

  test('prompt type is compatible with string param in TS function', () => {
    const errors = getErrors(`
import { greet } from "./math.ts"
let p: prompt = "Alice"
greet(p)
`);
    expect(errors).toEqual([]);
  });

  test('prompt type works with TS function expecting string', () => {
    const errors = getErrors(`
import { repeat } from "./math.ts"
let p: prompt = "hello"
let result = repeat(p, 3)
`);
    expect(errors).toEqual([]);
  });
});

describe('Semantic Analyzer - ts() Block Type Checking', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code, '');
    return errors.map((e) => e.message);
  }

  test('ts block with valid type usage passes', () => {
    const errors = getErrors(`
let x: number = 5
let result = ts(x) { return x * 2 }
`);
    expect(errors).toEqual([]);
  });

  test('ts block with invalid type usage errors', () => {
    const errors = getErrors(`
let x: text = "hello"
let result = ts(x) { return x * 2 }
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('TypeScript error'))).toBe(true);
  });

  test('ts block with untyped parameter skips checking', () => {
    // If parameter has no type, we can't check it
    const errors = getErrors(`
let x = someFn()
let result = ts(x) { return x * 2 }
`);
    // Should only error about someFn not being defined, not TS type errors
    expect(errors.some(e => e.includes("'someFn' is not defined"))).toBe(true);
  });

  test('ts block with undefined parameter errors', () => {
    const errors = getErrors(`
let result = ts(undefinedVar) { return undefinedVar }
`);
    expect(errors.some(e => e.includes("'undefinedVar' is not defined"))).toBe(true);
  });

  test('ts block with no parameters allows JS globals', () => {
    const errors = getErrors(`
let result = ts() { return fetch("https://example.com") }
`);
    // Should not error - JS globals like fetch are allowed
    expect(errors).toEqual([]);
  });

  test('ts block with json parameter works', () => {
    const errors = getErrors(`
let data: json = "{}"
let result = ts(data) { return data.key }
`);
    expect(errors).toEqual([]);
  });

  test('ts block with multiple typed parameters', () => {
    const errors = getErrors(`
let a: number = 1
let b: text = "hi"
let result = ts(a, b) { return a + b.length }
`);
    expect(errors).toEqual([]);
  });
});

describe('Return Type Inference - ts() Blocks', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code, '');
    return errors.map((e) => e.message);
  }

  test('infers text type from ts block returning string', () => {
    const errors = getErrors(`
let x = ts() { return "hello" }
let y: number = x
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign text to number');
  });

  test('infers number type from ts block returning number', () => {
    const errors = getErrors(`
let x = ts() { return 42 }
let y: text = x
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign number to text');
  });

  test('infers boolean type from ts block returning boolean', () => {
    const errors = getErrors(`
let x = ts() { return true }
let y: text = x
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign boolean to text');
  });

  test('infers array type from ts block returning array', () => {
    const errors = getErrors(`
let x: text = ts() { return [] }
`);
    expect(errors.length).toBe(1);
    // Arrays map to json[] or similar
    expect(errors[0]).toContain('cannot assign');
  });

  test('infers json type from ts block returning object', () => {
    const errors = getErrors(`
let x = ts() { return { key: "value" } }
let y: number = x
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign json to number');
  });

  test('correct inference allows compatible assignment', () => {
    const errors = getErrors(`
let x = ts() { return "hello" }
let y: text = x
`);
    expect(errors).toEqual([]);
  });

  test('infers type through parameter usage', () => {
    const errors = getErrors(`
let a: number = 5
let x = ts(a) { return a * 2 }
let y: text = x
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign number to text');
  });

  test('type mismatch with explicit annotation on ts block variable', () => {
    const errors = getErrors(`
let x: text = ts() { return 42 }
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign number to text');
  });

  test('type mismatch with array return to text', () => {
    const errors = getErrors(`
let x: text = ts() { return [1, 2, 3] }
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign');
  });
});

describe('TS Block Return Type Inference with Imports', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code, fixturesDir + '/main.vibe');
    return errors.map((e) => e.message);
  }

  test('infers text from Record<string, string> index access', () => {
    const errors = getErrors(`
import { API_KEYS } from "./config.ts"
const key: text = ts(API_KEYS) { return API_KEYS["openai"]; }
`);
    expect(errors).toEqual([]);
  });

  test('infers number from Record<string, number> index access', () => {
    const errors = getErrors(`
import { PORTS } from "./config.ts"
const port: number = ts(PORTS) { return PORTS["http"]; }
`);
    expect(errors).toEqual([]);
  });

  test('type error when assigning Record<string,string> result to number', () => {
    const errors = getErrors(`
import { API_KEYS } from "./config.ts"
const key: number = ts(API_KEYS) { return API_KEYS["openai"]; }
`);
    // Should error because API_KEYS returns string, not number
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign text to number');
  });

  test('infers text from imported function returning string', () => {
    const errors = getErrors(`
import { getApiKey } from "./config.ts"
const key: text = ts(getApiKey) { return getApiKey("openai"); }
`);
    expect(errors).toEqual([]);
  });

  test('type error when using string result as number', () => {
    const errors = getErrors(`
import { getApiKey } from "./config.ts"
const key: number = ts(getApiKey) { return getApiKey("openai"); }
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign text to number');
  });

  test('infers text from Record index with variable key', () => {
    const errors = getErrors(`
import { API_KEYS } from "./config.ts"
let provider: text = "openai"
const key: text = ts(API_KEYS, provider) { return API_KEYS[provider]; }
`);
    expect(errors).toEqual([]);
  });

  test('infers number from PORTS with variable key', () => {
    const errors = getErrors(`
import { PORTS } from "./config.ts"
let service: text = "http"
const port: number = ts(PORTS, service) { return PORTS[service]; }
`);
    expect(errors).toEqual([]);
  });

  test('infers text from object property access', () => {
    const errors = getErrors(`
import { DEFAULT_MODEL } from "./config.ts"
const name: text = ts(DEFAULT_MODEL) { return DEFAULT_MODEL.name; }
`);
    expect(errors).toEqual([]);
  });

  test('infers text[] from string array', () => {
    const errors = getErrors(`
import { PROVIDERS } from "./config.ts"
const first: text = ts(PROVIDERS) { return PROVIDERS[0]; }
`);
    expect(errors).toEqual([]);
  });

  test('ts block with multiple imports resolves types correctly', () => {
    const errors = getErrors(`
import { API_KEYS, PORTS } from "./config.ts"
const key: text = ts(API_KEYS) { return API_KEYS["openai"]; }
const port: number = ts(PORTS) { return PORTS["http"]; }
`);
    expect(errors).toEqual([]);
  });

  test('falls back gracefully for unresolvable imports', () => {
    // When import can't be resolved, should fall back to json and allow assignment
    // due to the fallback workaround
    const errors = getErrors(`
import { NONEXISTENT } from "./nonexistent.ts"
const x: text = ts(NONEXISTENT) { return NONEXISTENT["key"]; }
`);
    // Should not crash, errors about missing import are acceptable
    expect(errors.every(e => !e.includes('cannot assign json to text'))).toBe(true);
  });

  test('infers text when accessing imported Record with object property (models.vibe scenario)', () => {
    // This matches the 20-questions-bench models.vibe pattern:
    // const config = getModelConfig(modelId)
    // const apiKeyEnvVar = ts(API_KEYS, config) { return API_KEYS[config.provider]; }
    const errors = getErrors(`
import { API_KEYS, getModelConfig } from "./config.ts"
let modelId: text = "default"
const config = getModelConfig(modelId)
const apiKeyEnvVar: text = ts(API_KEYS, config) { return API_KEYS[config.provider]; }
`);
    expect(errors).toEqual([]);
  });

  test('infers type without annotation when accessing imported Record with object property', () => {
    // Same as above but without explicit type annotation - should infer text
    const errors = getErrors(`
import { API_KEYS, getModelConfig } from "./config.ts"
let modelId: text = "default"
const config = getModelConfig(modelId)
const apiKeyEnvVar = ts(API_KEYS, config) { return API_KEYS[config.provider]; }
let x: number = apiKeyEnvVar
`);
    // Should error because apiKeyEnvVar should be inferred as text, not json
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign text to number');
  });
});

describe('Return Type Inference - Imported TS Functions', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code, fixturesDir + '/main.vibe');
    return errors.map((e) => e.message);
  }

  test('infers number type from TS function returning number', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
let x = add(1, 2)
let y: text = x
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign number to text');
  });

  test('type mismatch when assigning TS function result to wrong type', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
let x: text = add(1, 2)
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign number to text');
  });

  test('correct type assignment from TS function', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
let x: number = add(1, 2)
`);
    expect(errors).toEqual([]);
  });

  test('inferred type allows correct usage', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
let x = add(1, 2)
let y: number = x
`);
    expect(errors).toEqual([]);
  });

  test('infers string type from TS function returning string', () => {
    const errors = getErrors(`
import { greet } from "./math.ts"
let x = greet("Alice")
let y: number = x
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign text to number');
  });

  test('chained inference through TS function and variable', () => {
    const errors = getErrors(`
import { add } from "./math.ts"
let a = add(1, 2)
let b = a
let c: text = b
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('cannot assign number to text');
  });
});
