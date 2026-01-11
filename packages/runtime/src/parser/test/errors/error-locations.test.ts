import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';
import { ParserError, LexerError } from '../../../errors';

describe('Error Locations', () => {
  // ============================================================================
  // Parser error locations
  // ============================================================================

  test('missing closing brace reports error', () => {
    try {
      parse(`
let x = "first"
let y = "second"
if condition {
  let z = "inside"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      // EOF token may not have line info, but error should exist
      expect(err.location).toBeDefined();
    }
  });

  test('unexpected token reports correct line and column', () => {
    try {
      parse(`
let a = "one"
let b = "two"
let = "missing identifier"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.location?.line).toBe(4);
      expect(err.location?.column).toBe(5); // position of '='
    }
  });

  test('missing function body reports correct line', () => {
    try {
      parse(`
let setup = "before"

function broken()

let after = "this line"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.location?.line).toBe(6); // 'let' on line 6 instead of '{'
    }
  });

  test('invalid expression in nested block reports correct line', () => {
    try {
      parse(`
function outer() {
  let a = "first"
  if condition {
    let b = = "double equals"
  }
}
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.location?.line).toBe(5);
    }
  });

  test('unclosed string in call reports correct line', () => {
    try {
      parse(`
let x = "before"
let y = "middle"
foo("unclosed
let z = "after"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      // Unclosed string is a lexer error
      expect(e).toBeInstanceOf(LexerError);
      const err = e as LexerError;
      // Lexer reports error on the line after the unclosed string
      expect(err.location?.line).toBe(5);
    }
  });

  test('missing closing brace in function reports error', () => {
    try {
      parse(`
function test() {
  let a = "one"
  let b = "two"
  let c = "three"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      // EOF token may not have line info, but error should exist
      expect(err.location).toBeDefined();
    }
  });

  // ============================================================================
  // Lexer error locations
  // ============================================================================

  test('unclosed string reports correct line', () => {
    try {
      parse(`
let a = "valid"
let b = "also valid"
let c = "unclosed
let d = "never reached"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LexerError);
      const err = e as LexerError;
      // Lexer reports error on the line after the unclosed string
      expect(err.location?.line).toBe(5);
    }
  });

  test('unclosed string with single quotes reports correct line', () => {
    try {
      parse(`
let first = 'ok'
let second = 'also ok'
let third = 'not closed
let fourth = 'never seen'
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LexerError);
      const err = e as LexerError;
      // Lexer reports error on the line after the unclosed string
      expect(err.location?.line).toBe(5);
    }
  });

  // ============================================================================
  // Error formatting
  // ============================================================================

  test('format() includes source context', () => {
    try {
      parse(`
let valid = "ok"
let broken =
let after = "never"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      const formatted = err.format();
      expect(formatted).toContain('[vibe:');
      expect(formatted).toContain('4:'); // line 4 (where 'let after' is)
    }
  });

  test('format() shows caret pointing to error', () => {
    try {
      parse(`
let x = "hello"
let y = "world"
function () {
  return "missing name"
}
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      const formatted = err.format();
      expect(formatted).toContain('^'); // caret indicator
      expect(formatted).toContain('|'); // line separator
    }
  });

  // ============================================================================
  // Column accuracy
  // ============================================================================

  test('column points to exact token position', () => {
    try {
      parse(`
let validName = "ok"
let    = "missing identifier"
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.location?.line).toBe(3);
      expect(err.location?.column).toBe(8); // position of '=' after spaces
    }
  });

  test('deeply nested error has correct location', () => {
    try {
      parse(`
function level1() {
  function level2() {
    if a {
      if b {
        let x = ,
      }
    }
  }
}
`);
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const err = e as ParserError;
      expect(err.location?.line).toBe(6);
    }
  });
});
