import { Location, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '../../../src/parser/parse';
import { findIdentifierAtPosition } from '../utils/ast-utils';
import { findAllOccurrences } from '../utils/ast-walker';
import { toParserPosition, createRange } from '../utils/position';

/**
 * Find all references to the symbol at the cursor position
 */
export function provideReferences(
  document: TextDocument,
  position: Position,
  includeDeclaration: boolean
): Location[] {
  const text = document.getText();

  try {
    const ast = parse(text, { file: document.uri });

    // Convert LSP 0-based position to parser 1-based
    const parserPos = toParserPosition(position);

    // Find identifier at cursor position
    const identifierName = findIdentifierAtPosition(ast, parserPos.line, parserPos.column);
    if (!identifierName) return [];

    // Find all occurrences using the AST walker
    const occurrences = findAllOccurrences(ast, identifierName, includeDeclaration);

    // Convert to LSP locations
    return occurrences.map(occ => ({
      uri: document.uri,
      range: createRange(occ.location, identifierName),
    }));
  } catch {
    return [];
  }
}
