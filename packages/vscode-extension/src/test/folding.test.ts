import { describe, it, expect } from 'bun:test';
import { provideFoldingRanges } from '../providers/folding';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FoldingRangeKind } from 'vscode-languageserver/node';

function createDocument(content: string): TextDocument {
  return TextDocument.create('file:///test.vibe', 'vibe', 1, content);
}

describe('Folding Ranges Provider', () => {
  describe('Function folding', () => {
    it('should fold function body', () => {
      const doc = createDocument(`function greet() {
  let x = 1
  return x
}`);

      const ranges = provideFoldingRanges(doc);

      expect(ranges.length).toBeGreaterThanOrEqual(1);
      const funcRange = ranges.find(r => r.startLine === 0);
      expect(funcRange).toBeDefined();
      expect(funcRange?.endLine).toBeGreaterThan(0);
    });
  });

  describe('Tool folding', () => {
    it('should fold tool body', () => {
      const doc = createDocument(`tool sayHello(name: text): text @description "Greets" {
  return "Hello " + name
}`);

      const ranges = provideFoldingRanges(doc);

      expect(ranges.length).toBeGreaterThanOrEqual(1);
      const toolRange = ranges.find(r => r.startLine === 0);
      expect(toolRange).toBeDefined();
    });

    it('should fold tool with ts block', () => {
      const doc = createDocument(`tool myTool(input: text): text @description "Does something" {
  ts() {
    return "processed";
  }
}`);

      const ranges = provideFoldingRanges(doc);

      expect(ranges.length).toBeGreaterThanOrEqual(1);
      const toolRange = ranges.find(r => r.startLine === 0);
      expect(toolRange).toBeDefined();
      expect(toolRange?.endLine).toBe(4);
    });

    it('should fold multi-line tool declaration', () => {
      const doc = createDocument(`tool processData(
  input: text,
  count: number
): text @description "Processes data" {
  return input
}`);

      const ranges = provideFoldingRanges(doc);

      // Tool body should fold from line 3 (where { is) to line 5
      const toolRange = ranges.find(r => r.startLine === 3);
      expect(toolRange).toBeDefined();
    });
  });

  describe('If statement folding', () => {
    it('should fold if/else blocks', () => {
      const doc = createDocument(`let x = 1
if x > 0 {
  print("positive")
} else {
  print("non-positive")
}`);

      const ranges = provideFoldingRanges(doc);

      // Should have at least 2 ranges (if block and else block)
      expect(ranges.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Loop folding', () => {
    it('should fold for loop body', () => {
      const doc = createDocument(`let items = [1, 2, 3]
for item in items {
  print(item)
}`);

      const ranges = provideFoldingRanges(doc);

      expect(ranges.length).toBeGreaterThanOrEqual(1);
      const loopRange = ranges.find(r => r.startLine === 1);
      expect(loopRange).toBeDefined();
    });

    it('should fold while loop body', () => {
      const doc = createDocument(`let i = 0
while i < 10 {
  i = i + 1
}`);

      const ranges = provideFoldingRanges(doc);

      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Comment folding', () => {
    it('should fold consecutive line comments', () => {
      const doc = createDocument(`// This is a comment
// that spans multiple
// lines
let x = 1`);

      const ranges = provideFoldingRanges(doc);

      const commentRange = ranges.find(r => r.kind === FoldingRangeKind.Comment);
      expect(commentRange).toBeDefined();
      expect(commentRange?.startLine).toBe(0);
      expect(commentRange?.endLine).toBe(2);
    });

    it('should fold block comments', () => {
      const doc = createDocument(`/*
 * Multi-line
 * block comment
 */
let x = 1`);

      const ranges = provideFoldingRanges(doc);

      const commentRange = ranges.find(r => r.kind === FoldingRangeKind.Comment);
      expect(commentRange).toBeDefined();
    });
  });

  describe('Nested folding', () => {
    it('should fold nested blocks', () => {
      const doc = createDocument(`function outer() {
  if true {
    let x = 1
  }
}`);

      const ranges = provideFoldingRanges(doc);

      // Should have at least 2 ranges (function and if)
      expect(ranges.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Fallback brace matching', () => {
    it('should fold based on braces when parse fails', () => {
      // This is invalid Vibe syntax but has balanced braces
      const doc = createDocument(`function {
  let x = @#$%
}`);

      const ranges = provideFoldingRanges(doc);

      // Should still get a folding range from brace matching
      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('JSON object folding', () => {
    it('should fold multi-line JSON object', () => {
      const doc = createDocument(`let config: json = {
  name: "test",
  value: 42
}`);

      const ranges = provideFoldingRanges(doc);

      // Should have a folding range for the JSON object
      const jsonRange = ranges.find(r => r.startLine === 0);
      expect(jsonRange).toBeDefined();
      expect(jsonRange?.endLine).toBe(3);
    });

    it('should fold nested JSON object', () => {
      const doc = createDocument(`let data: json = {
  outer: {
    inner: 1
  }
}`);

      const ranges = provideFoldingRanges(doc);

      // Should have folding ranges for both outer and inner objects
      expect(ranges.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Export declaration folding', () => {
    it('should fold export function body', () => {
      const doc = createDocument(`export function greet(name: text): text {
  let greeting = "Hello"
  return greeting + name
}`);

      const ranges = provideFoldingRanges(doc);

      expect(ranges.length).toBeGreaterThanOrEqual(1);
      const funcRange = ranges.find(r => r.startLine === 0);
      expect(funcRange).toBeDefined();
      expect(funcRange?.endLine).toBe(3);
    });

    it('should fold export const with JSON object', () => {
      const doc = createDocument(`export const config: json = {
  name: "app",
  version: "1.0"
}`);

      const ranges = provideFoldingRanges(doc);

      const jsonRange = ranges.find(r => r.startLine === 0);
      expect(jsonRange).toBeDefined();
      expect(jsonRange?.endLine).toBe(3);
    });

    it('should fold export const with array', () => {
      const doc = createDocument(`export const items: json = [
  "item1",
  "item2",
  "item3"
]`);

      const ranges = provideFoldingRanges(doc);

      const arrayRange = ranges.find(r => r.startLine === 0);
      expect(arrayRange).toBeDefined();
      expect(arrayRange?.endLine).toBe(4);
    });

    it('should fold export model declaration', () => {
      const doc = createDocument(`export model myModel = {
  name: "gpt-4",
  provider: "openai",
  apiKey: env("OPENAI_KEY")
}`);

      const ranges = provideFoldingRanges(doc);

      const modelRange = ranges.find(r => r.startLine === 0);
      expect(modelRange).toBeDefined();
      expect(modelRange?.endLine).toBe(4);
    });
  });

  describe('Array folding', () => {
    it('should fold multi-line array', () => {
      const doc = createDocument(`let items: json = [
  1,
  2,
  3
]`);

      const ranges = provideFoldingRanges(doc);

      const arrayRange = ranges.find(r => r.startLine === 0);
      expect(arrayRange).toBeDefined();
      expect(arrayRange?.endLine).toBe(4);
    });

    it('should fold array with nested objects', () => {
      const doc = createDocument(`let users: json = [
  {
    name: "Alice"
  },
  {
    name: "Bob"
  }
]`);

      const ranges = provideFoldingRanges(doc);

      // Should have ranges for outer array and inner objects
      expect(ranges.length).toBeGreaterThanOrEqual(3);
    });
  });
});
