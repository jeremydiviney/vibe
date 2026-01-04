import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';

describe('Syntax Errors - Vibe Expression', () => {
  // ============================================================================
  // Missing arguments
  // ============================================================================

  test('vibe with no arguments', () => {
    expect(() => parse(`
let x = do
`)).toThrow();
  });

  test('vibe with only prompt', () => {
    expect(() => parse(`
let x = vibe "what is AI"
`)).toThrow();
  });

  test('vibe with only prompt and model', () => {
    expect(() => parse(`
let x = vibe "what is AI" myModel
`)).toThrow();
  });

  test('vibe missing prompt', () => {
    expect(() => parse(`
let x = vibe myModel default
`)).toThrow();
  });

  // ============================================================================
  // Invalid prompt argument
  // ============================================================================

  test('vibe with equals as prompt', () => {
    expect(() => parse(`
let x = vibe = myModel default
`)).toThrow();
  });

  test('vibe with comma as prompt', () => {
    expect(() => parse(`
let x = vibe , myModel default
`)).toThrow();
  });

  test('vibe with closing brace as prompt', () => {
    expect(() => parse(`
let x = vibe } myModel default
`)).toThrow();
  });

  // ============================================================================
  // Invalid model argument
  // ============================================================================

  test('vibe with equals as model', () => {
    expect(() => parse(`
let x = vibe "prompt" = default
`)).toThrow();
  });

  test('vibe with comma as model', () => {
    expect(() => parse(`
let x = vibe "prompt" , default
`)).toThrow();
  });

  // ============================================================================
  // Invalid context argument
  // ============================================================================

  test('vibe with equals as context', () => {
    expect(() => parse(`
let x = vibe "prompt" myModel =
`)).toThrow();
  });

  test('vibe with comma as context', () => {
    expect(() => parse(`
let x = vibe "prompt" myModel ,
`)).toThrow();
  });

  test('vibe with string as context', () => {
    expect(() => parse(`
let x = vibe "prompt" myModel "invalid"
`)).toThrow();
  });

  // ============================================================================
  // Do in invalid positions
  // ============================================================================

  test('vibe as model declaration value', () => {
    expect(() => parse(`
model myModel = vibe "prompt" otherModel default
`)).toThrow();
  });

  test('vibe with unclosed surrounding block', () => {
    expect(() => parse(`
function test() {
  let x = vibe "prompt" myModel default
`)).toThrow();
  });

  // ============================================================================
  // Nested do errors
  // ============================================================================

  test('nested vibe missing inner arguments', () => {
    expect(() => parse(`
let x = vibe (vibe "inner") myModel default
`)).toThrow();
  });

  test('vibe inside function with missing context', () => {
    expect(() => parse(`
function askAI() {
  return vibe "question" myModel
}
`)).toThrow();
  });

  // ============================================================================
  // Do with incomplete surrounding statements
  // ============================================================================

  test('const with vibe missing context', () => {
    expect(() => parse(`
const x = vibe "prompt" myModel
`)).toThrow();
  });

  test('vibe in if condition missing context', () => {
    expect(() => parse(`
if vibe "prompt" myModel {
  let x = "yes"
}
`)).toThrow();
  });
});
