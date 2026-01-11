import { describe, it, expect } from 'bun:test';
import { provideRename, prepareRename } from '../providers/rename';
import { TextDocument } from 'vscode-languageserver-textdocument';

function createDocument(content: string): TextDocument {
  return TextDocument.create('file:///test.vibe', 'vibe', 1, content);
}

describe('Rename Provider', () => {
  describe('prepareRename', () => {
    it('should return range and placeholder for valid identifier', () => {
      const doc = createDocument(`let counter = 0`);

      const result = prepareRename(doc, { line: 0, character: 4 });

      expect(result).not.toBeNull();
      expect(result?.placeholder).toBe('counter');
      expect(result?.range.start.character).toBe(4);
      expect(result?.range.end.character).toBe(11);
    });

    it('should return null for invalid position', () => {
      const doc = createDocument(`let x = 1`);

      const result = prepareRename(doc, { line: 0, character: 20 });

      expect(result).toBeNull();
    });
  });

  describe('provideRename', () => {
    it('should rename variable and all references', () => {
      const doc = createDocument(`let counter = 0
counter = counter + 1`);

      const result = provideRename(doc, { line: 0, character: 4 }, 'count');

      expect(result).not.toBeNull();
      const edits = result?.changes?.['file:///test.vibe'];
      expect(edits?.length).toBe(3); // declaration + 2 usages

      // All edits should replace with 'count'
      edits?.forEach(edit => {
        expect(edit.newText).toBe('count');
      });
    });

    it('should rename function and all calls', () => {
      const doc = createDocument(`function greet() {
  return "hello"
}

greet()
greet()`);

      const result = provideRename(doc, { line: 0, character: 9 }, 'sayHello');

      expect(result).not.toBeNull();
      const edits = result?.changes?.['file:///test.vibe'];
      expect(edits?.length).toBe(3); // declaration + 2 calls
    });

    it('should rename model and vibe references', () => {
      const doc = createDocument(`model gpt = {
  provider: "openai",
  modelName: "gpt-4"
}

vibe "Hello" gpt default`);

      const result = provideRename(doc, { line: 0, character: 6 }, 'claude');

      expect(result).not.toBeNull();
      const edits = result?.changes?.['file:///test.vibe'];
      expect(edits?.length).toBe(2); // declaration + vibe usage
    });

    it('should rename for-loop variable', () => {
      const doc = createDocument(`let items = [1, 2, 3]
for item in items {
  print(item)
}`);

      const result = provideRename(doc, { line: 1, character: 4 }, 'x');

      expect(result).not.toBeNull();
      const edits = result?.changes?.['file:///test.vibe'];
      expect(edits?.length).toBe(2); // declaration + usage in print
    });

    it('should return null for parse errors', () => {
      const doc = createDocument(`let x = {`);

      const result = provideRename(doc, { line: 0, character: 4 }, 'y');

      expect(result).toBeNull();
    });
  });
});
