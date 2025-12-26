import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Errors - Type Constraints', () => {
  // ============================================================================
  // Do expression model argument must be a model type
  // ============================================================================

  test('do expression with variable as model argument', () => {
    const ast = parse(`
let notAModel = "test"
let x = do "prompt" notAModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Expected model, got variable 'notAModel'");
  });

  test('do expression with constant as model argument', () => {
    const ast = parse(`
const notAModel = "test"
let x = do "prompt" notAModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Expected model, got constant 'notAModel'");
  });

  test('do expression with function as model argument', () => {
    const ast = parse(`
function notAModel() {
  return "test"
}
let x = do "prompt" notAModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Expected model, got function 'notAModel'");
  });

  test('do expression with parameter as model argument', () => {
    const ast = parse(`
model realModel = { name: "test", apiKey: "key", url: "http://test" }
function test(notAModel: text): text {
  let x = do "prompt" notAModel default
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Expected model, got parameter 'notAModel'");
  });

  // ============================================================================
  // Valid model usage
  // ============================================================================

  test('do expression with valid model', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = do "prompt" myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('do expression with model from outer scope', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
function test() {
  let x = do "prompt" myModel default
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Multiple type errors
  // ============================================================================

  test('multiple do expressions with wrong model types', () => {
    const ast = parse(`
let notAModel = "test"
let x = do "prompt1" notAModel default
let y = do "prompt2" notAModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe("Expected model, got variable 'notAModel'");
    expect(errors[1].message).toBe("Expected model, got variable 'notAModel'");
  });

  // ============================================================================
  // Combined errors
  // ============================================================================

  test('undefined model and wrong type model', () => {
    const ast = parse(`
let notAModel = "test"
let x = do "prompt1" undefinedModel default
let y = do "prompt2" notAModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe("'undefinedModel' is not defined");
    expect(errors[1].message).toBe("Expected model, got variable 'notAModel'");
  });
});
