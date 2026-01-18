import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';

describe('Semantic Analyzer - Type Inference from Literals', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  // ============================================================================
  // String literal inference
  // ============================================================================

  test('infers text type from string literal', () => {
    const errors = getErrors('let x = "hello"\nlet y: number = x');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  test('inferred text assigned to text is valid', () => {
    const errors = getErrors('let x = "hello"\nlet y: text = x');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Number literal inference
  // ============================================================================

  test('infers number type from number literal', () => {
    const errors = getErrors('const n = 42\nlet s: text = n');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('inferred number assigned to number is valid', () => {
    const errors = getErrors('let n = 42\nlet m: number = n');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Boolean literal inference
  // ============================================================================

  test('infers boolean type from boolean literal', () => {
    const errors = getErrors('let b = true\nlet t: text = b');
    expect(errors).toContain('Type error: cannot assign boolean to text');
  });

  test('inferred boolean assigned to boolean is valid', () => {
    const errors = getErrors('let b = true\nlet c: boolean = b');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Chained inference
  // ============================================================================

  test('type propagates through multiple assignments', () => {
    const errors = getErrors('let a = "hi"\nlet b = a\nlet c: number = b');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  // ============================================================================
  // Function return type inference
  // ============================================================================

  test('function return type used for variable type', () => {
    const errors = getErrors('function foo(): text { return "hi" }\nlet x = foo()\nlet y: number = x');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  // ============================================================================
  // Function parameter type checking with inferred args
  // ============================================================================

  test('inferred type checked against function parameter', () => {
    const errors = getErrors('function greet(name: text): text { return name }\nlet n = 42\ngreet(n)');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('inferred type matching parameter is valid', () => {
    const errors = getErrors('function greet(name: text): text { return name }\nlet s = "world"\ngreet(s)');
    expect(errors).toEqual([]);
  });
});
