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

  // Core functions (env, print) are auto-imported and available without explicit import
  test('env function works without import (auto-imported)', async () => {
    process.env.TEST_TOOL_VAR = 'test-value';
    const ast = parse(`
let value = env("TEST_TOOL_VAR")
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('value')).toBe('test-value');
    delete process.env.TEST_TOOL_VAR;
  });

  test('print function works without import (auto-imported)', async () => {
    const ast = parse(`
let _ = print("hello")
let x = 1
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    // print returns void, just verify it doesn't throw
    expect(runtime.getValue('x')).toBe(1);
  });

  test('uuid function works when imported from system/utils', async () => {
    const ast = parse(`
import { uuid } from "system/utils"
let id = uuid()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    const id = runtime.getValue('id') as string;
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  // ============================================================================
  // Utility functions can be called directly from system/utils
  // ============================================================================

  test('now can be called directly from system/utils', async () => {
    const ast = parse(`
import { now } from "system/utils"
let timestamp = now()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    const timestamp = runtime.getValue('timestamp');
    expect(typeof timestamp).toBe('number');
    expect(timestamp).toBeGreaterThan(0);
  });

  test('jsonParse can be called directly from system/utils', async () => {
    const ast = parse(`
import { jsonParse } from "system/utils"
let parsed = jsonParse('{"key": "value"}')
let val = ts(parsed) { return parsed.key }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('val')).toBe('value');
  });

  test('jsonStringify can be called directly from system/utils', async () => {
    const ast = parse(`
import { jsonStringify } from "system/utils"
let obj:json = {name: "test"}
let str = jsonStringify(obj)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('str')).toBe('{"name":"test"}');
  });

  test('allTools array can be imported from system/tools', async () => {
    const ast = parse(`
import { allTools } from "system/tools"
let toolCount = ts(allTools) { return allTools.length }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    const toolCount = runtime.getValue('toolCount');
    expect(toolCount).toBe(13); // File, search, directory, and system tools for AI
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

  test('model can have tools array with allTools', async () => {
    const ast = parse(`
import { allTools } from "system/tools"

model m = {
  name: "gpt-4",
  apiKey: "test-key",
  tools: allTools
}

let x = 1
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // Verify model has all 13 AI tools (utility functions now in system/utils)
    const model = runtime.getValue('m') as { tools?: unknown[] };
    expect(model.tools).toHaveLength(13);
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

describe('Runtime - Tool Bundles', () => {
  test('allTools contains all 13 AI tools including bash and runCode', async () => {
    const ast = parse(`
import { allTools } from "system/tools"
let count = ts(allTools) { return allTools.length }
let names = ts(allTools) { return allTools.map(t => t.name).sort() }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('count')).toBe(13);
    const names = runtime.getValue('names') as string[];
    expect(names).toContain('bash');
    expect(names).toContain('runCode');
    expect(names).toContain('readFile');
    expect(names).toContain('writeFile');
  });

  test('readonlyTools excludes write operations and system tools', async () => {
    const ast = parse(`
import { readonlyTools } from "system/tools"
let count = ts(readonlyTools) { return readonlyTools.length }
let names = ts(readonlyTools) { return readonlyTools.map(t => t.name).sort() }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('count')).toBe(6);
    const names = runtime.getValue('names') as string[];
    // Should include read-only tools
    expect(names).toContain('readFile');
    expect(names).toContain('fileExists');
    expect(names).toContain('listDir');
    expect(names).toContain('glob');
    expect(names).toContain('grep');
    expect(names).toContain('dirExists');
    // Should NOT include write/system tools
    expect(names).not.toContain('writeFile');
    expect(names).not.toContain('appendFile');
    expect(names).not.toContain('edit');
    expect(names).not.toContain('fastEdit');
    expect(names).not.toContain('mkdir');
    expect(names).not.toContain('bash');
    expect(names).not.toContain('runCode');
  });

  test('safeTools excludes bash and runCode', async () => {
    const ast = parse(`
import { safeTools } from "system/tools"
let count = ts(safeTools) { return safeTools.length }
let names = ts(safeTools) { return safeTools.map(t => t.name).sort() }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('count')).toBe(11);
    const names = runtime.getValue('names') as string[];
    // Should NOT include bash or runCode
    expect(names).not.toContain('bash');
    expect(names).not.toContain('runCode');
    // Should include all file tools
    expect(names).toContain('readFile');
    expect(names).toContain('writeFile');
    expect(names).toContain('edit');
  });

  test('individual tools can be imported alongside bundles', async () => {
    const ast = parse(`
import { readonlyTools, bash, runCode } from "system/tools"
let readCount = ts(readonlyTools) { return readonlyTools.length }
let hasBash = ts(bash) { return bash.name === "bash" }
let hasRunCode = ts(runCode) { return runCode.name === "runCode" }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('readCount')).toBe(6);
    expect(runtime.getValue('hasBash')).toBe(true);
    expect(runtime.getValue('hasRunCode')).toBe(true);
  });

  test('tool bundles can be concatenated with + operator', async () => {
    const ast = parse(`
import { readonlyTools, bash } from "system/tools"
let combined = readonlyTools + [bash]
let count = ts(combined) { return combined.length }
let names = ts(combined) { return combined.map(t => t.name) }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // readonlyTools (6) + [bash] (1) = 7
    expect(runtime.getValue('count')).toBe(7);
    const names = runtime.getValue('names') as string[];
    expect(names).toContain('readFile');
    expect(names).toContain('bash');
  });

  test('concatenate multiple tool bundles', async () => {
    const ast = parse(`
import { readonlyTools, bash, runCode } from "system/tools"
let custom = readonlyTools + [bash] + [runCode]
let count = ts(custom) { return custom.length }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // readonlyTools (6) + bash (1) + runCode (1) = 8
    expect(runtime.getValue('count')).toBe(8);
  });
});
