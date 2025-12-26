import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Errors - Undefined Variables', () => {
  // ============================================================================
  // Basic undefined variable usage
  // ============================================================================

  test('using undefined variable in expression', () => {
    const ast = parse(`
let x = undefinedVar
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedVar' is not defined");
  });

  test('using undefined variable in function call', () => {
    const ast = parse(`
let x = unknownFunc()
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'unknownFunc' is not defined");
  });

  test('using undefined variable as function argument', () => {
    const ast = parse(`
function greet(name: text): text {
  return name
}
let x = greet(unknownArg)
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'unknownArg' is not defined");
  });

  // ============================================================================
  // Undefined in do expressions
  // ============================================================================

  test('using undefined variable as do prompt', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = do undefinedPrompt myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedPrompt' is not defined");
  });

  test('using undefined model in do expression', () => {
    const ast = parse(`
let x = do "prompt" undefinedModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedModel' is not defined");
  });

  test('using undefined context variable in do expression', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = do "prompt" myModel undefinedContext
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedContext' is not defined");
  });

  // ============================================================================
  // Undefined in if statements
  // ============================================================================

  test('using undefined variable in if condition', () => {
    const ast = parse(`
if undefinedCond {
  let x = "yes"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedCond' is not defined");
  });

  // ============================================================================
  // Undefined in return statements
  // ============================================================================

  test('returning undefined variable', () => {
    const ast = parse(`
function test() {
  return undefinedReturn
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedReturn' is not defined");
  });

  // ============================================================================
  // Multiple undefined variables
  // ============================================================================

  test('multiple undefined variables', () => {
    const ast = parse(`
let a = undefined1
let b = undefined2
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe("'undefined1' is not defined");
    expect(errors[1].message).toBe("'undefined2' is not defined");
  });

  // ============================================================================
  // Variable used before declaration
  // ============================================================================

  test('variable used before declaration', () => {
    const ast = parse(`
let x = y
let y = "hello"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'y' is not defined");
  });

  // ============================================================================
  // Valid cases (should have no errors)
  // ============================================================================

  test('using declared variable', () => {
    const ast = parse(`
let x = "hello"
let y = x
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('using function parameter', () => {
    const ast = parse(`
function greet(name: text): text {
  return name
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('using model in do expression', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = do "prompt" myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });
});
