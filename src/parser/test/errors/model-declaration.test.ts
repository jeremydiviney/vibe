import { describe, expect, test } from 'bun:test';
import { parse } from '../../parse';

describe('Syntax Errors - Model Declaration', () => {
  // ============================================================================
  // Missing model components
  // ============================================================================

  test('model missing name', () => {
    expect(() => parse(`
model = {
  name: "test"
}
`)).toThrow();
  });

  test('model missing equals sign', () => {
    expect(() => parse(`
model myModel {
  name: "test"
}
`)).toThrow();
  });

  test('model missing object literal', () => {
    expect(() => parse(`
model myModel =
`)).toThrow();
  });

  test('model with string instead of object', () => {
    expect(() => parse(`
model myModel = "not an object"
`)).toThrow();
  });

  test('model with identifier instead of object', () => {
    expect(() => parse(`
model myModel = otherModel
`)).toThrow();
  });

  // ============================================================================
  // Object literal errors
  // ============================================================================

  test('model with unclosed brace', () => {
    expect(() => parse(`
model myModel = {
  name: "test"
`)).toThrow();
  });

  test('model with only opening brace', () => {
    expect(() => parse(`
model myModel = {
`)).toThrow();
  });

  test('model missing opening brace', () => {
    expect(() => parse(`
model myModel = name: "test" }
`)).toThrow();
  });

  // ============================================================================
  // Property errors
  // ============================================================================

  test('property missing colon', () => {
    expect(() => parse(`
model myModel = {
  name "test"
}
`)).toThrow();
  });

  test('property missing value', () => {
    expect(() => parse(`
model myModel = {
  name:
}
`)).toThrow();
  });

  test('property with trailing comma only', () => {
    expect(() => parse(`
model myModel = {
  ,
}
`)).toThrow();
  });

  test('property with double colon', () => {
    expect(() => parse(`
model myModel = {
  name:: "test"
}
`)).toThrow();
  });

  test('property with equals instead of colon', () => {
    expect(() => parse(`
model myModel = {
  name = "test"
}
`)).toThrow();
  });

  test('property key as string literal', () => {
    expect(() => parse(`
model myModel = {
  "name": "test"
}
`)).toThrow();
  });

  test('property with missing key', () => {
    expect(() => parse(`
model myModel = {
  : "test"
}
`)).toThrow();
  });

  // ============================================================================
  // Multiple properties errors
  // ============================================================================

  test('properties missing comma separator', () => {
    expect(() => parse(`
model myModel = {
  name: "test"
  apiKey: "key"
}
`)).toThrow();
  });

  test('properties with double comma', () => {
    expect(() => parse(`
model myModel = {
  name: "test",,
  apiKey: "key"
}
`)).toThrow();
  });

  test('trailing comma without next property', () => {
    expect(() => parse(`
model myModel = {
  name: "test",
}
`)).toThrow();
  });

  // ============================================================================
  // Model keyword misuse
  // ============================================================================

  test('model as variable name', () => {
    expect(() => parse(`
let model = "test"
`)).toThrow();
  });

  test('nested model in property', () => {
    expect(() => parse(`
model outer = {
  inner: model nested = {}
}
`)).toThrow();
  });

  // ============================================================================
  // Model with invalid property values
  // ============================================================================

  test('model property with unclosed string', () => {
    expect(() => parse(`
model myModel = {
  name: "unclosed
}
`)).toThrow();
  });
});
