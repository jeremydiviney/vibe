import { describe, it, expect } from 'bun:test';
import { provideDefinition } from '../providers/definition';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver/node';

function createDocument(content: string): TextDocument {
  return TextDocument.create('file:///test.vibe', 'vibe', 1, content);
}

describe('Definition Provider', () => {
  describe('Function definitions', () => {
    it('should find function definition from call site', () => {
      const doc = createDocument(`function greet(name: text): text {
  return "Hello " + name
}

greet("world")`);

      // Click on "greet" in the call (line 4, column 0)
      const def = provideDefinition(doc, { line: 4, character: 0 }) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(0); // Function is on line 0
      expect(def.range.start.character).toBe(9); // Name starts at column 9 (after "function ")
    });

    it('should find function definition when clicking on declaration', () => {
      const doc = createDocument(`function foo() {
  return 1
}`);

      // Click on "foo" in the declaration (line 0, column 9)
      const def = provideDefinition(doc, { line: 0, character: 9 }) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(0);
      expect(def.range.start.character).toBe(9); // Name starts at column 9
    });
  });

  describe('Variable definitions', () => {
    it('should find variable definition from reference', () => {
      const doc = createDocument(`let counter = 0
counter = counter + 1`);

      // Click on "counter" in the expression (line 1, column ~10)
      const def = provideDefinition(doc, { line: 1, character: 10 }) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(0); // Declaration is on line 0
    });

    it('should find const definition', () => {
      const doc = createDocument(`const PI = 3.14159
let area = PI * 10`);

      // Click on "PI" in the expression (line 1, column ~11)
      const def = provideDefinition(doc, { line: 1, character: 11 }) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(0);
    });
  });

  describe('Tool definitions', () => {
    it('should find tool definition from call', () => {
      const doc = createDocument(`tool sayHello(name: text): text @description "Greets someone" {
  return "Hello " + name
}

sayHello("world")`);

      // Click on "sayHello" in the call (line 4)
      const def = provideDefinition(doc, { line: 4, character: 0 }) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(0);
    });
  });

  describe('Model definitions', () => {
    it('should find model definition from vibe expression', () => {
      const doc = createDocument(`model gpt = {
  provider: "openai",
  modelName: "gpt-4"
}

vibe "Hello" gpt default`);

      // Click on "gpt" in vibe expression (line 5, column 13)
      // "vibe "Hello" gpt" - gpt starts at column 13 (0-indexed)
      const def = provideDefinition(doc, { line: 5, character: 13 }) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(0);
      expect(def.range.start.character).toBe(6); // "model " is 6 chars
    });
  });

  describe('Parameter definitions', () => {
    // TODO: Parameters don't have location info in AST, so go-to-definition
    // for parameters is not yet supported. This test documents the limitation.
    it('should return null for parameter references (not yet supported)', () => {
      const doc = createDocument(`function double(x: number): number {
  return x * 2
}`);

      // Click on "x" in the return statement (line 1, column 9)
      const def = provideDefinition(doc, { line: 1, character: 9 });

      // Parameters don't have location info, so definition lookup fails
      expect(def).toBeNull();
    });
  });

  describe('For loop variable definitions', () => {
    it('should find loop variable definition', () => {
      const doc = createDocument(`let items = [1, 2, 3]
for item in items {
  print(item)
}`);

      // Click on "item" in the print call (line 2, column ~8)
      const def = provideDefinition(doc, { line: 2, character: 8 }) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(1); // for statement is on line 1
    });
  });

  describe('Edge cases', () => {
    it('should return null for unknown identifiers', () => {
      const doc = createDocument(`let x = unknownVar`);

      // Click on "unknownVar" (not declared)
      const def = provideDefinition(doc, { line: 0, character: 10 });

      expect(def).toBeNull();
    });

    it('should return null for keywords', () => {
      const doc = createDocument(`let x = 1`);

      // Click on "let" keyword
      const def = provideDefinition(doc, { line: 0, character: 1 });

      expect(def).toBeNull();
    });

    it('should return null for string literals', () => {
      const doc = createDocument(`let x = "hello"`);

      // Click inside string
      const def = provideDefinition(doc, { line: 0, character: 10 });

      expect(def).toBeNull();
    });

    it('should handle parse errors gracefully', () => {
      const doc = createDocument(`let x = {`); // Invalid syntax

      const def = provideDefinition(doc, { line: 0, character: 5 });

      expect(def).toBeNull();
    });
  });
});
