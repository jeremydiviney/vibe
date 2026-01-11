import { describe, it, expect } from 'bun:test';
import { provideSignatureHelp } from '../providers/signature';
import { TextDocument } from 'vscode-languageserver-textdocument';

function createDocument(content: string): TextDocument {
  return TextDocument.create('file:///test.vibe', 'vibe', 1, content);
}

describe('Signature Help Provider', () => {
  describe('Built-in functions', () => {
    it('should show signature for print()', () => {
      const doc = createDocument(`print(`);

      const result = provideSignatureHelp(doc, { line: 0, character: 6 });

      expect(result).not.toBeNull();
      expect(result?.signatures[0].label).toBe('print(message: text)');
      expect(result?.activeParameter).toBe(0);
    });

    it('should show signature for write() with active parameter', () => {
      const doc = createDocument(`write("file.txt", `);

      const result = provideSignatureHelp(doc, { line: 0, character: 18 });

      expect(result).not.toBeNull();
      expect(result?.signatures[0].label).toBe('write(path: text, content: text)');
      expect(result?.activeParameter).toBe(1); // Second parameter
    });

    it('should show signature for env()', () => {
      const doc = createDocument(`let key = env(`);

      const result = provideSignatureHelp(doc, { line: 0, character: 14 });

      expect(result).not.toBeNull();
      expect(result?.signatures[0].label).toBe('env(name: text)');
    });
  });

  describe('User-defined functions', () => {
    it('should show signature for user function', () => {
      const doc = createDocument(`function greet(name: text, age: number): text {
  return "Hello"
}

greet(`);

      const result = provideSignatureHelp(doc, { line: 4, character: 6 });

      expect(result).not.toBeNull();
      expect(result?.signatures[0].label).toBe('greet(name: text, age: number): text');
      expect(result?.signatures[0].parameters?.length).toBe(2);
      expect(result?.activeParameter).toBe(0);
    });

    it('should show active parameter after comma', () => {
      const doc = createDocument(`function add(a: number, b: number): number {
  return a + b
}

add(1, `);

      const result = provideSignatureHelp(doc, { line: 4, character: 7 });

      expect(result).not.toBeNull();
      expect(result?.activeParameter).toBe(1);
    });
  });

  describe('Tools', () => {
    it('should show signature for tool with description', () => {
      const doc = createDocument(`tool sayHello(name: text): text @description "Greets someone" {
  return "Hello " + name
}

sayHello(`);

      const result = provideSignatureHelp(doc, { line: 4, character: 9 });

      expect(result).not.toBeNull();
      expect(result?.signatures[0].label).toBe('sayHello(name: text): text');
      expect(result?.signatures[0].documentation).toBe('Greets someone');
    });
  });

  describe('Edge cases', () => {
    it('should return null outside function call', () => {
      const doc = createDocument(`let x = 1`);

      const result = provideSignatureHelp(doc, { line: 0, character: 5 });

      expect(result).toBeNull();
    });

    it('should handle nested calls', () => {
      const doc = createDocument(`print(length(`);

      const result = provideSignatureHelp(doc, { line: 0, character: 13 });

      expect(result).not.toBeNull();
      expect(result?.signatures[0].label).toBe('length(value: text | json[])');
    });

    it('should return null for unknown function', () => {
      const doc = createDocument(`unknownFunc(`);

      const result = provideSignatureHelp(doc, { line: 0, character: 12 });

      expect(result).toBeNull();
    });
  });
});
