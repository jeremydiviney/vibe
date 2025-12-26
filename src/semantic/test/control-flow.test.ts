import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Errors - Control Flow', () => {
  // ============================================================================
  // Return outside function
  // ============================================================================

  test('return at top level', () => {
    const ast = parse(`
return "hello"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('return outside of function');
  });

  test('return in if block at top level', () => {
    const ast = parse(`
if true {
  return "hello"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('return outside of function');
  });

  test('return in else block at top level', () => {
    const ast = parse(`
if false {
  let x = "no"
} else {
  return "hello"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('return outside of function');
  });

  test('return in nested blocks at top level', () => {
    const ast = parse(`
if true {
  if true {
    return "hello"
  }
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('return outside of function');
  });

  // ============================================================================
  // Valid return statements
  // ============================================================================

  test('return inside function', () => {
    const ast = parse(`
function test() {
  return "hello"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('return inside if block in function', () => {
    const ast = parse(`
function test(x: text): text {
  if x {
    return "yes"
  }
  return "no"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('return inside else block in function', () => {
    const ast = parse(`
function test(x: text): text {
  if x {
    return "yes"
  } else {
    return "no"
  }
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('return inside nested blocks in function', () => {
    const ast = parse(`
function test(x: text): text {
  if x {
    if true {
      return "deep"
    }
  }
  return "default"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('return with no value inside function', () => {
    const ast = parse(`
function test() {
  return
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Multiple return errors
  // ============================================================================

  test('multiple returns at top level', () => {
    const ast = parse(`
return "first"
return "second"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe('return outside of function');
    expect(errors[1].message).toBe('return outside of function');
  });

  // ============================================================================
  // Combined with other errors
  // ============================================================================

  test('return outside function with undefined variable', () => {
    const ast = parse(`
return undefinedVar
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe('return outside of function');
    expect(errors[1].message).toBe("'undefinedVar' is not defined");
  });
});
