import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Errors - Model Validation', () => {
  // ============================================================================
  // Model reassignment (should be blocked)
  // ============================================================================

  test('cannot reassign model variable', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4",
  apiKey: "sk-test",
  url: "https://api.openai.com"
}
myModel = "something"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Cannot reassign model 'myModel'");
  });

  // ============================================================================
  // Required fields validation
  // ============================================================================

  test('model with all required fields is valid', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4",
  apiKey: "sk-test",
  url: "https://api.openai.com"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('model missing name field', () => {
    const ast = parse(`
model myModel = {
  apiKey: "sk-test",
  url: "https://api.openai.com"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Model 'myModel' is missing required field 'name'");
  });

  test('model missing apiKey field', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4",
  url: "https://api.openai.com"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Model 'myModel' is missing required field 'apiKey'");
  });

  test('model missing url field', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4",
  apiKey: "sk-test"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Model 'myModel' is missing required field 'url'");
  });

  test('model missing all fields', () => {
    const ast = parse(`
model myModel = {}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(3);
    expect(errors.map(e => e.message)).toContain("Model 'myModel' is missing required field 'name'");
    expect(errors.map(e => e.message)).toContain("Model 'myModel' is missing required field 'apiKey'");
    expect(errors.map(e => e.message)).toContain("Model 'myModel' is missing required field 'url'");
  });

  // ============================================================================
  // Unknown fields validation
  // ============================================================================

  test('model with unknown field', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4",
  apiKey: "sk-test",
  url: "https://api.openai.com",
  streaming: true
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Model 'myModel' has unknown field 'streaming'");
  });

  test('model with multiple unknown fields', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4",
  apiKey: "sk-test",
  url: "https://api.openai.com",
  streaming: true,
  temperature: "0.7"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors.map(e => e.message)).toContain("Model 'myModel' has unknown field 'streaming'");
    expect(errors.map(e => e.message)).toContain("Model 'myModel' has unknown field 'temperature'");
  });

  // ============================================================================
  // Field expression validation
  // ============================================================================

  test('model field can reference defined variable', () => {
    const ast = parse(`
let myKey = "sk-test"
model myModel = {
  name: "gpt-4",
  apiKey: myKey,
  url: "https://api.openai.com"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('model field referencing undefined variable', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4",
  apiKey: undefinedKey,
  url: "https://api.openai.com"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedKey' is not defined");
  });

  // ============================================================================
  // Model type annotation must be const
  // ============================================================================

  test('let with model type is rejected', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let m: model = myModel
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Variables with type 'model' must be declared with 'const', not 'let'");
  });

  test('const with model type is allowed', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
const m: model = myModel
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('function parameter with model type is allowed', () => {
    const ast = parse(`function process(m: model): text { return "done" }`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });
});
