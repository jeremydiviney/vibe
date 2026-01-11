import { Definition, Location, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '../../../src/parser/parse';
import { findIdentifierAtPosition, findDeclaration } from '../utils/ast-utils';

/**
 * Provide definition location for identifier at cursor position
 * Supports: functions, tools, models, variables, constants, parameters
 */
export function provideDefinition(
  document: TextDocument,
  position: Position
): Definition | null {
  const text = document.getText();

  try {
    const ast = parse(text, { file: document.uri });

    // Convert LSP 0-based position to parser 1-based
    const line = position.line + 1;
    const column = position.character + 1;

    // Find identifier at cursor position
    const identifierName = findIdentifierAtPosition(ast, line, column);
    if (!identifierName) return null;

    // Find declaration for this identifier
    const declaration = findDeclaration(ast, identifierName, line, column);
    if (!declaration) return null;

    // Convert parser 1-based location to LSP 0-based
    const location: Location = {
      uri: document.uri,
      range: {
        start: {
          line: declaration.location.line - 1,
          character: declaration.location.column - 1,
        },
        end: {
          line: declaration.location.line - 1,
          character: declaration.location.column - 1 + declaration.name.length,
        },
      },
    };

    return location;
  } catch {
    // Parse error - no definition available
    return null;
  }
}
