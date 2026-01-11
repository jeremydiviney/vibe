import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '@vibe-lang/runtime/parser/parse';
import { analyze } from '@vibe-lang/runtime/semantic';
import { LexerError, ParserError, SemanticError } from '@vibe-lang/runtime/errors';

/**
 * Validate a Vibe document and return diagnostics
 */
export function validateDocument(document: TextDocument): Diagnostic[] {
  const text = document.getText();
  const diagnostics: Diagnostic[] = [];

  try {
    // Parse the document
    const ast = parse(text, { file: document.uri });

    // Run semantic analysis
    const errors = analyze(ast, text);

    // Convert semantic errors to diagnostics
    for (const error of errors) {
      diagnostics.push(createDiagnostic(error, text));
    }
  } catch (error) {
    // Handle lexer/parser errors
    if (error instanceof LexerError || error instanceof ParserError) {
      diagnostics.push(createDiagnostic(error, text));
    } else if (error instanceof Error) {
      // Unknown error - report at start of document
      diagnostics.push({
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        message: error.message,
        severity: DiagnosticSeverity.Error,
        source: 'vibe',
      });
    }
  }

  return diagnostics;
}

interface VibeError {
  message: string;
  location?: { line: number; column: number };
}

function createDiagnostic(error: VibeError, source: string): Diagnostic {
  const line = (error.location?.line ?? 1) - 1; // LSP uses 0-based lines
  const column = (error.location?.column ?? 1) - 1; // LSP uses 0-based columns

  // Try to find the end of the error token/region
  const lines = source.split('\n');
  const lineText = lines[line] ?? '';
  const endColumn = Math.min(column + 10, lineText.length); // Approximate end

  return {
    range: {
      start: { line, character: column },
      end: { line, character: endColumn },
    },
    message: error.message,
    severity: DiagnosticSeverity.Error,
    source: 'vibe',
  };
}
