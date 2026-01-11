import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Analysis - Tool Declaration', () => {
  // ============================================================================
  // @param decorator validation
  // ============================================================================

  describe('@param decorator validation', () => {
    test('valid @param referencing existing parameter', () => {
      const ast = parse(`
tool greet(name: text): text
  @description "Greet someone"
  @param name "The person's name"
{
  ts(name) { return "Hello, " + name }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(0);
    });

    test('valid @param for multiple parameters', () => {
      const ast = parse(`
tool calculate(x: number, y: number, op: text): number
  @description "Calculate"
  @param x "First operand"
  @param y "Second operand"
  @param op "Operation"
{
  ts(x, y, op) { return x + y }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(0);
    });

    test('error when @param references non-existent parameter', () => {
      const ast = parse(`
tool greet(name: text): text
  @description "Greet someone"
  @param nonexistent "This param does not exist"
{
  ts(name) { return "Hello, " + name }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("@param 'nonexistent' does not match any parameter");
      expect(errors[0].message).toContain("Valid parameters: name");
    });

    test('error when @param references non-existent parameter among multiple', () => {
      const ast = parse(`
tool sendEmail(to: text, subject: text): boolean
  @description "Send email"
  @param to "Recipient"
  @param body "This param does not exist"
{
  ts(to, subject) { return true }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("@param 'body' does not match any parameter");
      expect(errors[0].message).toContain("Valid parameters: to, subject");
    });

    test('error when @param used on tool with no parameters', () => {
      const ast = parse(`
tool getCurrentTime(): text
  @description "Get current time"
  @param time "There are no params"
{
  ts() { return new Date().toISOString() }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("@param 'time' does not match any parameter");
      expect(errors[0].message).toContain("Valid parameters: (none)");
    });

    test('multiple @param errors reported', () => {
      const ast = parse(`
tool greet(name: text): text
  @description "Greet"
  @param foo "Does not exist"
  @param bar "Also does not exist"
{
  ts(name) { return "Hello" }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(2);
      expect(errors[0].message).toContain("@param 'foo'");
      expect(errors[1].message).toContain("@param 'bar'");
    });

    test('partial valid @params with one invalid', () => {
      const ast = parse(`
tool search(query: text, limit: number): json
  @description "Search"
  @param query "Search query"
  @param typo "This is a typo"
  @param limit "Max results"
{
  ts(query, limit) { return [] }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("@param 'typo'");
    });
  });

  // ============================================================================
  // Tool type validation
  // ============================================================================

  describe('Tool type validation', () => {
    test('valid Vibe types in parameters', () => {
      const ast = parse(`
tool test(a: text, b: number, c: boolean, d: json): text
  @description "Test"
{
  ts(a, b, c, d) { return a }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(0);
    });

    test('valid array types in parameters', () => {
      const ast = parse(`
tool test(items: text[], numbers: number[]): json[]
  @description "Test"
{
  ts(items, numbers) { return [] }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(0);
    });

    test('error for unknown type in parameter', () => {
      const ast = parse(`
tool test(data: UnknownType): text
  @description "Test"
{
  ts(data) { return "" }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Unknown type 'UnknownType'");
    });

    test('error for unknown return type', () => {
      const ast = parse(`
tool test(name: text): UnknownReturn
  @description "Test"
{
  ts(name) { return {} }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Unknown return type 'UnknownReturn'");
    });

    test('imported type is valid when imported', () => {
      const ast = parse(`
import { CustomerInfo } from "./types.ts"

tool processCustomer(info: CustomerInfo): json
  @description "Process customer"
{
  ts(info) { return {} }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(0);
    });
  });

  // ============================================================================
  // Tool scope validation
  // ============================================================================

  describe('Tool scope validation', () => {
    test('tool at global scope is valid', () => {
      const ast = parse(`
tool greet(name: text): text
  @description "Greet"
{
  ts(name) { return "Hello" }
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(0);
    });

    // Note: Parser currently doesn't allow tools inside blocks,
    // so this test documents that behavior would be caught
    // if it were syntactically allowed
  });

  // ============================================================================
  // Tool call validation - tools cannot be called directly
  // ============================================================================

  describe('Tool call validation', () => {
    test('error when calling user-defined tool directly', () => {
      const ast = parse(`
tool greet(name: text): text
  @description "Greet"
{
  ts(name) { return "Hello, " + name }
}

let result = greet("World")
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Cannot call tool 'greet' directly");
      expect(errors[0].message).toContain("Tools can only be used by AI models");
    });

    test('error when calling imported tool directly', () => {
      const ast = parse(`
import { now } from "system/tools"
let timestamp = now()
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Cannot call tool 'now' directly");
    });

    test('error when calling multiple tools directly', () => {
      const ast = parse(`
import { readFile, writeFile } from "system/tools"
let content = readFile("test.txt")
let _ = writeFile("out.txt", "data")
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(2);
      expect(errors[0].message).toContain("Cannot call tool 'readFile' directly");
      expect(errors[1].message).toContain("Cannot call tool 'writeFile' directly");
    });

    test('no error when tool is used in model tools array', () => {
      const ast = parse(`
tool greet(name: text): text
  @description "Greet"
{
  ts(name) { return "Hello, " + name }
}

model m = {
  name: "gpt-4",
  apiKey: "key",
  url: "https://api.openai.com",
  tools: [greet]
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(0);
    });

    test('no error when standardTools is imported and used in model', () => {
      const ast = parse(`
import { standardTools } from "system/tools"

model m = {
  name: "gpt-4",
  apiKey: "key",
  url: "https://api.openai.com",
  tools: standardTools
}
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(0);
    });

    test('tool declaration is valid but calling it is not', () => {
      const ast = parse(`
tool double(n: number): number
  @description "Double a number"
{
  ts(n) { return n * 2 }
}

// Just referencing the tool is fine (e.g., for model tools array)
let toolRef = double

// But calling it is not allowed
let result = double(21)
`);
      const errors = analyze(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Cannot call tool 'double' directly");
    });
  });
});
