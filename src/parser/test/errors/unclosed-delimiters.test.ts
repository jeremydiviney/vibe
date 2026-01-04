import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';

describe('Syntax Errors - Unclosed Delimiters', () => {
  // ============================================================================
  // Unclosed braces
  // ============================================================================

  test('unclosed block statement', () => {
    expect(() => parse(`
{
  let x = "hello"
`)).toThrow();
  });

  test('unclosed function body', () => {
    expect(() => parse(`
function foo() {
  return "hello"
`)).toThrow();
  });

  test('unclosed if block', () => {
    expect(() => parse(`
if true {
  let x = "yes"
`)).toThrow();
  });

  test('unclosed else block', () => {
    expect(() => parse(`
if true {
  let x = "yes"
} else {
  let y = "no"
`)).toThrow();
  });

  test('nested unclosed braces', () => {
    expect(() => parse(`
function outer() {
  if true {
    let x = "nested"
}
`)).toThrow();
  });

  // ============================================================================
  // Unclosed parentheses
  // ============================================================================

  test('unclosed function call', () => {
    expect(() => parse(`
foo("hello"
`)).toThrow();
  });

  test('unclosed function params', () => {
    expect(() => parse(`
function greet(name, age
`)).toThrow();
  });

  test('unclosed grouped expression', () => {
    expect(() => parse(`
let x = ("hello"
`)).toThrow();
  });

  test('nested unclosed parens in call', () => {
    expect(() => parse(`
outer(inner("deep"
`)).toThrow();
  });

  // ============================================================================
  // Unclosed strings
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
  // Mixed unclosed delimiters
  // ============================================================================

  test('unclosed brace and paren', () => {
    expect(() => parse(`
function test() {
  foo(
}
`)).toThrow();
  });

  test('unclosed string inside unclosed block', () => {
    expect(() => parse(`
{
  let x = "hello
`)).toThrow();
  });
});
