import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';

describe('Syntax Errors - Missing Tokens', () => {
  // ============================================================================
  // const declaration
  // ============================================================================

  test('const missing equals and initializer', () => {
    expect(() => parse(`
const x
`)).toThrow();
  });

  test('const missing initializer after equals', () => {
    expect(() => parse(`
const x =
`)).toThrow();
  });

  // ============================================================================
  // let declaration
  // ============================================================================

  test('let missing initializer after equals', () => {
    expect(() => parse(`
let x =
`)).toThrow();
  });

  // ============================================================================
  // function declaration
  // ============================================================================

  test('function missing closing paren', () => {
    expect(() => parse(`
function foo(
`)).toThrow();
  });

  test('function missing body', () => {
    expect(() => parse(`
function foo()
`)).toThrow();
  });

  test('function with params missing closing paren', () => {
    expect(() => parse(`
function greet(name
`)).toThrow();
  });

  test('function missing opening paren', () => {
    expect(() => parse(`
function foo {
  return "hello"
}
`)).toThrow();
  });

  test('function parameter missing type annotation', () => {
    expect(() => parse(`function foo(x) { }`)).toThrow(
      "Missing type annotation for parameter 'x'"
    );
  });

  test('function first parameter missing type annotation', () => {
    expect(() => parse(`function foo(x, y: text) { }`)).toThrow(
      "Missing type annotation for parameter 'x'"
    );
  });

  test('function second parameter missing type annotation', () => {
    expect(() => parse(`function foo(x: text, y) { }`)).toThrow(
      "Missing type annotation for parameter 'y'"
    );
  });

  test('export function parameter missing type annotation', () => {
    expect(() => parse(`export function foo(guesser, answerer) { }`)).toThrow(
      "Missing type annotation for parameter 'guesser'"
    );
  });

  // ============================================================================
  // tool declaration
  // ============================================================================

  test('tool parameter missing type annotation', () => {
    expect(() => parse(`tool myTool(x) { ts() { return 1; } }`)).toThrow(
      "Missing type annotation for parameter 'x'"
    );
  });

  // ============================================================================
  // if statement
  // ============================================================================

  test('if missing block', () => {
    expect(() => parse(`
if true
`)).toThrow();
  });

  test('if with else missing block', () => {
    expect(() => parse(`
if true {
  let x = "yes"
} else
`)).toThrow();
  });

  // ============================================================================
  // return statement
  // ============================================================================

  test('return with incomplete expression', () => {
    expect(() => parse(`
function test() {
  return =
}
`)).toThrow();
  });

  // ============================================================================
  // vibe expression
  // ============================================================================

  test('vibe missing prompt', () => {
    expect(() => parse(`
let x = do
`)).toThrow();
  });

  // ============================================================================
  // vibe expression
  // ============================================================================

  test('vibe missing prompt', () => {
    expect(() => parse(`
let x = vibe
`)).toThrow();
  });

  // ============================================================================
  // call expression
  // ============================================================================

  test('call missing closing paren', () => {
    expect(() => parse(`
foo(
`)).toThrow();
  });

  test('call with args missing closing paren', () => {
    expect(() => parse(`
greet("hello"
`)).toThrow();
  });
});
