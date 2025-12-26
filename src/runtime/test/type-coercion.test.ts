import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, type AIProvider } from '../index';

describe('Runtime - Type Coercion', () => {
  // Mock AI provider
  const mockProvider: AIProvider = {
    execute: async (prompt: string) => prompt,
    generateCode: async () => 'let result = "generated"',
    askUser: async () => 'user response',
  };

  function createRuntime(code: string): Runtime {
    const ast = parse(code);
    return new Runtime(ast, mockProvider);
  }

  // ============================================================================
  // Text type (passthrough)
  // ============================================================================

  test('text type keeps string as string', async () => {
    const runtime = createRuntime('let x: text = "hello"');
    await runtime.run();
    expect(runtime.getValue('x')).toBe('hello');
  });

  test('no type keeps string as string', async () => {
    const runtime = createRuntime('let x = "hello"');
    await runtime.run();
    expect(runtime.getValue('x')).toBe('hello');
  });

  // ============================================================================
  // JSON type - parsing string literals
  // ============================================================================

  test('json type parses JSON object string', async () => {
    const runtime = createRuntime('let x: json = "{\\"name\\": \\"test\\"}"');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ name: 'test' });
  });

  test('json type parses JSON array string', async () => {
    const runtime = createRuntime('let x: json = "[1, 2, 3]"');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual([1, 2, 3]);
  });

  test('json type parses empty object', async () => {
    const runtime = createRuntime('let x: json = "{}"');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({});
  });

  test('json type parses empty array', async () => {
    const runtime = createRuntime('let x: json = "[]"');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual([]);
  });

  test('json type parses nested objects', async () => {
    const runtime = createRuntime('let x: json = "{\\"user\\": {\\"name\\": \\"test\\", \\"age\\": 30}}"');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ user: { name: 'test', age: 30 } });
  });

  test('json const type parses correctly', async () => {
    const runtime = createRuntime('const x: json = "{\\"key\\": \\"value\\"}"');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ key: 'value' });
  });

  // ============================================================================
  // JSON type - invalid values
  // ============================================================================

  test('json type throws on invalid JSON string', async () => {
    const runtime = createRuntime('let x: json = "{invalid}"');
    await expect(runtime.run()).rejects.toThrow("Variable 'x': invalid JSON string");
  });

  test('json type throws on primitive null', async () => {
    const runtime = createRuntime(`
      let x: json
    `);
    await expect(runtime.run()).rejects.toThrow(/expected JSON \(object or array\)/);
  });

  // ============================================================================
  // JSON type - assignment validation
  // ============================================================================

  test('json variable assignment parses valid JSON', async () => {
    const runtime = createRuntime(`
      let x: json = "{}"
      x = "{\\"updated\\": true}"
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ updated: true });
  });

  test('json variable assignment throws on invalid JSON', async () => {
    const runtime = createRuntime(`
      let x: json = "{}"
      x = "not json"
    `);
    await expect(runtime.run()).rejects.toThrow("Variable 'x': invalid JSON string");
  });

  // ============================================================================
  // Type validation errors
  // ============================================================================

  test('json type rejects plain text string', async () => {
    const runtime = createRuntime('let x: json = "hello world"');
    await expect(runtime.run()).rejects.toThrow("Variable 'x': invalid JSON string");
  });

  test('json type rejects malformed JSON string', async () => {
    const runtime = createRuntime('let x: json = "{name: value}"');
    await expect(runtime.run()).rejects.toThrow("Variable 'x': invalid JSON string");
  });

  test('json type rejects JSON primitive string (number)', async () => {
    // "42" is valid JSON but parses to a primitive, not object/array
    const runtime = createRuntime('let x: json = "42"');
    await expect(runtime.run()).rejects.toThrow(/expected JSON \(object or array\)/);
  });

  test('json type rejects JSON primitive string (boolean)', async () => {
    const runtime = createRuntime('let x: json = "true"');
    await expect(runtime.run()).rejects.toThrow(/expected JSON \(object or array\)/);
  });

  test('json type rejects JSON primitive string (null)', async () => {
    const runtime = createRuntime('let x: json = "null"');
    await expect(runtime.run()).rejects.toThrow(/expected JSON \(object or array\)/);
  });

  test('json type accepts object literal directly', async () => {
    const runtime = createRuntime('let x: json = {key: "value"}');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ key: 'value' });
  });

  test('json type accepts array literal directly', async () => {
    const runtime = createRuntime('let x: json = ["a", "b"]');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual(['a', 'b']);
  });

  test('reassigning json variable with invalid string throws', async () => {
    const runtime = createRuntime(`
      let x: json = {initial: "value"}
      x = "not valid json"
    `);
    await expect(runtime.run()).rejects.toThrow("Variable 'x': invalid JSON string");
  });

  test('reassigning json variable with valid JSON string works', async () => {
    const runtime = createRuntime(`
      let x: json = {initial: "value"}
      x = "{\\"updated\\": true}"
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ updated: true });
  });

  test('reassigning json variable with object literal works', async () => {
    const runtime = createRuntime(`
      let x: json = {initial: "value"}
      x = {replaced: "new"}
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ replaced: 'new' });
  });

  // ============================================================================
  // JSON type with AI responses
  // ============================================================================

  test('json type parses AI response as JSON', async () => {
    const jsonProvider: AIProvider = {
      execute: async () => '{"result": "from AI"}',
      generateCode: async () => '',
      askUser: async () => '',
    };

    const code = `
      model myModel = {
        name: "test",
        apiKey: "key",
        url: "http://example.com"
      }
      let x: json = do "return json" myModel default
    `;
    const ast = parse(code);
    const runtime = new Runtime(ast, jsonProvider);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ result: 'from AI' });
  });

  test('json type throws if AI returns invalid JSON', async () => {
    const invalidProvider: AIProvider = {
      execute: async () => 'not valid json',
      generateCode: async () => '',
      askUser: async () => '',
    };

    const code = `
      model myModel = {
        name: "test",
        apiKey: "key",
        url: "http://example.com"
      }
      let x: json = do "return json" myModel default
    `;
    const ast = parse(code);
    const runtime = new Runtime(ast, invalidProvider);
    await expect(runtime.run()).rejects.toThrow("Variable 'x': invalid JSON string");
  });
});
