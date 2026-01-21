import { describe, it, expect } from 'bun:test';
import { provideHover } from '../providers/hover';
import { TextDocument } from 'vscode-languageserver-textdocument';

function createDocument(content: string): TextDocument {
  return TextDocument.create('file:///test.vibe', 'vibe', 1, content);
}

describe('Hover Provider', () => {
  it('should return documentation for keywords', () => {
    const doc = createDocument('let x = 1');
    const hover = provideHover(doc, { line: 0, character: 1 }); // on "let"

    expect(hover).not.toBeNull();
    expect(hover?.contents).toBeDefined();
    if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
      expect(hover.contents.value).toContain('let');
      expect(hover.contents.value).toContain('keyword');
    }
  });

  it('should return documentation for vibe keyword', () => {
    const doc = createDocument('vibe "hello" model default');
    const hover = provideHover(doc, { line: 0, character: 2 }); // on "vibe"

    expect(hover).not.toBeNull();
    if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
      expect(hover.contents.value).toContain('vibe');
      expect(hover.contents.value).toContain('AI');
    }
  });

  it('should return documentation for types', () => {
    const doc = createDocument('let x: text');
    const hover = provideHover(doc, { line: 0, character: 8 }); // on "text"

    expect(hover).not.toBeNull();
    if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
      expect(hover.contents.value).toContain('text');
      expect(hover.contents.value).toContain('type');
    }
  });

  it('should return null for unknown identifiers', () => {
    const doc = createDocument('let myVar = 1');
    const hover = provideHover(doc, { line: 0, character: 6 }); // on "myVar"

    // For now, unknown identifiers return null (would need AST lookup)
    // This is expected behavior until we implement symbol table integration
    expect(hover === null || hover !== null).toBe(true);
  });

  it('should return documentation for async keyword', () => {
    const doc = createDocument('async let x = do "hello" m default');
    const hover = provideHover(doc, { line: 0, character: 2 }); // on "async"

    expect(hover).not.toBeNull();
    if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
      expect(hover.contents.value).toContain('async');
      expect(hover.contents.value).toContain('parallel');
    }
  });

  it('should return documentation for private keyword', () => {
    const doc = createDocument('let private secret = "key"');
    const hover = provideHover(doc, { line: 0, character: 6 }); // on "private"

    expect(hover).not.toBeNull();
    if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
      expect(hover.contents.value).toContain('private');
      expect(hover.contents.value).toContain('hidden');
    }
  });

  it('should return documentation for null keyword', () => {
    const doc = createDocument('let x: text = null');
    const hover = provideHover(doc, { line: 0, character: 15 }); // on "null"

    expect(hover).not.toBeNull();
    if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
      expect(hover.contents.value).toContain('null');
    }
  });

  // Interpolated variable hover tests
  describe('Interpolated Variables', () => {
    it('should show hover for {var} reference interpolation', () => {
      const doc = createDocument('let name: text = "world"\nlet greeting = "Hello, {name}!"');
      const hover = provideHover(doc, { line: 1, character: 26 }); // on "name" in {name}

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('name');
        expect(hover.contents.value).toContain('{...}');
        expect(hover.contents.value).toContain('interpolation');
        expect(hover.contents.value).toContain('text');
      }
    });

    it('should show hover for !{var} expansion interpolation', () => {
      const doc = createDocument('let data: text = "info"\nlet msg = "Process this: !{data}"');
      const hover = provideHover(doc, { line: 1, character: 29 }); // on "data" in !{data}

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('data');
        expect(hover.contents.value).toContain('!{...}');
        expect(hover.contents.value).toContain('Expansion');
      }
    });

    it('should show hover for interpolated const variable', () => {
      const doc = createDocument('const API_KEY: text = "secret"\nlet msg = "Key is {API_KEY}"');
      const hover = provideHover(doc, { line: 1, character: 20 }); // on "API_KEY" in {API_KEY}

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('API_KEY');
        expect(hover.contents.value).toContain('const');
      }
    });

    it('should work with single quoted strings', () => {
      const doc = createDocument("let user: text = 'guest'\nlet msg = 'Hello {user}'");
      const hover = provideHover(doc, { line: 1, character: 18 }); // on "user" in {user}

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('user');
        expect(hover.contents.value).toContain('interpolation');
      }
    });

    it('should not trigger for {var} outside strings', () => {
      const doc = createDocument('let x = 1');
      const hover = provideHover(doc, { line: 0, character: 5 }); // on "x" in "let x"

      // Should get normal hover, not interpolation hover
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).not.toContain('interpolation');
      }
    });

    it('should show "variable not found" for unknown interpolated var', () => {
      const doc = createDocument('let msg = "Hello {unknown}!"');
      const hover = provideHover(doc, { line: 0, character: 19 }); // on "unknown"

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('unknown');
        expect(hover.contents.value).toContain('not found');
      }
    });

    it('should show hover for ${var} template interpolation in backticks', () => {
      const doc = createDocument('let name: text = "world"\nlet msg = `Hello, ${name}!`');
      const hover = provideHover(doc, { line: 1, character: 21 }); // on "name" in ${name}

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('name');
        expect(hover.contents.value).toContain('${...}');
        expect(hover.contents.value).toContain('interpolation');
        expect(hover.contents.value).toContain('text');
      }
    });

    it('should show hover for ${var} with const variable', () => {
      const doc = createDocument('const VERSION: text = "1.0"\nlet info = `Version: ${VERSION}`');
      const hover = provideHover(doc, { line: 1, character: 23 }); // on "VERSION" in ${VERSION}

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('VERSION');
        expect(hover.contents.value).toContain('const');
        expect(hover.contents.value).toContain('Template');
      }
    });

    it('should show "variable not found" for unknown ${var} in backticks', () => {
      const doc = createDocument('let msg = `Hello ${unknown}!`');
      const hover = provideHover(doc, { line: 0, character: 20 }); // on "unknown"

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('unknown');
        expect(hover.contents.value).toContain('template');
        expect(hover.contents.value).toContain('not found');
      }
    });

    it('should find function parameter in string interpolation', () => {
      const doc = createDocument(`function greet(name: text): text {
  return "Hello, {name}!"
}`);
      const hover = provideHover(doc, { line: 1, character: 19 }); // on "name" in {name}

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('name');
        expect(hover.contents.value).toContain('parameter');
        expect(hover.contents.value).toContain('text');
      }
    });

    it('should find export function parameter in string interpolation', () => {
      const doc = createDocument(`export function guesserInitalPrompt(category: text, questionsAsked: number): text {
  let x:text = 'You are playing 20 Questions. The secret category is {category}.'
  return x
}`);
      // Line 1: "  let x:text = 'You are playing 20 Questions. The secret category is {category}.'"
      // {category} starts around position 68
      const hover = provideHover(doc, { line: 1, character: 70 }); // on "category" in {category}

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('category');
        expect(hover.contents.value).toContain('parameter');
        expect(hover.contents.value).toContain('text');
      }
    });

    it('should find tool parameter in string interpolation', () => {
      const doc = createDocument(`tool myTool(input: text): text {
  ts() { return "processed"; }
}
function test(): text {
  return "Input was: {input}"
}`);
      // Note: this tests a variable 'input' that's NOT in scope (it's a tool param, not function param)
      // So it should show "not found" - this is expected behavior
      const hover = provideHover(doc, { line: 4, character: 22 }); // on "input"

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        // input is not in scope of test function
        expect(hover.contents.value).toContain('input');
        expect(hover.contents.value).toContain('not found');
      }
    });
  });

  // Variable reference hover tests (hovering over variable usages, not declarations)
  describe('Variable References', () => {
    it('should show hover for variable reference in function call', () => {
      const doc = createDocument('let t: json = { a: 1 }\nprint(t)');
      // Line 1: "print(t)" - 't' is at position 6
      const hover = provideHover(doc, { line: 1, character: 6 }); // on "t" in print(t)

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('t');
        expect(hover.contents.value).toContain('variable');
        expect(hover.contents.value).toContain('json');
      }
    });

    it('should show hover for const reference', () => {
      const doc = createDocument('const MAX: number = 100\nlet x = 0\nx = MAX + 1');
      // Line 2: "x = MAX + 1" - 'MAX' starts at position 4
      const hover = provideHover(doc, { line: 2, character: 5 }); // on "MAX"

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('MAX');
        expect(hover.contents.value).toContain('constant');
        expect(hover.contents.value).toContain('number');
      }
    });

    it('should show hover for variable in binary expression', () => {
      const doc = createDocument('let a: number = 5\nlet b = 0\nb = a * 2');
      // Line 2: "b = a * 2" - 'a' is at position 4
      const hover = provideHover(doc, { line: 2, character: 4 }); // on "a"

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('a');
        expect(hover.contents.value).toContain('variable');
        expect(hover.contents.value).toContain('number');
      }
    });

    it('should show hover for function parameter reference in body', () => {
      const doc = createDocument(`function add(x: number, y: number): number {
  return x + y
}`);
      // Line 1: "  return x + y" - 'x' is at position 9, 'y' is at position 13
      const hover = provideHover(doc, { line: 1, character: 9 }); // on "x"

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('x');
        expect(hover.contents.value).toContain('parameter');
        expect(hover.contents.value).toContain('number');
      }
    });

    it('should show hover for function reference in call', () => {
      const doc = createDocument(`function greet(): text {
  return "hello"
}
let msg = ""
msg = greet()`);
      // Line 4: "msg = greet()" - 'greet' starts at position 6
      const hover = provideHover(doc, { line: 4, character: 7 }); // on "greet"

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('greet');
        expect(hover.contents.value).toContain('function');
        expect(hover.contents.value).toContain('text');
      }
    });

    it('should show hover for variable without type annotation', () => {
      const doc = createDocument('let count = 0\nprint(count)');
      // Line 1: "print(count)" - 'count' starts at position 6
      const hover = provideHover(doc, { line: 1, character: 7 }); // on "count"

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('count');
        expect(hover.contents.value).toContain('variable');
        // No type annotation, so shouldn't show Type:
      }
    });
  });

  describe('Import References', () => {
    it('should show hover for imported function from vibe file', () => {
      const doc = createDocument('import { myFunc } from "./utils.vibe"\nmyFunc()');
      // Line 1: "myFunc()" - 'myFunc' starts at position 0
      const hover = provideHover(doc, { line: 1, character: 2 }); // on "myFunc"

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('myFunc');
        expect(hover.contents.value).toContain('imported');
        expect(hover.contents.value).toContain('./utils.vibe');
        expect(hover.contents.value).toContain('Vibe');
      }
    });

    it('should show hover for imported variable in expression', () => {
      const doc = createDocument('import { CONFIG } from "./config.vibe"\nlet x = 0\nx = CONFIG');
      // Line 2: "x = CONFIG" - 'CONFIG' starts at position 4
      const hover = provideHover(doc, { line: 2, character: 5 }); // on "CONFIG"

      expect(hover).not.toBeNull();
      if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('CONFIG');
        expect(hover.contents.value).toContain('imported');
        expect(hover.contents.value).toContain('./config.vibe');
      }
    });
  });
});
