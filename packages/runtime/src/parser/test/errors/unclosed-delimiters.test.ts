import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';
import { ParserError } from '../../../errors';

describe('Syntax Errors - Unclosed Delimiters', () => {
  // ============================================================================
  // Unclosed braces - with location verification
  // ============================================================================

  test('unclosed block statement reports location of opening brace', () => {
    try {
      parse(`
{
  let x = "hello"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unclosed brace '{'");
      expect(err.location?.line).toBe(2); // Line where { is
      expect(err.location?.column).toBe(1);
    }
  });

  test('unclosed function body reports location of opening brace', () => {
    try {
      parse(`
function foo() {
  return "hello"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unclosed brace '{'");
      expect(err.location?.line).toBe(2); // Line where function { is
      expect(err.location?.column).toBe(16); // Column where { is
    }
  });

  test('unclosed if block reports location of opening brace', () => {
    try {
      parse(`
if true {
  let x = "yes"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unclosed brace '{'");
      expect(err.location?.line).toBe(2);
    }
  });

  test('unclosed else block reports location of opening brace', () => {
    try {
      parse(`
if true {
  let x = "yes"
} else {
  let y = "no"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unclosed brace '{'");
      expect(err.location?.line).toBe(4); // Line where else { is
    }
  });

  test('nested unclosed braces reports innermost unclosed', () => {
    try {
      parse(`
function outer() {
  if true {
    let x = "nested"
}
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      // The innermost unclosed brace is the 'if' block's brace
      // But actually the outer function brace is unclosed since only one } appears
      expect(err.message).toContain("Unclosed brace '{'");
      expect(err.location?.line).toBe(2); // The function's { is unclosed
    }
  });

  // ============================================================================
  // Unclosed parentheses - with location verification
  // ============================================================================

  test('unclosed function call reports location of opening paren', () => {
    try {
      parse(`
foo("hello"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unclosed parenthesis '('");
      expect(err.location?.line).toBe(2); // Line where ( is
    }
  });

  test('unclosed function params reports location of opening paren', () => {
    try {
      parse(`
function greet(name, age
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unclosed parenthesis '('");
      expect(err.location?.line).toBe(2);
    }
  });

  test('unclosed grouped expression reports location', () => {
    try {
      parse(`
let x = ("hello"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unclosed parenthesis '('");
      expect(err.location?.line).toBe(2);
    }
  });

  test('nested unclosed parens reports innermost', () => {
    try {
      parse(`
outer(inner("deep"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      // inner( is the innermost unclosed
      expect(err.message).toContain("Unclosed parenthesis '('");
    }
  });

  // ============================================================================
  // Unclosed brackets - with location verification
  // ============================================================================

  test('unclosed array literal reports location', () => {
    try {
      parse(`
let arr = [1, 2, 3
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unclosed bracket '['");
      expect(err.location?.line).toBe(2);
    }
  });

  // ============================================================================
  // Unclosed strings (handled by lexer, not delimiter checker)
  // ============================================================================

  test('unclosed double quote string', () => {
    expect(() => parse(`
let x = "hello
`)).toThrow();
  });

  test('unclosed single quote string', () => {
    expect(() => parse(`
let x = 'hello
`)).toThrow();
  });

  test('unclosed string in function call', () => {
    expect(() => parse(`
greet("hello)
`)).toThrow();
  });

  test('unclosed string in vibe expression', () => {
    expect(() => parse(`
let x = vibe "what is 2+2?
`)).toThrow();
  });

  // ============================================================================
  // Mismatched delimiters
  // ============================================================================

  test('mismatched closing brace vs paren', () => {
    try {
      parse(`
function test() {
  foo(
}
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Mismatched delimiters");
      expect(err.message).toContain("expected closing parenthesis");
    }
  });

  test('unmatched closing brace', () => {
    try {
      parse(`
let x = 1
}
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unmatched closing brace");
      expect(err.location?.line).toBe(3);
    }
  });

  test('unmatched closing paren', () => {
    try {
      parse(`
let x = 1)
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unmatched closing parenthesis");
    }
  });

  test('unmatched closing bracket', () => {
    try {
      parse(`
let x = 1]
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unmatched closing bracket");
    }
  });

  // ============================================================================
  // While loop specific (from user's example)
  // ============================================================================

  test('unclosed while loop reports location of opening brace', () => {
    try {
      parse(`
let keepGoing = true
let count = 0

while keepGoing {
   count = count + 1
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.message).toContain("Unclosed brace '{'");
      expect(err.location?.line).toBe(5); // Line where while { is
    }
  });

  test('unclosed string inside unclosed block', () => {
    expect(() => parse(`
{
  let x = "hello
`)).toThrow();
  });
});
