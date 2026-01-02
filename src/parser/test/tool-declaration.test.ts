import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Tool Declaration', () => {
  // ============================================================================
  // Basic tool declarations
  // ============================================================================

  test('simple tool with no parameters', () => {
    const ast = parse(`
tool getCurrentTime(): text
  @description "Get the current time"
{
  ts() {
    return new Date().toISOString()
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ToolDeclaration',
      name: 'getCurrentTime',
      params: [],
      returnType: 'text',
      description: 'Get the current time',
    });
  });

  test('tool with single parameter', () => {
    const ast = parse(`
tool greet(name: text): text
  @description "Greet someone"
{
  ts(name) {
    return "Hello, " + name
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ToolDeclaration',
      name: 'greet',
      params: [
        { name: 'name', typeAnnotation: 'text' },
      ],
      returnType: 'text',
      description: 'Greet someone',
    });
  });

  test('tool with multiple parameters', () => {
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
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ToolDeclaration',
      name: 'calculate',
      params: [
        { name: 'x', typeAnnotation: 'number' },
        { name: 'y', typeAnnotation: 'number' },
        { name: 'op', typeAnnotation: 'text' },
      ],
      returnType: 'number',
    });
  });

  // ============================================================================
  // Tool with @param descriptions
  // ============================================================================

  test('tool with @param descriptions', () => {
    const ast = parse(`
tool fetchUrl(url: text): json
  @description "Fetch data from a URL"
  @param url "The URL to fetch from"
{
  ts(url) {
    const response = await fetch(url)
    return await response.json()
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ToolDeclaration',
      name: 'fetchUrl',
      params: [
        { name: 'url', typeAnnotation: 'text', description: 'The URL to fetch from' },
      ],
      description: 'Fetch data from a URL',
    });
  });

  test('tool with multiple @param descriptions', () => {
    const ast = parse(`
tool sendEmail(to: text, subject: text, body: text): boolean
  @description "Send an email"
  @param to "The recipient email address"
  @param subject "The email subject line"
  @param body "The email body content"
{
  ts(to, subject, body) {
    return true
  }
}
`);
    expect(ast.body).toHaveLength(1);
    const toolDecl = ast.body[0];
    expect(toolDecl.type).toBe('ToolDeclaration');
    if (toolDecl.type === 'ToolDeclaration') {
      expect(toolDecl.params).toHaveLength(3);
      expect(toolDecl.params[0].description).toBe('The recipient email address');
      expect(toolDecl.params[1].description).toBe('The email subject line');
      expect(toolDecl.params[2].description).toBe('The email body content');
    }
  });

  // ============================================================================
  // Tool type annotations
  // ============================================================================

  test('tool with json return type', () => {
    const ast = parse(`
tool getData(): json
  @description "Get some data"
{
  ts() {
    return { foo: "bar" }
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ToolDeclaration',
      name: 'getData',
      returnType: 'json',
    });
  });

  test('tool with boolean return type', () => {
    const ast = parse(`
tool isValid(value: text): boolean
  @description "Check if value is valid"
{
  ts(value) {
    return value.length > 0
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ToolDeclaration',
      returnType: 'boolean',
    });
  });

  test('tool with array type parameter', () => {
    const ast = parse(`
tool sum(numbers: number[]): number
  @description "Sum all numbers"
{
  ts(numbers) {
    return numbers.reduce((a, b) => a + b, 0)
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ToolDeclaration',
      params: [
        { name: 'numbers', typeAnnotation: 'number[]' },
      ],
      returnType: 'number',
    });
  });

  // ============================================================================
  // Tool with imported TypeScript types
  // ============================================================================

  test('tool with imported type as parameter', () => {
    // Note: Currently uses regular import syntax. Type imports would be:
    // import type { CustomerInfo } from "./types.ts"
    const ast = parse(`
import { CustomerInfo } from "./types.ts"

tool processCustomer(info: CustomerInfo): json
  @description "Process customer information"
{
  ts(info) {
    return { processed: true }
  }
}
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0].type).toBe('ImportDeclaration');
    expect(ast.body[1]).toMatchObject({
      type: 'ToolDeclaration',
      name: 'processCustomer',
      params: [
        { name: 'info', typeAnnotation: 'CustomerInfo' },
      ],
    });
  });

  // ============================================================================
  // Multiple tools
  // ============================================================================

  test('multiple tool declarations', () => {
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
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0]).toMatchObject({
      type: 'ToolDeclaration',
      name: 'add',
    });
    expect(ast.body[1]).toMatchObject({
      type: 'ToolDeclaration',
      name: 'multiply',
    });
  });

  // ============================================================================
  // Tool with no return type
  // ============================================================================

  test('tool without return type annotation', () => {
    const ast = parse(`
tool logMessage(message: text)
  @description "Log a message"
{
  ts(message) {
    console.log(message)
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ToolDeclaration',
      name: 'logMessage',
      returnType: null,
    });
  });
});

describe('Syntax Errors - Tool Declaration', () => {
  test('tool missing name', () => {
    expect(() => parse(`
tool (x: text): text
  @description "test"
{
  ts(x) { return x }
}
`)).toThrow();
  });

  test('tool missing body', () => {
    expect(() => parse(`
tool test(): text
  @description "test"
`)).toThrow();
  });

  // Note: Type validation happens at semantic analysis, not parsing.
  // The parser accepts any identifier as a type, including custom types
  // from imports. So "invalidType" is valid syntax that would fail later.
  test('tool with custom type parameter parses successfully', () => {
    // This is valid syntax - type validation happens later
    const ast = parse(`
tool test(x: CustomType): text
  @description "test"
{
  ts(x) { return x }
}
`);
    expect(ast.body[0]).toMatchObject({
      type: 'ToolDeclaration',
      params: [{ name: 'x', typeAnnotation: 'CustomType' }],
    });
  });
});
