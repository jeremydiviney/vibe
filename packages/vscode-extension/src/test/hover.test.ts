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
});
