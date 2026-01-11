import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';

describe('Syntax Errors - Vibe Expression', () => {
  // ============================================================================
  // Vibe/Do with no arguments at all (prompt is required)
  // ============================================================================

  test('vibe with no arguments', () => {
    expect(() => parse(`
let x = vibe
`)).toThrow();
  });

  test('do with no arguments', () => {
    expect(() => parse(`
let x = do
`)).toThrow();
  });

  // ============================================================================
  // Invalid prompt argument (special characters that can't start an expression)
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

  // Note: `vibe "prompt" myModel "invalid"` parses successfully because
  // the grammar treats "invalid" as a separate expression statement.
  // The semantic analyzer catches this as an error.

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
});
