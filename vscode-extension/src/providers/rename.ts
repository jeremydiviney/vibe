import { WorkspaceEdit, TextEdit, Position, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '../../../src/parser/parse';
import { findIdentifierAtPosition } from '../utils/ast-utils';
import { findAllOccurrences } from '../utils/ast-walker';
import { toParserPosition, createRange } from '../utils/position';

/**
 * Rename a symbol and all its references
 */
export function provideRename(
  document: TextDocument,
  position: Position,
  newName: string
): WorkspaceEdit | null {
  const text = document.getText();

  try {
    const ast = parse(text, { file: document.uri });

    // Convert LSP 0-based position to parser 1-based
    const parserPos = toParserPosition(position);

    // Find identifier at cursor position
    const identifierName = findIdentifierAtPosition(ast, parserPos.line, parserPos.column);
    if (!identifierName) return null;

    // Find all occurrences (including declarations)
    const occurrences = findAllOccurrences(ast, identifierName, true);
    if (occurrences.length === 0) return null;

    // Create text edits for all occurrences
    const edits: TextEdit[] = occurrences.map(occ => ({
      range: createRange(occ.location, identifierName),
      newText: newName,
    }));

    return {
      changes: {
        [document.uri]: edits,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Prepare rename - validate that rename is possible at this position
 * Returns the range and placeholder text for the rename input box
 */
export function prepareRename(
  document: TextDocument,
  position: Position
): { range: Range; placeholder: string } | null {
  const text = document.getText();

  try {
    const ast = parse(text, { file: document.uri });

    // Convert LSP 0-based position to parser 1-based
    const parserPos = toParserPosition(position);

    // Find identifier at cursor position
    const identifierName = findIdentifierAtPosition(ast, parserPos.line, parserPos.column);
    if (!identifierName) return null;

    // Find all occurrences to locate the one at cursor
    const occurrences = findAllOccurrences(ast, identifierName, true);

    // Find the occurrence at the cursor position
    const cursorOcc = occurrences.find(occ => {
      const range = createRange(occ.location, identifierName);
      return (
        range.start.line === position.line &&
        position.character >= range.start.character &&
        position.character <= range.end.character
      );
    });

    if (!cursorOcc) return null;

    return {
      range: createRange(cursorOcc.location, identifierName),
      placeholder: identifierName,
    };
  } catch {
    return null;
  }
}
