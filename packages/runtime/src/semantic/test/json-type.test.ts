import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Errors - JSON Type Strictness', () => {
  // ============================================================================
  // json type cannot be array
  // ============================================================================

  test('json type rejects array literal', () => {
    const ast = parse(`let x: json = [1, 2, 3]`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('json type expects an object, not an array. Use json[] for arrays.');
  });

  test('json type rejects array of objects literal', () => {
    const ast = parse(`let x: json = [{ a: 1 }, { b: 2 }]`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('json type expects an object, not an array. Use json[] for arrays.');
  });

  test('json type rejects empty array literal', () => {
    const ast = parse(`let x: json = []`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('json type expects an object, not an array. Use json[] for arrays.');
  });

  // ============================================================================
  // json type accepts objects
  // ============================================================================

  test('json type accepts object literal', () => {
    const ast = parse(`let x: json = { name: "Alice", age: 30 }`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('json type accepts empty object literal', () => {
    const ast = parse(`let x: json = {}`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('json type accepts nested object literal', () => {
    const ast = parse(`let x: json = { user: { name: "Bob", items: [1, 2, 3] } }`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // json[] type for arrays
  // ============================================================================

  test('json[] accepts array of objects', () => {
    const ast = parse(`let x: json[] = [{ a: 1 }, { b: 2 }]`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('json[] accepts empty array', () => {
    const ast = parse(`let x: json[] = []`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });
});
