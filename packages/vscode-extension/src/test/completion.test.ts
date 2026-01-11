import { describe, it, expect } from 'bun:test';
import { provideCompletions } from '../providers/completion';
import { TextDocument } from 'vscode-languageserver-textdocument';

function createDocument(content: string): TextDocument {
  return TextDocument.create('file:///test.vibe', 'vibe', 1, content);
}

describe('Completion Provider', () => {
  it('should return keyword completions', () => {
    const doc = createDocument('');
    const completions = provideCompletions(doc, { line: 0, character: 0 });

    // Should have keywords
    const keywords = completions.map(c => c.label);
    expect(keywords).toContain('let');
    expect(keywords).toContain('const');
    expect(keywords).toContain('function');
    expect(keywords).toContain('vibe');
    expect(keywords).toContain('if');
    expect(keywords).toContain('for');
  });

  it('should return built-in tools', () => {
    const doc = createDocument('');
    const completions = provideCompletions(doc, { line: 0, character: 0 });

    const tools = completions.map(c => c.label);
    expect(tools).toContain('sleep');
    expect(tools).toContain('print');
    expect(tools).toContain('jsonParse');
  });

  it('should return decorators after @', () => {
    const doc = createDocument('tool foo() @');
    const completions = provideCompletions(doc, { line: 0, character: 12 });

    const labels = completions.map(c => c.label);
    expect(labels).toContain('description');
    expect(labels).toContain('param');
  });

  it('should return types after colon', () => {
    const doc = createDocument('let x: ');
    const completions = provideCompletions(doc, { line: 0, character: 7 });

    const types = completions.map(c => c.label);
    expect(types).toContain('text');
    expect(types).toContain('json');
    expect(types).toContain('number');
    expect(types).toContain('boolean');
  });
});
