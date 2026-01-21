import { Definition, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { parse } from '@vibe-lang/runtime/parser/parse';
import { findIdentifierAtPosition, findDeclaration, getTSImportForIdentifier, getVibeImportForIdentifier } from '../utils/ast-utils';
import { tsService } from '../services/typescript-service';
import { toParserPosition, createLocation } from '../utils/position';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';

/**
 * Provide definition location for identifier at cursor position
 * Supports: functions, tools, models, variables, constants, parameters
 * Also supports imported TypeScript and Vibe symbols
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

    // Check if this identifier is from a Vibe import
    const vibeImport = getVibeImportForIdentifier(ast, identifierName);
    if (vibeImport) {
      const vibeFilePath = URI.parse(document.uri).fsPath;
      const sourceFilePath = resolve(dirname(vibeFilePath), vibeImport.sourcePath);

      if (existsSync(sourceFilePath)) {
        try {
          const sourceText = readFileSync(sourceFilePath, 'utf-8');
          const sourceAst = parse(sourceText, { file: sourceFilePath });

          // Find the exported declaration in the source file
          const exportedDecl = findExportedDeclaration(sourceAst, vibeImport.importedName);
          if (exportedDecl) {
            return {
              uri: URI.file(sourceFilePath).toString(),
              range: {
                start: {
                  line: exportedDecl.location.line - 1,  // Convert to 0-based
                  character: exportedDecl.location.column - 1,
                },
                end: {
                  line: exportedDecl.location.line - 1,
                  character: exportedDecl.location.column - 1 + exportedDecl.name.length,
                },
              },
            };
          }
        } catch {
          // Parse error in source file - fall through
        }
      }

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

/**
 * Find an exported declaration by name in a Vibe AST
 */
function findExportedDeclaration(
  ast: { body: Array<{ type: string; declaration?: { type: string; name?: string }; location: { line: number; column: number } }> },
  name: string
): { name: string; location: { line: number; column: number } } | null {
  for (const statement of ast.body) {
    if (statement.type === 'ExportDeclaration' && statement.declaration) {
      const decl = statement.declaration;
      if ('name' in decl && decl.name === name) {
        // Get the location of the name within the declaration
        // The export statement location points to 'export', we need the actual declaration
        const declLocation = (decl as { location?: { line: number; column: number } }).location;
        if (declLocation) {
          // Adjust column based on declaration type to point to the name
          let nameOffset = 0;
          if (decl.type === 'FunctionDeclaration') {
            nameOffset = 9; // "function " = 9 chars
          } else if (decl.type === 'ToolDeclaration') {
            nameOffset = 5; // "tool " = 5 chars
          } else if (decl.type === 'ModelDeclaration') {
            nameOffset = 6; // "model " = 6 chars
          } else if (decl.type === 'ConstDeclaration') {
            nameOffset = 6; // "const " = 6 chars
          } else if (decl.type === 'LetDeclaration') {
            nameOffset = 4; // "let " = 4 chars
          }

          return {
            name,
            location: {
              line: declLocation.line,
              column: declLocation.column + nameOffset,
            },
          };
        }
      }
    }
  }
  return null;
}
