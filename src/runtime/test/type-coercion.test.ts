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

  // ============================================================================
  // Boolean type - variable declarations
  // ============================================================================

  test('boolean type accepts true literal', async () => {
    const runtime = createRuntime('let x: boolean = true');
    await runtime.run();
    expect(runtime.getValue('x')).toBe(true);
  });

  test('boolean type accepts false literal', async () => {
    const runtime = createRuntime('let x: boolean = false');
    await runtime.run();
    expect(runtime.getValue('x')).toBe(false);
  });

  test('boolean const type works', async () => {
    const runtime = createRuntime('const DEBUG: boolean = true');
    await runtime.run();
    expect(runtime.getValue('DEBUG')).toBe(true);
  });

  test('boolean type throws on string value', async () => {
    const runtime = createRuntime('let x: boolean = "true"');
    await expect(runtime.run()).rejects.toThrow("Variable 'x': expected boolean, got string");
  });

  test('boolean type throws on empty string', async () => {
    const runtime = createRuntime('let x: boolean = ""');
    await expect(runtime.run()).rejects.toThrow("Variable 'x': expected boolean, got string");
  });

  // ============================================================================
  // Boolean type - variable assignment
  // ============================================================================

  test('boolean variable assignment accepts boolean', async () => {
    const runtime = createRuntime(`
      let x: boolean = true
      x = false
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toBe(false);
  });

  test('boolean variable assignment throws on string', async () => {
    const runtime = createRuntime(`
      let x: boolean = true
      x = "false"
    `);
    await expect(runtime.run()).rejects.toThrow("Variable 'x': expected boolean, got string");
  });

  // ============================================================================
  // Boolean type - function returns
  // ============================================================================

  test('vibe function returning boolean works', async () => {
    const runtime = createRuntime(`
      function isValid(): boolean {
        return true
      }
      let result = isValid()
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('vibe function returning boolean false works', async () => {
    const runtime = createRuntime(`
      function check(): boolean {
        return false
      }
      let result = check()
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('vibe function with boolean return type throws on string return', async () => {
    const runtime = createRuntime(`
      function isValid(): boolean {
        return "yes"
      }
      let result = isValid()
    `);
    await expect(runtime.run()).rejects.toThrow(/expected boolean, got string/);
  });

  test('vibe function with boolean return type throws on empty string', async () => {
    const runtime = createRuntime(`
      function check(): boolean {
        return ""
      }
      let result = check()
    `);
    await expect(runtime.run()).rejects.toThrow(/expected boolean, got string/);
  });

  // ============================================================================
  // Boolean type - function parameters
  // ============================================================================

  test('function with boolean parameter accepts boolean', async () => {
    const runtime = createRuntime(`
      function test(flag: boolean): boolean {
        return flag
      }
      let result = test(true)
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('function with boolean parameter throws on string', async () => {
    const runtime = createRuntime(`
      function test(flag: boolean): boolean {
        return flag
      }
      let result = test("true")
    `);
    await expect(runtime.run()).rejects.toThrow(/expected boolean, got string/);
  });

  // ============================================================================
  // Boolean type - ts block returns
  // ============================================================================

  test('ts block returning boolean to boolean variable works', async () => {
    const runtime = createRuntime(`
      let x: boolean = ts() { return true }
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toBe(true);
  });

  test('ts block returning false to boolean variable works', async () => {
    const runtime = createRuntime(`
      let x: boolean = ts() { return false }
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toBe(false);
  });

  test('ts block with comparison returns boolean', async () => {
    const runtime = createRuntime(`
      let a = "5"
      let isPositive: boolean = ts(a) { return Number(a) > 0 }
    `);
    await runtime.run();
    expect(runtime.getValue('isPositive')).toBe(true);
  });

  test('ts block returning string to boolean variable throws', async () => {
    const runtime = createRuntime(`
      let x: boolean = ts() { return "true" }
    `);
    await expect(runtime.run()).rejects.toThrow("Variable 'x': expected boolean, got string");
  });

  test('ts block returning number to boolean variable throws', async () => {
    const runtime = createRuntime(`
      let x: boolean = ts() { return 1 }
    `);
    await expect(runtime.run()).rejects.toThrow("Variable 'x': expected boolean, got number");
  });

  // ============================================================================
  // Boolean type - if statement strict checking
  // ============================================================================

  test('if statement accepts boolean true', async () => {
    const runtime = createRuntime(`
      let result = "no"
      if true {
        result = "yes"
      }
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toBe('yes');
  });

  test('if statement accepts boolean false', async () => {
    const runtime = createRuntime(`
      let result = "no"
      if false {
        result = "yes"
      }
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toBe('no');
  });

  test('if statement accepts boolean variable', async () => {
    const runtime = createRuntime(`
      let flag: boolean = true
      let result = "no"
      if flag {
        result = "yes"
      }
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toBe('yes');
  });

  test('if statement throws on string condition', async () => {
    const runtime = createRuntime(`
      let x = "hello"
      if x {
        let y = "inside"
      }
    `);
    await expect(runtime.run()).rejects.toThrow('if condition must be a boolean, got string');
  });

  test('if statement throws on empty string condition', async () => {
    const runtime = createRuntime(`
      let x = ""
      if x {
        let y = "inside"
      }
    `);
    await expect(runtime.run()).rejects.toThrow('if condition must be a boolean, got string');
  });

  test('if statement with function returning boolean works', async () => {
    const runtime = createRuntime(`
      function isActive(): boolean {
        return true
      }
      let result = "no"
      if isActive() {
        result = "yes"
      }
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toBe('yes');
  });

  test('if statement with ts block returning boolean works', async () => {
    const runtime = createRuntime(`
      let num = "5"
      let result = "no"
      let isPositive: boolean = ts(num) { return Number(num) > 0 }
      if isPositive {
        result = "yes"
      }
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toBe('yes');
  });
});
