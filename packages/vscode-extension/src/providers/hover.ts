import { Hover, MarkupKind, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { parse } from '@vibe-lang/runtime/parser/parse';
import { findNodeAtPosition, getNodeDescription, getTSImportForIdentifier, findDeclaration } from '../utils/ast-utils';
import { tsService } from '../services/typescript-service';
import { keywordDocs, typeDocs, vibeValuePropertyDocs } from '../utils/builtins';
import type * as AST from '@vibe-lang/runtime/ast';

/**
 * Provide hover information for a position in the document
 */
export function provideHover(document: TextDocument, position: Position): Hover | null {
  const text = document.getText();

  // Check for interpolated variable in string first
  const interpolatedVar = getInterpolatedVariableAtPosition(text, position);
  if (interpolatedVar) {
    try {
      const ast = parse(text, { file: document.uri });
      const declaration = findDeclaration(ast, interpolatedVar.name, position.line + 1, position.character + 1);

      if (declaration) {
        const hoverContent = formatInterpolatedVariableHover(interpolatedVar, declaration);
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: hoverContent,
          },
        };
      }

      // Variable not found but we're in interpolation - show basic info
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${interpolatedVar.name}** (${interpolatedVar.type === 'expansion' ? 'expansion' : 'reference'} interpolation)\n\n*Variable not found in scope*`,
        },
      };
    } catch {
      // Parse error - continue with normal hover
    }
  }

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

/**
 * Information about an interpolated variable in a string
 */
interface InterpolatedVariableInfo {
  name: string;
  type: 'reference' | 'expansion';  // {var} vs !{var}
}

/**
 * Check if the cursor is on an interpolated variable inside a string
 * Returns the variable name and type if found
 */
function getInterpolatedVariableAtPosition(text: string, position: Position): InterpolatedVariableInfo | null {
  const lines = text.split('\n');
  const line = lines[position.line];
  if (!line) return null;

  const col = position.character;

  // Check if we're inside a string by finding quote characters
  // We need to track which quotes are open
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let inBacktick = false;

  for (let i = 0; i < col; i++) {
    const char = line[i];
    const prevChar = i > 0 ? line[i - 1] : '';

    // Skip escaped characters
    if (prevChar === '\\') continue;

    if (char === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '`' && !inDoubleQuote && !inSingleQuote) {
      inBacktick = !inBacktick;
    }
  }

  // Only check for {var} and !{var} in double/single quoted strings
  // Backticks use ${var} which is handled differently
  if (!inDoubleQuote && !inSingleQuote) return null;

  // Look for interpolation patterns around the cursor position
  // Pattern: !{varName} or {varName}

  // Search backwards for the opening brace
  let openBracePos = -1;
  let isExpansion = false;

  for (let i = col; i >= 0; i--) {
    if (line[i] === '{') {
      // Check if this is an expansion (!{) or reference ({)
      if (i > 0 && line[i - 1] === '!') {
        openBracePos = i;
        isExpansion = true;
      } else {
        openBracePos = i;
        isExpansion = false;
      }
      break;
    }
    // Stop if we hit a closing brace before an opening one
    if (line[i] === '}') break;
  }

  if (openBracePos === -1) return null;

  // Search forwards for the closing brace
  let closeBracePos = -1;
  for (let i = openBracePos + 1; i < line.length; i++) {
    if (line[i] === '}') {
      closeBracePos = i;
      break;
    }
    // Stop if we hit another opening brace
    if (line[i] === '{') break;
  }

  if (closeBracePos === -1) return null;

  // Check if cursor is within the interpolation (including braces)
  const startPos = isExpansion ? openBracePos - 1 : openBracePos;
  if (col < startPos || col > closeBracePos) return null;

  // Extract the variable name
  const varName = line.slice(openBracePos + 1, closeBracePos).trim();

  // Validate it's a valid identifier
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) return null;

  return {
    name: varName,
    type: isExpansion ? 'expansion' : 'reference',
  };
}

/**
 * Format hover content for an interpolated variable
 */
function formatInterpolatedVariableHover(
  interpolatedVar: InterpolatedVariableInfo,
  declaration: { kind: string; name: string; node: AST.Node }
): string {
  const lines: string[] = [];

  // Header with variable name and interpolation type
  const interpType = interpolatedVar.type === 'expansion' ? '!{...}' : '{...}';
  lines.push(`**${interpolatedVar.name}** (${interpType} interpolation)`);

  // Add declaration info
  switch (declaration.kind) {
    case 'variable': {
      const letDecl = declaration.node as AST.LetDeclaration;
      lines.push(`\n\`let ${letDecl.name}${letDecl.typeAnnotation ? `: ${letDecl.typeAnnotation}` : ''}\``);
      break;
    }
    case 'constant': {
      const constDecl = declaration.node as AST.ConstDeclaration;
      lines.push(`\n\`const ${constDecl.name}${constDecl.typeAnnotation ? `: ${constDecl.typeAnnotation}` : ''}\``);
      break;
    }
    case 'parameter': {
      lines.push(`\n*Function parameter*`);
      break;
    }
    case 'destructured': {
      const destDecl = declaration.node as AST.DestructuringDeclaration;
      const field = destDecl.fields.find(f => f.name === interpolatedVar.name);
      if (field) {
        const keyword = destDecl.isConst ? 'const' : 'let';
        lines.push(`\n\`${keyword} {${field.name}: ${field.type}}\``);
      }
      break;
    }
    case 'function':
      lines.push(`\n*Function reference*`);
      break;
    case 'model':
      lines.push(`\n*Model configuration*`);
      break;
    default:
      lines.push(`\n*${declaration.kind}*`);
  }

  // Add interpolation explanation
  lines.push('');
  if (interpolatedVar.type === 'expansion') {
    lines.push('*Expansion: value is expanded into the prompt for AI context*');
  } else {
    lines.push('*Reference: value is inserted as a string*');
  }

  return lines.join('\n');
}
