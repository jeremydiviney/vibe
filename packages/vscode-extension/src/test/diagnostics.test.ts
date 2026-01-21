import { describe, it, expect } from 'bun:test';
import { validateDocument } from '../providers/diagnostics';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

function createDocument(content: string): TextDocument {
  return TextDocument.create('file:///test.vibe', 'vibe', 1, content);
}

describe('Diagnostics Provider', () => {
  it('should return no diagnostics for valid code', () => {
    const doc = createDocument('let x = 1');
    const diagnostics = validateDocument(doc);
    expect(diagnostics).toEqual([]);
  });

  it('should return no diagnostics for valid function', () => {
    const doc = createDocument(`
function greet(name: text): text {
  return "Hello"
}
`);
    const diagnostics = validateDocument(doc);
    expect(diagnostics).toEqual([]);
  });

  it('should detect lexer errors (invalid token)', () => {
    const doc = createDocument('let x = $$$');
    const diagnostics = validateDocument(doc);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
  });

  it('should detect parser errors (syntax error)', () => {
    const doc = createDocument('let = 1'); // missing identifier
    const diagnostics = validateDocument(doc);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
  });

  it('should detect semantic errors (undefined variable)', () => {
    const doc = createDocument('let x = y'); // y is undefined
    const diagnostics = validateDocument(doc);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
    expect(diagnostics[0].message.toLowerCase()).toContain('not defined');
  });

  it('should report correct line numbers', () => {
    const doc = createDocument(`let a = 1
let b = 2
let c = undefined_var`);
    const diagnostics = validateDocument(doc);

    expect(diagnostics.length).toBeGreaterThan(0);
    // Error should be on line 2 (0-indexed)
    expect(diagnostics[0].range.start.line).toBe(2);
  });

  it('should show improved error for reserved type as identifier', () => {
    const doc = createDocument('function text(x: number): number { return x }');
    const diagnostics = validateDocument(doc);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message).toContain('reserved type name');
  });

  it('should show improved error for reserved keyword as identifier', () => {
    const doc = createDocument('let return = 5');
    const diagnostics = validateDocument(doc);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message).toContain('reserved keyword');
  });

  it('should show improved error for missing comma in object', () => {
    const doc = createDocument(`let x = {
  a: 1
  b: 2
}`);
    const diagnostics = validateDocument(doc);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message.toLowerCase()).toContain('missing comma');
  });
});
