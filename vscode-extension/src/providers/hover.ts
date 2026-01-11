import { Hover, MarkupKind, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { parse } from '../../../src/parser/parse';
import { findNodeAtPosition, getNodeDescription, getTSImportForIdentifier } from '../utils/ast-utils';
import { tsService } from '../services/typescript-service';
import { keywordDocs, typeDocs, vibeValuePropertyDocs } from '../utils/builtins';

/**
 * Provide hover information for a position in the document
 */
export function provideHover(document: TextDocument, position: Position): Hover | null {
  const text = document.getText();
  const word = getWordAtPosition(text, position);

  if (!word) return null;

  // Check if it's a keyword
  if (keywordDocs[word]) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}** (keyword)\n\n${keywordDocs[word]}`,
      },
    };
  }

  // Check if it's a type
  if (typeDocs[word]) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}** (type)\n\n${typeDocs[word]}`,
      },
    };
  }

  // Check if it's a VibeValue property or method (after a dot)
  if (vibeValuePropertyDocs[word]) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: vibeValuePropertyDocs[word],
      },
    };
  }

  // Try to find the symbol in the AST
  try {
    const ast = parse(text, { file: document.uri });

    // Check if this identifier is from a TypeScript import
    const tsImport = getTSImportForIdentifier(ast, word);
    if (tsImport) {
      // Resolve the TypeScript file path
      const vibeFilePath = URI.parse(document.uri).fsPath;
      const tsFilePath = tsService.resolveImportPath(vibeFilePath, tsImport.sourcePath);

      if (tsFilePath) {
        // Get hover info from TypeScript service
        const tsHover = tsService.getHoverInfo(tsFilePath, tsImport.importedName);
        if (tsHover) {
          const lines: string[] = [];
          lines.push('```typescript');
          lines.push(tsHover.displayString);
          lines.push('```');
          if (tsHover.documentation) {
            lines.push('', tsHover.documentation);
          }
          lines.push('', `*Imported from \`${tsImport.sourcePath}\`*`);

          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: lines.join('\n'),
            },
          };
        }
      }
    }

    const nodeInfo = findNodeAtPosition(ast, position.line + 1, position.character + 1);

    if (nodeInfo) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: getNodeDescription(nodeInfo),
        },
      };
    }
  } catch {
    // Parse error - no hover
  }

  return null;
}

/**
 * Get the word at a given position in the document
 */
function getWordAtPosition(text: string, position: Position): string | null {
  const lines = text.split('\n');
  const line = lines[position.line];
  if (!line) return null;

  // Find word boundaries
  let start = position.character;
  let end = position.character;

  // Move start back to beginning of word
  while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) {
    start--;
  }

  // Move end forward to end of word
  while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) {
    end++;
  }

  if (start === end) return null;
  return line.slice(start, end);
}
