import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';

describe('Syntax Errors - Unexpected Tokens', () => {
  // ============================================================================
  // Missing identifiers after keywords
  // ============================================================================

  test('let missing identifier', () => {
    expect(() => parse(`
let = "hello"
`)).toThrow();
  });

  test('const missing identifier', () => {
    expect(() => parse(`
const = "hello"
`)).toThrow();
  });

  test('function missing name', () => {
    expect(() => parse(`
function() {
  return "hello"
}
`)).toThrow();
  });

  test('function with keyword as name', () => {
    expect(() => parse(`
function let() {
  return "hello"
}
`)).toThrow();
  });

  // ============================================================================
  // Keywords in wrong positions
  // ============================================================================

  test('return outside function at top level', () => {
    // Note: This may or may not throw depending on parser design
    // Testing the parser's behavior
    expect(() => parse(`
return "hello"
`)).not.toThrow(); // return is valid as a statement
  });

  test('break at top level', () => {
    // break is syntactically valid, semantics checked at runtime
    expect(() => parse(`
break
`)).not.toThrow();
  });

  test('else without if', () => {
    expect(() => parse(`
else {
  let x = "no"
}
`)).toThrow();
  });

  // ============================================================================
  // Unexpected tokens in declarations
  // ============================================================================

  test('let with string instead of identifier', () => {
    expect(() => parse(`
let "name" = "value"
`)).toThrow();
  });

  test('const with number-like token instead of identifier', () => {
    expect(() => parse(`
const 123 = "value"
`)).toThrow();
  });

  test('function param is keyword', () => {
    expect(() => parse(`
function test(return) {
  return "hello"
}
`)).toThrow();
  });

  // ============================================================================
  // Unexpected tokens in expressions
  // ============================================================================

  test('let inside expression', () => {
    expect(() => parse(`
let x = let y
`)).toThrow();
  });

  test('equals in wrong position', () => {
    expect(() => parse(`
let x = = "hello"
`)).toThrow();
  });

  // ============================================================================
  // Unexpected tokens in blocks
  // ============================================================================

  test('closing brace without opening', () => {
    expect(() => parse(`
let x = "hello"
}
`)).toThrow();
  });

  test('closing paren without opening', () => {
    expect(() => parse(`
let x = "hello")
`)).toThrow();
  });
});
