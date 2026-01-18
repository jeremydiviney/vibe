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

  test('null assigned to boolean errors', () => {
    const errors = getErrors('let b: boolean = null');
    expect(errors).toContain('Type error: cannot assign null to boolean');
  });

  test('null assigned to const boolean errors', () => {
    const errors = getErrors('const b: boolean = null');
    // Two errors: const can't be null, and null can't be assigned to boolean
    expect(errors).toContain('Cannot initialize const with null - const values cannot be reassigned');
    expect(errors).toContain('Type error: cannot assign null to boolean');
  });

  test('null assigned to text is valid', () => {
    const errors = getErrors('let t: text = null');
    expect(errors).toEqual([]);
  });

  test('null assigned to number is valid', () => {
    const errors = getErrors('let n: number = null');
    expect(errors).toEqual([]);
  });

  test('null passed to boolean parameter errors', () => {
    const errors = getErrors(`
function check(flag: boolean): boolean { return flag }
let result = check(null)
`);
    expect(errors).toContain('Type error: cannot assign null to boolean');
  });

  test('null as if condition errors', () => {
    const errors = getErrors('if null { let x = 1 }');
    expect(errors).toContain('if condition must be boolean, got null');
  });

  test('null as while condition errors', () => {
    const errors = getErrors('while null { let x = 1 }');
    expect(errors).toContain('while condition must be boolean, got null');
  });

  test('nullable text variable as if condition errors', () => {
    const errors = getErrors(`
let x: text = null
if x { let y = 1 }
`);
    expect(errors).toContain('if condition must be boolean, got text');
  });

  test('nullable text variable as while condition errors', () => {
    const errors = getErrors(`
let x: text = null
while x { let y = 1 }
`);
    expect(errors).toContain('while condition must be boolean, got text');
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

  test('json type with vibe expression has no compile-time error', () => {
    const code = `
      model myModel = {
        name: "test",
        apiKey: "key",
        url: "http://example.com"
      }
      let x: json = vibe "return JSON" myModel default
    `;
    const errors = getErrors(code);
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Range expression validation
  // ============================================================================

  test('valid range with start <= end passes', () => {
    const errors = getErrors('let range = 1..5');
    expect(errors).toEqual([]);
  });

  test('valid range with same start and end passes', () => {
    const errors = getErrors('let range = 3..3');
    expect(errors).toEqual([]);
  });

  test('valid range with negative numbers passes', () => {
    const errors = getErrors('let range = -3..4');
    expect(errors).toEqual([]);
  });

  test('valid range with negative to negative passes', () => {
    const errors = getErrors('let range = -5..-2');
    expect(errors).toEqual([]);
  });

  test('invalid range with start > end errors', () => {
    const errors = getErrors('let range = 5..2');
    expect(errors).toContain('Range start (5) must be <= end (2)');
  });

  test('invalid negative range with start > end errors', () => {
    const errors = getErrors('let range = -2..-5');
    expect(errors).toContain('Range start (-2) must be <= end (-5)');
  });

  test('range with variable bounds has no compile-time error', () => {
    // Can't check at compile time when bounds are variables
    const code = `
      let start: number = 5
      let end: number = 2
      let range = start..end
    `;
    const errors = getErrors(code);
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Function return type handling
  // ============================================================================

  test('function without return type is valid (side-effect function)', () => {
    const errors = getErrors('function logIt() { let x = "hi" }');
    expect(errors).toEqual([]);
  });

  test('function with return type is valid', () => {
    const errors = getErrors('function foo(): text { return "hi" }');
    expect(errors).toEqual([]);
  });

  test('cannot assign void function result to variable', () => {
    const errors = getErrors('function logIt() { let x = "hi" }\nlet y = logIt()');
    expect(errors).toContain("Cannot assign result of 'logIt()' to a variable - function has no return type");
  });

  test('can assign function with return type to variable', () => {
    const errors = getErrors('function getText(): text { return "hi" }\nlet x = getText()');
    expect(errors).toEqual([]);
  });
});
