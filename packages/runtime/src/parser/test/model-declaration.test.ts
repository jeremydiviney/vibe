import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Model Declaration', () => {
  // ============================================================================
  // Basic model declarations
  // ============================================================================

  test('basic model declaration with all required fields', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4",
  apiKey: "sk-test",
  url: "https://api.openai.com"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ModelDeclaration',
      name: 'myModel',
      config: {
        type: 'ModelConfig',
        modelName: {
          type: 'StringLiteral',
          value: 'gpt-4',
        },
        apiKey: {
          type: 'StringLiteral',
          value: 'sk-test',
        },
        url: {
          type: 'StringLiteral',
          value: 'https://api.openai.com',
        },
        providedFields: ['name', 'apiKey', 'url'],
      },
    });
  });

  test('model with empty object parses (validation in semantic)', () => {
    const ast = parse(`
model emptyModel = {}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ModelDeclaration',
      name: 'emptyModel',
      config: {
        type: 'ModelConfig',
        modelName: null,
        apiKey: null,
        url: null,
        providedFields: [],
      },
    });
  });

  test('multiple model declarations', () => {
    const ast = parse(`
model gpt4 = {
  name: "gpt-4",
  apiKey: "sk-test",
  url: "https://api.openai.com"
}

model claude = {
  name: "claude-3",
  apiKey: "sk-ant",
  url: "https://api.anthropic.com"
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

  test('model with identifier property value', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4",
  apiKey: envApiKey,
  url: "https://api.openai.com"
}
`);
    expect(ast.body).toHaveLength(1);
    const model = ast.body[0] as any;
    expect(model.config.apiKey).toMatchObject({
      type: 'Identifier',
      name: 'envApiKey',
    });
  });

  test('model fields can be in any order', () => {
    const ast = parse(`
model myModel = {
  url: "https://api.openai.com",
  name: "gpt-4",
  apiKey: "sk-test"
}
`);
    expect(ast.body).toHaveLength(1);
    const model = ast.body[0] as any;
    expect(model.config.modelName.value).toBe('gpt-4');
    expect(model.config.apiKey.value).toBe('sk-test');
    expect(model.config.url.value).toBe('https://api.openai.com');
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
