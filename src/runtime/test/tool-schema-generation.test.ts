import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, AIProvider } from '../index';
import type { VibeToolValue, ToolSchema } from '../tools/types';

// Mock AI provider for testing (never called in these tests)
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

// Helper to get tool schema from tool variable
function getToolSchema(runtime: Runtime, toolName: string): ToolSchema | undefined {
  const tool = runtime.getValue(toolName) as VibeToolValue | undefined;
  return tool?.schema;
}

describe('Tool Schema Generation', () => {
  // ============================================================================
  // Basic types - what schemas look like for simple Vibe tools
  // ============================================================================

  describe('Basic Types', () => {
    test('tool with text parameter generates string schema', async () => {
      const ast = parse(`
tool greet(name: text): text
  @description "Greet someone"
{
  ts(name) { return "Hello, " + name }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const greetSchema = getToolSchema(runtime, 'greet');

      expect(greetSchema).toEqual({
        name: 'greet',
        description: 'Greet someone',
        parameters: [
          {
            name: 'name',
            type: { type: 'string' },
            required: true,
          },
        ],
        returns: { type: 'string' },
      });
    });

    test('tool with number parameter generates number schema', async () => {
      const ast = parse(`
tool double(n: number): number
  @description "Double a number"
{
  ts(n) { return n * 2 }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const doubleSchema = getToolSchema(runtime, 'double');

      expect(doubleSchema).toEqual({
        name: 'double',
        description: 'Double a number',
        parameters: [
          {
            name: 'n',
            type: { type: 'number' },
            required: true,
          },
        ],
        returns: { type: 'number' },
      });
    });

    test('tool with boolean parameter generates boolean schema', async () => {
      const ast = parse(`
tool negate(flag: boolean): boolean
  @description "Negate a boolean"
{
  ts(flag) { return !flag }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const negateSchema = getToolSchema(runtime, 'negate');

      expect(negateSchema).toEqual({
        name: 'negate',
        description: 'Negate a boolean',
        parameters: [
          {
            name: 'flag',
            type: { type: 'boolean' },
            required: true,
          },
        ],
        returns: { type: 'boolean' },
      });
    });

    test('tool with json parameter generates object schema', async () => {
      const ast = parse(`
tool processData(data: json): json
  @description "Process JSON data"
{
  ts(data) { return { processed: true, ...data } }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const processSchema = getToolSchema(runtime, 'processData');

      expect(processSchema).toEqual({
        name: 'processData',
        description: 'Process JSON data',
        parameters: [
          {
            name: 'data',
            type: { type: 'object', additionalProperties: true },
            description: undefined,
            required: true,
          },
        ],
        returns: { type: 'object', additionalProperties: true },
      });
    });
  });

  // ============================================================================
  // Array types
  // ============================================================================

  describe('Array Types', () => {
    test('tool with text array parameter', async () => {
      const ast = parse(`
tool joinStrings(items: text[]): text
  @description "Join strings"
{
  ts(items) { return items.join(", ") }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const joinSchema = getToolSchema(runtime, 'joinStrings');

      expect(joinSchema).toEqual({
        name: 'joinStrings',
        description: 'Join strings',
        parameters: [
          {
            name: 'items',
            type: { type: 'array', items: { type: 'string' } },
            required: true,
          },
        ],
        returns: { type: 'string' },
      });
    });

    test('tool with number array parameter', async () => {
      const ast = parse(`
tool sum(numbers: number[]): number
  @description "Sum numbers"
{
  ts(numbers) { return numbers.reduce((a, b) => a + b, 0) }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const sumSchema = getToolSchema(runtime, 'sum');

      expect(sumSchema).toEqual({
        name: 'sum',
        description: 'Sum numbers',
        parameters: [
          {
            name: 'numbers',
            type: { type: 'array', items: { type: 'number' } },
            required: true,
          },
        ],
        returns: { type: 'number' },
      });
    });

    test('tool with json array return type', async () => {
      const ast = parse(`
tool getItems(): json[]
  @description "Get items"
{
  ts() { return [{id: 1}, {id: 2}] }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const getItemsSchema = getToolSchema(runtime, 'getItems');

      expect(getItemsSchema).toEqual({
        name: 'getItems',
        description: 'Get items',
        parameters: [],
        returns: { type: 'array', items: { type: 'object', additionalProperties: true } },
      });
    });
  });

  // ============================================================================
  // Multiple parameters
  // ============================================================================

  describe('Multiple Parameters', () => {
    test('tool with multiple parameters of different types', async () => {
      const ast = parse(`
tool calculate(x: number, y: number, op: text): number
  @description "Perform a calculation"
{
  ts(x, y, op) {
    if (op === "add") return x + y
    if (op === "mul") return x * y
    return 0
  }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const calcSchema = getToolSchema(runtime, 'calculate');

      expect(calcSchema).toEqual({
        name: 'calculate',
        description: 'Perform a calculation',
        parameters: [
          { name: 'x', type: { type: 'number' }, required: true },
          { name: 'y', type: { type: 'number' }, required: true },
          { name: 'op', type: { type: 'string' }, required: true },
        ],
        returns: { type: 'number' },
      });
    });

    test('tool with mixed primitive and array parameters', async () => {
      const ast = parse(`
tool filter(items: text[], prefix: text): text[]
  @description "Filter items by prefix"
{
  ts(items, prefix) { return items.filter(i => i.startsWith(prefix)) }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const filterSchema = getToolSchema(runtime, 'filter');

      expect(filterSchema).toEqual({
        name: 'filter',
        description: 'Filter items by prefix',
        parameters: [
          { name: 'items', type: { type: 'array', items: { type: 'string' } }, required: true },
          { name: 'prefix', type: { type: 'string' }, required: true },
        ],
        returns: { type: 'array', items: { type: 'string' } },
      });
    });
  });

  // ============================================================================
  // Decorators - @description and @param
  // ============================================================================

  describe('Decorator Usage', () => {
    test('tool with @description only', async () => {
      const ast = parse(`
tool getCurrentTime(): text
  @description "Get the current ISO timestamp"
{
  ts() { return new Date().toISOString() }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const timeSchema = getToolSchema(runtime, 'getCurrentTime');

      expect(timeSchema?.description).toBe('Get the current ISO timestamp');
      expect(timeSchema?.parameters).toEqual([]);
    });

    test('tool with @param descriptions', async () => {
      const ast = parse(`
tool sendEmail(to: text, subject: text, body: text): boolean
  @description "Send an email"
  @param to "The recipient email address"
  @param subject "The email subject line"
  @param body "The email body content"
{
  ts(to, subject, body) { return true }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const emailSchema = getToolSchema(runtime, 'sendEmail');

      expect(emailSchema).toEqual({
        name: 'sendEmail',
        description: 'Send an email',
        parameters: [
          { name: 'to', type: { type: 'string' }, description: 'The recipient email address', required: true },
          { name: 'subject', type: { type: 'string' }, description: 'The email subject line', required: true },
          { name: 'body', type: { type: 'string' }, description: 'The email body content', required: true },
        ],
        returns: { type: 'boolean' },
      });
    });

    test('tool with partial @param descriptions (not all params described)', async () => {
      const ast = parse(`
tool search(query: text, limit: number, exact: boolean): json
  @description "Search for items"
  @param query "The search query"
{
  ts(query, limit, exact) { return [] }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const searchSchema = getToolSchema(runtime, 'search');

      expect(searchSchema).toEqual({
        name: 'search',
        description: 'Search for items',
        parameters: [
          { name: 'query', type: { type: 'string' }, description: 'The search query', required: true },
          { name: 'limit', type: { type: 'number' }, description: undefined, required: true },
          { name: 'exact', type: { type: 'boolean' }, description: undefined, required: true },
        ],
        returns: { type: 'object', additionalProperties: true },
      });
    });
  });

  // ============================================================================
  // Multiple tools - full registry schema
  // ============================================================================

  describe('Multiple Tools', () => {
    test('multiple tools can be defined and have correct schemas', async () => {
      const ast = parse(`
tool add(a: number, b: number): number
  @description "Add two numbers"
{
  ts(a, b) { return a + b }
}

tool multiply(a: number, b: number): number
  @description "Multiply two numbers"
{
  ts(a, b) { return a * b }
}

tool greet(name: text): text
  @description "Greet someone"
  @param name "The person's name"
{
  ts(name) { return "Hello, " + name }
}

let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      // Verify each tool's schema by getting it from the tool variable
      expect(getToolSchema(runtime, 'add')).toEqual({
        name: 'add',
        description: 'Add two numbers',
        parameters: [
          { name: 'a', type: { type: 'number' }, required: true },
          { name: 'b', type: { type: 'number' }, required: true },
        ],
        returns: { type: 'number' },
      });

      expect(getToolSchema(runtime, 'multiply')).toEqual({
        name: 'multiply',
        description: 'Multiply two numbers',
        parameters: [
          { name: 'a', type: { type: 'number' }, required: true },
          { name: 'b', type: { type: 'number' }, required: true },
        ],
        returns: { type: 'number' },
      });

      expect(getToolSchema(runtime, 'greet')).toEqual({
        name: 'greet',
        description: 'Greet someone',
        parameters: [
          { name: 'name', type: { type: 'string' }, description: "The person's name", required: true },
        ],
        returns: { type: 'string' },
      });
    });

    test('standard tools are NOT auto-available', async () => {
      // Standard tools must be imported from system modules
      const ast = parse(`let x = "init"`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      // Standard tools should not be defined as variables
      const standardToolNames = ['sleep', 'now', 'jsonParse', 'jsonStringify', 'env', 'readFile'];
      for (const name of standardToolNames) {
        expect(runtime.getValue(name)).toBeUndefined();
      }
    });
  });

  // ============================================================================
  // No return type
  // ============================================================================

  describe('No Return Type', () => {
    test('tool without return type annotation', async () => {
      const ast = parse(`
tool logMessage(message: text)
  @description "Log a message"
{
  ts(message) { console.log(message) }
}
let x = "init"
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();

      const logSchema = getToolSchema(runtime, 'logMessage');

      expect(logSchema).toEqual({
        name: 'logMessage',
        description: 'Log a message',
        parameters: [
          { name: 'message', type: { type: 'string' }, required: true },
        ],
        // No 'returns' field when return type is not specified
      });
    });
  });
});
