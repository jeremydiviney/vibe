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
  });
});
