import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';

describe('Syntax Errors - Do Expression', () => {
  // ============================================================================
  // Missing arguments
  // ============================================================================

  test('do with no arguments', () => {
    expect(() => parse(`
let x = do
`)).toThrow();
  });

  test('do with only prompt', () => {
    expect(() => parse(`
let x = do "what is AI"
`)).toThrow();
  });

  test('do with only prompt and model', () => {
    expect(() => parse(`
let x = do "what is AI" myModel
`)).toThrow();
  });

  test('do missing prompt', () => {
    expect(() => parse(`
let x = do myModel default
`)).toThrow();
  });

  // ============================================================================
  // Invalid prompt argument
  // ============================================================================

  test('do with equals as prompt', () => {
    expect(() => parse(`
let x = do = myModel default
`)).toThrow();
  });

  test('do with comma as prompt', () => {
    expect(() => parse(`
let x = do , myModel default
`)).toThrow();
  });

  test('do with closing brace as prompt', () => {
    expect(() => parse(`
let x = do } myModel default
`)).toThrow();
  });

  // ============================================================================
  // Invalid model argument
  // ============================================================================

  test('do with equals as model', () => {
    expect(() => parse(`
let x = do "prompt" = default
`)).toThrow();
  });

  test('do with comma as model', () => {
    expect(() => parse(`
let x = do "prompt" , default
`)).toThrow();
  });

  // ============================================================================
  // Invalid context argument
  // ============================================================================

  test('do with equals as context', () => {
    expect(() => parse(`
let x = do "prompt" myModel =
`)).toThrow();
  });

  test('do with comma as context', () => {
    expect(() => parse(`
let x = do "prompt" myModel ,
`)).toThrow();
  });

  test('do with string as context', () => {
    expect(() => parse(`
let x = do "prompt" myModel "invalid"
`)).toThrow();
  });

  // ============================================================================
  // Do in invalid positions
  // ============================================================================

  test('do as model declaration value', () => {
    expect(() => parse(`
model myModel = do "prompt" otherModel default
`)).toThrow();
  });

  test('do with unclosed surrounding block', () => {
    expect(() => parse(`
function test() {
  let x = do "prompt" myModel default
`)).toThrow();
  });

  // ============================================================================
  // Nested do errors
  // ============================================================================

  test('nested do missing inner arguments', () => {
    expect(() => parse(`
let x = do (do "inner") myModel default
`)).toThrow();
  });

  test('do inside function with missing context', () => {
    expect(() => parse(`
function askAI() {
  return do "question" myModel
}
`)).toThrow();
  });

  // ============================================================================
  // Do with incomplete surrounding statements
  // ============================================================================

  test('const with do missing context', () => {
    expect(() => parse(`
const x = do "prompt" myModel
`)).toThrow();
  });

  test('do in if condition missing context', () => {
    expect(() => parse(`
if do "prompt" myModel {
  let x = "yes"
}
`)).toThrow();
  });
});
