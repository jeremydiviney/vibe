import { describe, expect, test, beforeEach } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, AIProvider } from '../index';
import type { VibeToolValue } from '../tools/types';
import { isVibeToolValue } from '../tools/types';

// Mock AI provider for testing
function createMockProvider(): AIProvider {
  return {
    async execute() {
      return { value: 'ai response' };
    },
    async generateCode() {
      return { value: 'generated code' };
    },
    async askUser(): Promise<string> {
      return 'user input';
    },
  };
}

describe('Runtime - Tool Declaration', () => {
  // ============================================================================
  // Basic tool registration
  // ============================================================================

  test('tool declaration creates tool variable', async () => {
    const ast = parse(`
tool greet(name: text): text
  @description "Greet someone"
{
  ts(name) {
    return "Hello, " + name
  }
}

let x = "test"
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // Tool is now stored as a variable, not in registry
    const tool = runtime.getValue('greet') as VibeToolValue;
    expect(isVibeToolValue(tool)).toBe(true);
    expect(tool.name).toBe('greet');
    expect(tool.schema.description).toBe('Greet someone');
  });

  test('tool with multiple parameters has correct schema', async () => {
    const ast = parse(`
tool calculate(x: number, y: number, op: text): number
  @description "Perform a calculation"
  @param x "First operand"
  @param y "Second operand"
  @param op "Operation to perform"
{
  ts(x, y, op) {
    if (op === "add") return x + y
    return x * y
  }
}

let result = "done"
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    const tool = runtime.getValue('calculate') as VibeToolValue;
    expect(tool.schema.parameters).toHaveLength(3);
    expect(tool.schema.parameters[0].description).toBe('First operand');
    expect(tool.schema.parameters[1].description).toBe('Second operand');
    expect(tool.schema.parameters[2].description).toBe('Operation to perform');
  });

  // ============================================================================
  // Tools cannot be called directly from vibe scripts
  // They can only be used by AI models via the tools array in model declarations
  // ============================================================================

  test('tool cannot be called directly', async () => {
    const ast = parse(`
tool double(n: number): number
  @description "Double a number"
{
  ts(n) {
    return n * 2
  }
}

let result = double(21)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await expect(runtime.run()).rejects.toThrow(
      "Cannot call tool 'double' directly"
    );
  });

  test('tool with multiple parameters cannot be called directly', async () => {
    const ast = parse(`
tool add(a: number, b: number): number
  @description "Add two numbers"
{
  ts(a, b) { return a + b }
}

let sum = add(10, 32)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await expect(runtime.run()).rejects.toThrow(
      "Cannot call tool 'add' directly"
    );
  });

  test('multiple tools can be defined (but not called directly)', async () => {
    const ast = parse(`
tool add(a: number, b: number): number
  @description "Add"
{
  ts(a, b) { return a + b }
}

tool multiply(a: number, b: number): number
  @description "Multiply"
{
  ts(a, b) { return a * b }
}

let x = 1
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // Verify both tools are defined
    const addTool = runtime.getValue('add') as VibeToolValue;
    const multiplyTool = runtime.getValue('multiply') as VibeToolValue;
    expect(isVibeToolValue(addTool)).toBe(true);
    expect(isVibeToolValue(multiplyTool)).toBe(true);
    expect(addTool.name).toBe('add');
    expect(multiplyTool.name).toBe('multiply');
  });

  // ============================================================================
  // Standard tools must be explicitly registered
  // ============================================================================

  test('standard tools are NOT auto-available', async () => {
    // Standard tools must be explicitly imported via system modules
    const ast = parse(`
let timestamp = now()
`);
    const runtime = new Runtime(ast, createMockProvider());

    // This should fail because 'now' is not defined (no import)
    await expect(runtime.run()).rejects.toThrow("'now' is not defined");
  });

  // Standard functions can be imported from system
  test('env function works when imported from system', async () => {
    process.env.TEST_TOOL_VAR = 'test-value';
    const ast = parse(`
import { env } from "system"
let value = env("TEST_TOOL_VAR")
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('value')).toBe('test-value');
    delete process.env.TEST_TOOL_VAR;
  });

  test('print function works when imported from system', async () => {
    const ast = parse(`
import { print } from "system"
let _ = print("hello")
let x = 1
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    // print returns void, just verify it doesn't throw
    expect(runtime.getValue('x')).toBe(1);
  });

  test('uuid function works when imported from system', async () => {
    const ast = parse(`
import { uuid } from "system"
let id = uuid()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    const id = runtime.getValue('id') as string;
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  // ============================================================================
  // Tools cannot be called directly - only used by AI models
  // ============================================================================

  test('tools cannot be called directly from vibe scripts', async () => {
    const ast = parse(`
import { now } from "system/tools"
let timestamp = now()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await expect(runtime.run()).rejects.toThrow(
      "Cannot call tool 'now' directly"
    );
  });

  test('jsonParse tool cannot be called directly', async () => {
    const ast = parse(`
import { jsonParse } from "system/tools"
let parsed = jsonParse('{"key": "value"}')
`);
    const runtime = new Runtime(ast, createMockProvider());
    await expect(runtime.run()).rejects.toThrow(
      "Cannot call tool 'jsonParse' directly"
    );
  });

  test('jsonStringify tool cannot be called directly', async () => {
    const ast = parse(`
import { jsonStringify } from "system/tools"
let obj:json = {name: "test"}
let str = jsonStringify(obj)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await expect(runtime.run()).rejects.toThrow(
      "Cannot call tool 'jsonStringify' directly"
    );
  });

  test('standardTools array can be imported from system/tools', async () => {
    const ast = parse(`
import { standardTools } from "system/tools"
let toolCount = ts(standardTools) { return standardTools.length }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    const toolCount = runtime.getValue('toolCount');
    expect(toolCount).toBe(17); // File, search, directory, and utility tools for AI
  });
});

describe('Runtime - Tool Error Handling', () => {
  test('tool throws error on undefined tool call', async () => {
    const ast = parse(`
let result = undefinedTool("arg")
`);
    const runtime = new Runtime(ast, createMockProvider());

    await expect(runtime.run()).rejects.toThrow("'undefinedTool' is not defined");
  });

  test('user-defined tool cannot be called directly', async () => {
    const ast = parse(`
tool myTool(): text
  @description "A custom tool"
{
  ts() {
    return "result"
  }
}

let result = myTool()
`);
    const runtime = new Runtime(ast, createMockProvider());

    await expect(runtime.run()).rejects.toThrow(
      "Cannot call tool 'myTool' directly"
    );
  });
});

describe('Runtime - Model with Tools', () => {
  test('model can have tools array with custom tools', async () => {
    const ast = parse(`
tool greet(name: text): text
  @description "Greet someone"
{
  ts(name) { return "Hello, " + name }
}

model m = {
  name: "gpt-4",
  apiKey: "test-key",
  tools: [greet]
}

let x = 1
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // Verify model has the tool attached
    const model = runtime.getValue('m') as { tools?: unknown[] };
    expect(model.tools).toHaveLength(1);
    expect((model.tools![0] as { name: string }).name).toBe('greet');
  });

  test('model can have tools array with imported tools', async () => {
    const ast = parse(`
import { readFile, writeFile } from "system/tools"

model m = {
  name: "gpt-4",
  apiKey: "test-key",
  tools: [readFile, writeFile]
}

let x = 1
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // Verify model has the tools attached
    const model = runtime.getValue('m') as { tools?: unknown[] };
    expect(model.tools).toHaveLength(2);
    expect((model.tools![0] as { name: string }).name).toBe('readFile');
    expect((model.tools![1] as { name: string }).name).toBe('writeFile');
  });

  test('model can have tools array with standardTools', async () => {
    const ast = parse(`
import { standardTools } from "system/tools"

model m = {
  name: "gpt-4",
  apiKey: "test-key",
  tools: standardTools
}

let x = 1
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // Verify model has all 17 standard tools
    const model = runtime.getValue('m') as { tools?: unknown[] };
    expect(model.tools).toHaveLength(17);
  });

  test('model without tools parameter has undefined tools', async () => {
    const ast = parse(`
model m = {
  name: "gpt-4",
  apiKey: "test-key"
}

let x = 1
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    const model = runtime.getValue('m') as { tools?: unknown[] };
    expect(model.tools).toBeUndefined();
  });
});
