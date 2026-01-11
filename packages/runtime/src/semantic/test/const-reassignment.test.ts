import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Errors - Const Reassignment', () => {
  // ============================================================================
  // Basic const reassignment
  // ============================================================================

  test('cannot reassign const variable', () => {
    const ast = parse(`
const x = "hello"
x = "world"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Cannot reassign constant 'x'");
  });

  test('can reassign let variable', () => {
    const ast = parse(`
let x = "hello"
x = "world"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Const reassignment in different scopes
  // ============================================================================

  test('cannot reassign const in nested block', () => {
    const ast = parse(`
const x = "hello"
if true {
  x = "world"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Cannot reassign constant 'x'");
  });

  test('cannot reassign const in function', () => {
    const ast = parse(`
const x = "hello"
function test() {
  x = "world"
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Cannot reassign constant 'x'");
  });

  // ============================================================================
  // Shadowing vs reassignment
  // ============================================================================

  test('shadowing const with let in nested scope is valid', () => {
    const ast = parse(`
const x = "outer"
if true {
  let x = "inner"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('shadowing const with const in nested scope is valid', () => {
    const ast = parse(`
const x = "outer"
function test() {
  const x = "inner"
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Multiple reassignments
  // ============================================================================

  test('multiple const reassignments report multiple errors', () => {
    const ast = parse(`
const x = "hello"
x = "world"
x = "again"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe("Cannot reassign constant 'x'");
    expect(errors[1].message).toBe("Cannot reassign constant 'x'");
  });

  test('reassigning different consts reports separate errors', () => {
    const ast = parse(`
const x = "hello"
const y = "world"
x = "new x"
y = "new y"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
  });
});
