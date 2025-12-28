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
function test(x: boolean): text {
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
function test(x: boolean): text {
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
function test(x: boolean): text {
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

  // ============================================================================
  // If condition type checking
  // ============================================================================

  test('if with non-boolean literal condition errors', () => {
    const ast = parse(`
if "test" {
  let y = 1
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('if condition must be boolean, got text');
  });

  test('if with non-boolean typed variable condition errors', () => {
    const ast = parse(`
const x: text = "test"
if x {
  let y = 1
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('if condition must be boolean, got text');
  });

  test('if with number literal condition errors', () => {
    const ast = parse(`
if 5 {
  let y = 1
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('if condition must be boolean, got number');
  });

  test('if with boolean literal condition passes', () => {
    const ast = parse(`
if true {
  let y = 1
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('if with boolean typed variable condition passes', () => {
    const ast = parse(`
let flag: boolean = true
if flag {
  let y = 1
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

  // ============================================================================
  // While loop semantic checks
  // ============================================================================

  test('while loop with undefined condition variable', () => {
    const ast = parse(`
while undefinedVar {
  let x = 1
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedVar' is not defined");
  });

  test('while loop with valid condition', () => {
    const ast = parse(`
let keepGoing = true
while keepGoing {
  keepGoing = false
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('while loop body variables not visible outside', () => {
    const ast = parse(`
while true {
  let innerVar = 1
}
let x = innerVar
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'innerVar' is not defined");
  });

  test('while loop can access outer variables', () => {
    const ast = parse(`
let outerVar = true
while outerVar {
  outerVar = false
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('nested while loops have proper scoping', () => {
    const ast = parse(`
let outer = true
while outer {
  let middle = true
  while middle {
    let inner = true
    middle = false
  }
  outer = false
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('return inside while loop in function is valid', () => {
    const ast = parse(`
function test(): boolean {
  while true {
    return true
  }
  return false
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('return inside while loop at top level is invalid', () => {
    const ast = parse(`
while true {
  return true
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('return outside of function');
  });

  test('while with non-boolean literal condition errors', () => {
    const ast = parse(`
while "test" {
  let y = 1
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('while condition must be boolean, got text');
  });

  test('while with non-boolean typed variable condition errors', () => {
    const ast = parse(`
const x: text = "test"
while x {
  let y = 1
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('while condition must be boolean, got text');
  });

  test('while with number literal condition errors', () => {
    const ast = parse(`
while 5 {
  let y = 1
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('while condition must be boolean, got number');
  });

  test('while with untyped variable condition passes (runtime check)', () => {
    // Variables without type annotations can't be checked at compile time
    const ast = parse(`
const x = "test"
while x {
  let y = 1
}
`);
    const errors = analyze(ast);
    // No semantic errors - no type annotation means runtime check
    expect(errors.length).toBe(0);
  });
});
