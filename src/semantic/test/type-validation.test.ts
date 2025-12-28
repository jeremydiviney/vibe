import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';

describe('Semantic Analyzer - Type Validation', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  // ============================================================================
  // Valid type annotations
  // ============================================================================

  test('text type is valid', () => {
    const errors = getErrors('let x: text = "hello"');
    expect(errors).toEqual([]);
  });

  test('json type is valid', () => {
    const errors = getErrors('let x: json = "{\\"key\\": \\"value\\"}"');
    expect(errors).toEqual([]);
  });

  test('prompt type is valid', () => {
    const errors = getErrors('let x: prompt = "What is your name?"');
    expect(errors).toEqual([]);
  });

  test('no type annotation is valid', () => {
    const errors = getErrors('let x = "hello"');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Compile-time literal type validation
  // ============================================================================

  test('boolean type is valid', () => {
    const errors = getErrors('let x: boolean = true');
    expect(errors).toEqual([]);
  });

  test('number type is valid', () => {
    const errors = getErrors('let x: number = 42');
    expect(errors).toEqual([]);
  });

  test('number type with decimal is valid', () => {
    const errors = getErrors('let x: number = 3.14');
    expect(errors).toEqual([]);
  });

  test('text type with boolean literal errors', () => {
    const errors = getErrors('let x: text = true');
    expect(errors).toContain('Type error: cannot assign boolean to text');
  });

  test('text type with number literal errors', () => {
    const errors = getErrors('let x: text = 42');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('number type with string literal errors', () => {
    const errors = getErrors('let x: number = "hello"');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  test('number type with boolean literal errors', () => {
    const errors = getErrors('let x: number = true');
    expect(errors).toContain('Type error: cannot assign boolean to number');
  });

  test('boolean type with string literal errors', () => {
    const errors = getErrors('let x: boolean = "yes"');
    expect(errors).toContain('Type error: cannot assign text to boolean');
  });

  test('boolean type with number literal errors', () => {
    const errors = getErrors('let x: boolean = 1');
    expect(errors).toContain('Type error: cannot assign number to boolean');
  });

  test('const with type mismatch errors', () => {
    const errors = getErrors('const MAX: number = "one hundred"');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  test('number array with string element errors', () => {
    const errors = getErrors('let nums: number[] = [1, 2, "three"]');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  test('boolean array with number element errors', () => {
    const errors = getErrors('let flags: boolean[] = [true, 0, false]');
    expect(errors).toContain('Type error: cannot assign number to boolean');
  });

  test('nested array type validation', () => {
    const errors = getErrors('let matrix: number[][] = [[1, 2], [3, "four"]]');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  // ============================================================================
  // Variable-to-variable type checking
  // ============================================================================

  test('text variable assigned to boolean errors', () => {
    const errors = getErrors('const t: text = "hello"\nconst b: boolean = t');
    expect(errors).toContain('Type error: cannot assign text to boolean');
  });

  test('number variable assigned to text errors', () => {
    const errors = getErrors('let n: number = 42\nlet s: text = n');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('boolean variable assigned to number errors', () => {
    const errors = getErrors('let b: boolean = true\nlet n: number = b');
    expect(errors).toContain('Type error: cannot assign boolean to number');
  });

  test('text variable assigned to text is valid', () => {
    const errors = getErrors('const t: text = "hello"\nconst t2: text = t');
    expect(errors).toEqual([]);
  });

  test('prompt variable assigned to text is valid', () => {
    const errors = getErrors('let p: prompt = "ask"\nlet t: text = p');
    expect(errors).toEqual([]);
  });

  test('text variable assigned to json is valid', () => {
    const errors = getErrors('let t: text = "{}"\nlet j: json = t');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Function parameter type checking
  // ============================================================================

  test('function parameter type mismatch - number to text', () => {
    const errors = getErrors('function greet(name: text) { return name }\ngreet(42)');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('function parameter type mismatch - text to number', () => {
    const errors = getErrors('function double(n: number): number { return n }\ndouble("five")');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  test('function parameter type mismatch - text to boolean', () => {
    const errors = getErrors('function check(flag: boolean) { return flag }\ncheck("yes")');
    expect(errors).toContain('Type error: cannot assign text to boolean');
  });

  test('function parameter with variable type mismatch', () => {
    const errors = getErrors('let n: number = 42\nfunction greet(name: text) { return name }\ngreet(n)');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('function parameter with correct type is valid', () => {
    const errors = getErrors('function greet(name: text) { return name }\ngreet("hello")');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Function return type checking
  // ============================================================================

  test('function return type mismatch - number to text', () => {
    const errors = getErrors('function getNum(): number { return 42 }\nlet s: text = getNum()');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('function return type mismatch - boolean to number', () => {
    const errors = getErrors('function isOk(): boolean { return true }\nlet n: number = isOk()');
    expect(errors).toContain('Type error: cannot assign boolean to number');
  });

  test('function return type mismatch - text to boolean', () => {
    const errors = getErrors('function getName(): text { return "hi" }\nlet b: boolean = getName()');
    expect(errors).toContain('Type error: cannot assign text to boolean');
  });

  test('function return type with correct assignment is valid', () => {
    const errors = getErrors('function getNum(): number { return 42 }\nlet n: number = getNum()');
    expect(errors).toEqual([]);
  });

  test('function return type assigned to compatible type is valid', () => {
    const errors = getErrors('function getPrompt(): prompt { return "ask" }\nlet t: text = getPrompt()');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // JSON literal validation (compile-time)
  // ============================================================================

  test('valid JSON object literal passes', () => {
    const errors = getErrors('let x: json = "{\\"name\\": \\"test\\"}"');
    expect(errors).toEqual([]);
  });

  test('valid JSON array literal passes', () => {
    const errors = getErrors('let x: json = "[1, 2, 3]"');
    expect(errors).toEqual([]);
  });

  test('valid empty object literal passes', () => {
    const errors = getErrors('let x: json = "{}"');
    expect(errors).toEqual([]);
  });

  test('valid empty array literal passes', () => {
    const errors = getErrors('let x: json = "[]"');
    expect(errors).toEqual([]);
  });

  test('invalid JSON literal errors', () => {
    const errors = getErrors('let x: json = "{invalid json}"');
    expect(errors).toContain('Invalid JSON literal');
  });

  test('invalid JSON - missing quotes errors', () => {
    const errors = getErrors('let x: json = "{key: value}"');
    expect(errors).toContain('Invalid JSON literal');
  });

  test('invalid JSON - trailing comma errors', () => {
    const errors = getErrors('let x: json = "{\\"key\\": \\"value\\",}"');
    expect(errors).toContain('Invalid JSON literal');
  });

  test('invalid JSON on const errors', () => {
    const errors = getErrors('const x: json = "not json at all"');
    expect(errors).toContain('Invalid JSON literal');
  });

  // ============================================================================
  // JSON type with non-literal (no compile-time check)
  // ============================================================================

  test('json type with variable reference has no compile-time error', () => {
    const code = `
      let source = "{\\"key\\": \\"value\\"}"
      let x: json = source
    `;
    const errors = getErrors(code);
    expect(errors).toEqual([]);
  });

  test('json type with do expression has no compile-time error', () => {
    const code = `
      model myModel = {
        name: "test",
        apiKey: "key",
        url: "http://example.com"
      }
      let x: json = do "return JSON" myModel default
    `;
    const errors = getErrors(code);
    expect(errors).toEqual([]);
  });
});
