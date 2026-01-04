import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';

describe('Syntax Errors - Invalid Expressions', () => {
  // ============================================================================
  // Invalid call expressions
  // ============================================================================

  test('call with leading comma', () => {
    expect(() => parse(`
foo(, "hello")
`)).toThrow();
  });

  test('call with trailing comma', () => {
    expect(() => parse(`
foo("hello",)
`)).toThrow();
  });

  test('call with double comma', () => {
    expect(() => parse(`
foo("a",, "b")
`)).toThrow();
  });

  test('call with only comma', () => {
    expect(() => parse(`
foo(,)
`)).toThrow();
  });

  // ============================================================================
  // Invalid function parameters
  // ============================================================================

  test('function params with leading comma', () => {
    expect(() => parse(`
function test(, a) {
  return a
}
`)).toThrow();
  });

  test('function params with trailing comma', () => {
    expect(() => parse(`
function test(a,) {
  return a
}
`)).toThrow();
  });

  test('function params with double comma', () => {
    expect(() => parse(`
function test(a,, b) {
  return a
}
`)).toThrow();
  });

  // ============================================================================
  // Invalid primary expressions
  // ============================================================================

  test('empty parentheses as expression', () => {
    expect(() => parse(`
let x = ()
`)).toThrow();
  });

  test('just equals sign', () => {
    expect(() => parse(`
=
`)).toThrow();
  });

  test('just comma', () => {
    expect(() => parse(`
,
`)).toThrow();
  });

  // ============================================================================
  // Invalid do/vibe expressions
  // ============================================================================

  test('vibe with equals instead of expression', () => {
    expect(() => parse(`
let x = vibe =
`)).toThrow();
  });

  test('vibe with comma instead of expression', () => {
    expect(() => parse(`
let x = vibe ,
`)).toThrow();
  });

  test('vibe with closing paren', () => {
    expect(() => parse(`
let x = vibe )
`)).toThrow();
  });

  // ============================================================================
  // Invalid if conditions
  // ============================================================================

  test('if with empty condition', () => {
    expect(() => parse(`
if {
  let x = "yes"
}
`)).toThrow();
  });

  test('if with equals as condition', () => {
    expect(() => parse(`
if = {
  let x = "yes"
}
`)).toThrow();
  });

  // ============================================================================
  // Invalid return expressions
  // ============================================================================

  test('return with comma', () => {
    expect(() => parse(`
function test() {
  return ,
}
`)).toThrow();
  });

  test('return with only equals', () => {
    expect(() => parse(`
function test() {
  return =
}
`)).toThrow();
  });
});
