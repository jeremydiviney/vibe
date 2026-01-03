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
  // Tool execution
  // ============================================================================

  test('tool can be called and returns result', async () => {
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
    await runtime.run();

    expect(runtime.getValue('result')).toBe(42);
  });

  test('tool with string parameter executes correctly', async () => {
    const ast = parse(`
tool greet(name: text): text
  @description "Greet someone"
{
  ts(name) {
    return "Hello, " + name + "!"
  }
}

let message = greet("World")
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('message')).toBe('Hello, World!');
  });

  test('tool with multiple parameters executes correctly', async () => {
    const ast = parse(`
tool add(a: number, b: number): number
  @description "Add two numbers"
{
  ts(a, b) {
    return a + b
  }
}

let sum = add(10, 32)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('sum')).toBe(42);
  });

  // ============================================================================
  // Async tool execution
  // ============================================================================

  test('tool with async operation', async () => {
    const ast = parse(`
tool delayedDouble(n: number): number
  @description "Double a number after a delay"
{
  ts(n) {
    return await new Promise(resolve => setTimeout(() => resolve(n * 2), 10))
  }
}

let result = delayedDouble(21)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('result')).toBe(42);
  });

  // ============================================================================
  // Tool returning complex types
  // ============================================================================

  test('tool returning json object', async () => {
    const ast = parse(`
tool createPerson(name: text, age: number): json
  @description "Create a person object"
{
  ts(name, age) {
    return { name: name, age: age }
  }
}

let person = createPerson("Alice", 30)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('person')).toEqual({ name: 'Alice', age: 30 });
  });

  test('tool returning array', async () => {
    const ast = parse(`
tool range(start: number, end: number): json
  @description "Create a range of numbers"
{
  ts(start, end) {
    const result = []
    for (let i = start; i <= end; i++) {
      result.push(i)
    }
    return result
  }
}

let numbers = range(1, 5)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('numbers')).toEqual([1, 2, 3, 4, 5]);
  });

  // ============================================================================
  // Multiple tools
  // ============================================================================

  test('multiple tools can be defined and called', async () => {
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

let sum = add(5, 3)
let product = multiply(5, 3)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('sum')).toBe(8);
    expect(runtime.getValue('product')).toBe(15);
  });

  // ============================================================================
  // Tool chaining
  // ============================================================================

  test('tools can be chained', async () => {
    const ast = parse(`
tool double(n: number): number
  @description "Double a number"
{
  ts(n) { return n * 2 }
}

tool addTen(n: number): number
  @description "Add ten"
{
  ts(n) { return n + 10 }
}

let result = addTen(double(16))
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('result')).toBe(42);
  });

  // ============================================================================
  // Tool with variable arguments
  // ============================================================================

  test('tool called with variable arguments', async () => {
    const ast = parse(`
tool greet(name: text): text
  @description "Greet"
{
  ts(name) { return "Hi " + name }
}

let person = "Bob"
let greeting = greet(person)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('greeting')).toBe('Hi Bob');
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

  // Standard tools can be imported from system/tools
  test('standard tools work when imported from system module', async () => {
    const ast = parse(`
import { now } from "system/tools"
let timestamp = now()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    const timestamp = runtime.getValue('timestamp');
    expect(typeof timestamp).toBe('number');
    expect(timestamp as number).toBeGreaterThan(0);
  });

  test('jsonParse tool works when imported', async () => {
    const ast = parse(`
import { jsonParse } from "system/tools"
let jsonStr = '{"name": "test", "value": 42}'
let parsed = jsonParse(jsonStr)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('parsed')).toEqual({ name: 'test', value: 42 });
  });

  test('jsonStringify tool works when imported', async () => {
    const ast = parse(`
import { jsonStringify } from "system/tools"
let obj:json = {name: "test", value: 42}
let str = jsonStringify(obj)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('str')).toBe('{"name":"test","value":42}');
  });

  test('sleep tool works when imported', async () => {
    const ast = parse(`
import { now, sleep } from "system/tools"
let before = now()
let _ = sleep(50)
let after = now()
let elapsed = ts(before, after) { return after - before }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    const elapsed = runtime.getValue('elapsed') as number;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  test('standardTools array can be imported', async () => {
    const ast = parse(`
import { standardTools } from "system/tools"
let toolCount = ts(standardTools) { return standardTools.length }
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    const toolCount = runtime.getValue('toolCount');
    expect(toolCount).toBe(19); // All 19 standard tools
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

  test('tool error in body propagates', async () => {
    const ast = parse(`
tool willFail(): text
  @description "Will throw an error"
{
  ts() {
    throw new Error("intentional error")
  }
}

let result = willFail()
`);
    const runtime = new Runtime(ast, createMockProvider());

    await expect(runtime.run()).rejects.toThrow('intentional error');
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

let result = greet("World")
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // Verify tool still works as direct call
    expect(runtime.getValue('result')).toBe('Hello, World');

    // Verify model has the tool attached
    const model = runtime.getValue('m') as { tools?: unknown[] };
    expect(model.tools).toHaveLength(1);
    expect((model.tools![0] as { name: string }).name).toBe('greet');
  });

  test('model can have tools array with standard tools', async () => {
    const ast = parse(`
import { now, sleep } from "system/tools"

model m = {
  name: "gpt-4",
  apiKey: "test-key",
  tools: [now, sleep]
}

let timestamp = now()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // Verify model has the tools attached
    const model = runtime.getValue('m') as { tools?: unknown[] };
    expect(model.tools).toHaveLength(2);
    expect((model.tools![0] as { name: string }).name).toBe('now');
    expect((model.tools![1] as { name: string }).name).toBe('sleep');
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

    // Verify model has all 19 standard tools
    const model = runtime.getValue('m') as { tools?: unknown[] };
    expect(model.tools).toHaveLength(19);
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
