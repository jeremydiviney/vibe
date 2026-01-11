import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';

describe('Syntax Errors - Nested Blocks', () => {
  // ============================================================================
  // Missing closing braces at different levels
  // ============================================================================

  test('missing closing brace on outer function', () => {
    expect(() => parse(`
function outer() {
  function inner() {
    return "nested"
  }
`)).toThrow();
  });

  test('missing closing brace on inner function', () => {
    expect(() => parse(`
function outer() {
  function inner() {
    return "nested"
}
`)).toThrow();
  });

  test('missing closing brace on outer if', () => {
    expect(() => parse(`
if a {
  if b {
    let x = "nested"
  }
`)).toThrow();
  });

  test('missing closing brace on inner if', () => {
    expect(() => parse(`
if a {
  if b {
    let x = "nested"
}
`)).toThrow();
  });

  test('missing closing brace on deeply nested block', () => {
    expect(() => parse(`
{
  {
    {
      let deep = "value"
    }
  }
`)).toThrow();
  });

  test('missing middle closing brace', () => {
    expect(() => parse(`
{
  {
    let inner = "value"
  }
`)).toThrow();
  });

  // ============================================================================
  // Missing closing braces in mixed nesting
  // ============================================================================

  test('function with unclosed if inside', () => {
    expect(() => parse(`
function test() {
  if condition {
    let x = "value"
}
`)).toThrow();
  });

  test('if with unclosed block inside', () => {
    expect(() => parse(`
if condition {
  {
    let x = "value"
}
`)).toThrow();
  });

  test('function with unclosed nested function', () => {
    expect(() => parse(`
function outer() {
  function inner() {
    if x {
      return "deep"
    }
}
`)).toThrow();
  });

  // ============================================================================
  // Multiple unclosed braces
  // ============================================================================

  test('two unclosed braces', () => {
    expect(() => parse(`
function test() {
  if x {
    let y = "value"
`)).toThrow();
  });

  test('three unclosed braces', () => {
    expect(() => parse(`
function test() {
  {
    if x {
      let y = "value"
`)).toThrow();
  });

  // ============================================================================
  // Unclosed else blocks in nesting
  // ============================================================================

  test('unclosed else in nested if', () => {
    expect(() => parse(`
function test() {
  if a {
    let x = "yes"
  } else {
    let y = "no"
}
`)).toThrow();
  });

  test('unclosed else-if in nested structure', () => {
    expect(() => parse(`
function test() {
  if a {
    let x = "first"
  } else if b {
    let y = "second"
}
`)).toThrow();
  });

  // ============================================================================
  // Extra closing braces
  // ============================================================================

  test('extra closing brace after nested blocks', () => {
    expect(() => parse(`
function test() {
  if x {
    let y = "value"
  }
}
}
`)).toThrow();
  });

  test('extra closing brace inside function', () => {
    expect(() => parse(`
function test() {
  let x = "value"
  }
}
`)).toThrow();
  });

  // ============================================================================
  // Misplaced braces
  // ============================================================================

  test('closing brace before opening in nested context', () => {
    expect(() => parse(`
function test() {
  }
  if x {
    let y = "value"
  }
}
`)).toThrow();
  });

  test('opening brace without statement in nesting', () => {
    expect(() => parse(`
function test() {
  { {
    let x = "value"
  }
}
`)).toThrow(); // Missing closing brace for inner block
  });

  // ============================================================================
  // Incomplete statements in nested blocks
  // ============================================================================

  test('incomplete let in nested block', () => {
    expect(() => parse(`
function test() {
  if x {
    let y =
  }
}
`)).toThrow();
  });

  test('incomplete const in deeply nested block', () => {
    expect(() => parse(`
function outer() {
  function inner() {
    const x =
  }
}
`)).toThrow();
  });

  test('incomplete function declaration in nested block', () => {
    expect(() => parse(`
function outer() {
  function inner(
  }
}
`)).toThrow();
  });
});
