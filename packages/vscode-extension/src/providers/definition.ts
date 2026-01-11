import { Definition, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { parse } from '@vibe-lang/runtime/parser/parse';
import { findIdentifierAtPosition, findDeclaration, getTSImportForIdentifier } from '../utils/ast-utils';
import { tsService } from '../services/typescript-service';
import { toParserPosition, createLocation } from '../utils/position';

/**
 * Provide definition location for identifier at cursor position
 * Supports: functions, tools, models, variables, constants, parameters
 * Also supports imported TypeScript symbols via TypeScript Language Service
 */
export function provideDefinition(
  document: TextDocument,
  position: Position
): Definition | null {
  const text = document.getText();

  try {
    const ast = parse(text, { file: document.uri });

    // Convert LSP 0-based position to parser 1-based
    const parserPos = toParserPosition(position);

    // Find identifier at cursor position
    const identifierName = findIdentifierAtPosition(ast, parserPos.line, parserPos.column);
    if (!identifierName) return null;

    // Check if this identifier is from a TypeScript import
    const tsImport = getTSImportForIdentifier(ast, identifierName);
    if (tsImport) {
      // Resolve the TypeScript file path
      const vibeFilePath = URI.parse(document.uri).fsPath;
      const tsFilePath = tsService.resolveImportPath(vibeFilePath, tsImport.sourcePath);

      if (tsFilePath) {
        // Get definition from TypeScript service
        const tsDef = tsService.getDefinition(tsFilePath, tsImport.importedName);
        if (tsDef) {
          return {
            uri: URI.file(tsDef.file).toString(),
            range: {
              start: { line: tsDef.line, character: tsDef.character },
              end: { line: tsDef.line, character: tsDef.character },
            },
          };
        }
      }

      // Fall back to the import statement location
      return null;
    }

    // Find declaration for this identifier in Vibe code
    const declaration = findDeclaration(ast, identifierName, parserPos.line, parserPos.column);
    if (!declaration) return null;

    // Convert parser 1-based location to LSP Location
    return createLocation(document.uri, declaration.location, declaration.name);
  } catch {
    // Parse error - no definition available
    return null;
  }
}
