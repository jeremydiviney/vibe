import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Model Declaration', () => {
  // ============================================================================
  // Basic model declarations
  // ============================================================================

  test('basic model declaration', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ModelDeclaration',
      name: 'myModel',
      config: {
        type: 'ModelConfig',
        properties: [
          {
            type: 'ModelProperty',
            key: 'name',
            value: {
              type: 'StringLiteral',
              value: 'gpt-4',
            },
          },
        ],
      },
    });
  });

  test('model with multiple properties', () => {
    const ast = parse(`
model openai = {
  name: "gpt-4",
  apiUrl: "https://api.openai.com/v1/chat",
  apiKey: "sk-test-key"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ModelDeclaration',
      name: 'openai',
      config: {
        type: 'ModelConfig',
        properties: [
          { type: 'ModelProperty', key: 'name' },
          { type: 'ModelProperty', key: 'apiUrl' },
          { type: 'ModelProperty', key: 'apiKey' },
        ],
      },
    });
  });

  test('model with empty object', () => {
    const ast = parse(`
model emptyModel = {}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ModelDeclaration',
      name: 'emptyModel',
      config: {
        type: 'ModelConfig',
        properties: [],
      },
    });
  });

  test('multiple model declarations', () => {
    const ast = parse(`
model gpt4 = {
  name: "gpt-4"
}

model claude = {
  name: "claude-3"
}
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0]).toMatchObject({
      type: 'ModelDeclaration',
      name: 'gpt4',
    });
    expect(ast.body[1]).toMatchObject({
      type: 'ModelDeclaration',
      name: 'claude',
    });
  });

  test('model with boolean property value', () => {
    const ast = parse(`
model myModel = {
  name: "test",
  streaming: true
}
`);
    expect(ast.body).toHaveLength(1);
    const model = ast.body[0] as any;
    expect(model.config.properties).toHaveLength(2);
    expect(model.config.properties[1]).toMatchObject({
      type: 'ModelProperty',
      key: 'streaming',
      value: {
        type: 'BooleanLiteral',
        value: true,
      },
    });
  });

  test('model with identifier property value', () => {
    const ast = parse(`
model myModel = {
  apiKey: envApiKey
}
`);
    expect(ast.body).toHaveLength(1);
    const model = ast.body[0] as any;
    expect(model.config.properties[0]).toMatchObject({
      type: 'ModelProperty',
      key: 'apiKey',
      value: {
        type: 'Identifier',
        name: 'envApiKey',
      },
    });
  });
});

describe('Syntax Errors - Model Declaration', () => {
  test('model missing name', () => {
    expect(() => parse(`
model = {
  name: "test"
}
`)).toThrow();
  });

  test('model missing equals', () => {
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
});
