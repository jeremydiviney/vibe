import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';

describe('Semantic Analyzer - Object and Array Literals', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  // ============================================================================
  // Valid cases
  // ============================================================================

  test('object literal with string values is valid', () => {
    const errors = getErrors('let x = {name: "test"}');
    expect(errors).toEqual([]);
  });

  test('array literal with string values is valid', () => {
    const errors = getErrors('let x = ["a", "b", "c"]');
    expect(errors).toEqual([]);
  });

  test('object literal with defined variable reference is valid', () => {
    const errors = getErrors(`
      let name = "alice"
      let x = {user: name}
    `);
    expect(errors).toEqual([]);
  });

  test('array literal with defined variable reference is valid', () => {
    const errors = getErrors(`
      let item = "first"
      let x = [item, "second"]
    `);
    expect(errors).toEqual([]);
  });

  test('nested object literal is valid', () => {
    const errors = getErrors('let x = {outer: {inner: "value"}}');
    expect(errors).toEqual([]);
  });

  test('nested array literal is valid', () => {
    const errors = getErrors('let x = [["a"], ["b"]]');
    expect(errors).toEqual([]);
  });

  test('array of objects is valid', () => {
    const errors = getErrors('let x = [{name: "a"}, {name: "b"}]');
    expect(errors).toEqual([]);
  });

  test('object with array property is valid', () => {
    const errors = getErrors('let x = {items: ["a", "b"]}');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Undefined variable errors
  // ============================================================================

  test('undefined variable in object literal value', () => {
    const errors = getErrors('let x = {name: undefined_var}');
    expect(errors).toContain("'undefined_var' is not defined");
  });

  test('undefined variable in array literal element', () => {
    const errors = getErrors('let x = ["valid", undefined_var]');
    expect(errors).toContain("'undefined_var' is not defined");
  });

  test('undefined variable in nested object', () => {
    const errors = getErrors('let x = {outer: {inner: undefined_var}}');
    expect(errors).toContain("'undefined_var' is not defined");
  });

  test('undefined variable in nested array', () => {
    const errors = getErrors('let x = [["valid"], [undefined_var]]');
    expect(errors).toContain("'undefined_var' is not defined");
  });

  test('undefined variable in object inside array', () => {
    const errors = getErrors('let x = [{name: undefined_var}]');
    expect(errors).toContain("'undefined_var' is not defined");
  });

  test('undefined variable in array inside object', () => {
    const errors = getErrors('let x = {items: [undefined_var]}');
    expect(errors).toContain("'undefined_var' is not defined");
  });

  test('multiple undefined variables reported', () => {
    const errors = getErrors('let x = {a: undefined1, b: undefined2}');
    expect(errors).toContain("'undefined1' is not defined");
    expect(errors).toContain("'undefined2' is not defined");
  });

  // ============================================================================
  // With type annotations
  // ============================================================================

  test('json type with object literal is valid', () => {
    const errors = getErrors('let x: json = {name: "test"}');
    expect(errors).toEqual([]);
  });

  test('json type with array literal is valid', () => {
    const errors = getErrors('let x: json = ["a", "b"]');
    expect(errors).toEqual([]);
  });

  test('json type with undefined variable in literal still errors', () => {
    const errors = getErrors('let x: json = {name: undefined_var}');
    expect(errors).toContain("'undefined_var' is not defined");
  });
});
