import { describe, it, expect } from 'bun:test';
import { provideReferences } from '../providers/references';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver/node';

function createDocument(content: string): TextDocument {
  return TextDocument.create('file:///test.vibe', 'vibe', 1, content);
}

describe('References Provider', () => {
  describe('Function references', () => {
    it('should find all references to a function', () => {
      const doc = createDocument(`function greet(name: text): text {
  return "Hello " + name
}

greet("world")
greet("test")`);

      // Click on "greet" in the declaration
      const refs = provideReferences(doc, { line: 0, character: 9 }, true);

      expect(refs.length).toBe(3); // declaration + 2 calls
    });

    it('should find references without declaration', () => {
      const doc = createDocument(`function greet(name: text): text {
  return "Hello " + name
}

greet("world")
greet("test")`);

      // Click on "greet" call, exclude declaration
      const refs = provideReferences(doc, { line: 4, character: 0 }, false);

      expect(refs.length).toBe(2); // just the 2 calls
    });
  });

  describe('Variable references', () => {
    it('should find all references to a variable', () => {
      const doc = createDocument(`let counter = 0
counter = counter + 1
print(counter)`);

      // Click on "counter"
      const refs = provideReferences(doc, { line: 0, character: 4 }, true);

      expect(refs.length).toBe(4); // declaration + assignment target + assignment value + print arg
    });
  });

  describe('Model references', () => {
    it('should find references to model in vibe expression', () => {
      const doc = createDocument(`model gpt = {
  provider: "openai",
  modelName: "gpt-4"
}

vibe "Hello" gpt default
vibe "World" gpt default`);

      // Click on "gpt" in declaration
      const refs = provideReferences(doc, { line: 0, character: 6 }, true);

      expect(refs.length).toBe(3); // declaration + 2 vibe usages
    });
  });

  describe('For loop variable references', () => {
    it('should find references to loop variable', () => {
      const doc = createDocument(`let items = [1, 2, 3]
for item in items {
  print(item)
  let x = item * 2
}`);

      // Click on "item" in for loop
      const refs = provideReferences(doc, { line: 1, character: 4 }, true);

      expect(refs.length).toBe(3); // declaration + print arg + multiplication
    });
  });

  describe('Edge cases', () => {
    it('should return empty array for unknown position', () => {
      const doc = createDocument(`let x = 1`);

      // Click on whitespace
      const refs = provideReferences(doc, { line: 0, character: 20 }, true);

      expect(refs.length).toBe(0);
    });

    it('should handle parse errors gracefully', () => {
      const doc = createDocument(`let x = {`);

      const refs = provideReferences(doc, { line: 0, character: 4 }, true);

      expect(refs.length).toBe(0);
    });
  });
});
