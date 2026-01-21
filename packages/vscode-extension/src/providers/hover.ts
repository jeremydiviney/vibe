import { Hover, MarkupKind, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { parse } from '@vibe-lang/runtime/parser/parse';
import { findNodeAtPosition, getNodeDescription, getTSImportForIdentifier, findDeclaration, DeclarationInfo } from '../utils/ast-utils';
import { tsService } from '../services/typescript-service';
import { keywordDocs, typeDocs, vibeValuePropertyDocs } from '../utils/builtins';
import type * as AST from '@vibe-lang/runtime/ast';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';

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
      const typeLabels = { expansion: 'expansion', reference: 'reference', template: 'template' };
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${interpolatedVar.name}** (${typeLabels[interpolatedVar.type]} interpolation)\n\n*Variable not found in scope*`,
        },
      };
    } catch {
      // Parse error - continue with normal hover
    }
  }

  const word = getWordAtPosition(text, position);

  if (!word) return null;

  // Don't show keyword/type hover if we're inside a string literal
  const inString = isInsideStringLiteral(text, position);

  // Check if it's a keyword (but not inside a string)
  if (!inString && keywordDocs[word]) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}** (keyword)\n\n${keywordDocs[word]}`,
      },
    };
  }

  // Check if it's a type (but not inside a string)
  if (!inString && typeDocs[word]) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}** (type)\n\n${typeDocs[word]}`,
      },
    };
  }

  // Check if it's a VibeValue property or method (after a dot) - but not inside a string
  if (!inString && vibeValuePropertyDocs[word]) {
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

    // If not at a declaration, try to find the declaration of this identifier (variable reference)
    const declaration = findDeclaration(ast, word, position.line + 1, position.character + 1);
    if (declaration) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: formatDeclarationHover(declaration, document.uri),
        },
      };
    }
  } catch {
    // Parse error - no hover
  }

  return null;
}

/**
 * Format hover content for a declaration (used for variable references)
 */
function formatDeclarationHover(declaration: DeclarationInfo, documentUri?: string): string {
  const lines: string[] = [];

  switch (declaration.kind) {
    case 'variable': {
      const letDecl = declaration.node as AST.LetDeclaration;
      lines.push(`**${letDecl.name}** (variable)`);
      if (letDecl.typeAnnotation) {
        lines.push(`\nType: \`${letDecl.typeAnnotation}\``);
      }
      break;
    }
    case 'constant': {
      const constDecl = declaration.node as AST.ConstDeclaration;
      lines.push(`**${constDecl.name}** (constant)`);
      if (constDecl.typeAnnotation) {
        lines.push(`\nType: \`${constDecl.typeAnnotation}\``);
      }
      break;
    }
    case 'parameter': {
      // Node is the parent function/tool declaration
      const parentDecl = declaration.node as AST.FunctionDeclaration | AST.ToolDeclaration;
      const param = parentDecl.params.find(p => p.name === declaration.name);
      if (param) {
        const paramType = 'typeAnnotation' in param ? param.typeAnnotation : '';
        lines.push(`**${param.name}** (parameter)`);
        if (paramType) {
          lines.push(`\nType: \`${paramType}\``);
        }
      } else {
        lines.push(`**${declaration.name}** (parameter)`);
      }
      break;
    }
    case 'destructured': {
      const destDecl = declaration.node as AST.DestructuringDeclaration;
      const field = destDecl.fields.find(f => f.name === declaration.name);
      const keyword = destDecl.isConst ? 'constant' : 'variable';
      lines.push(`**${declaration.name}** (${keyword}, destructured)`);
      if (field?.type) {
        lines.push(`\nType: \`${field.type}\``);
      }
      break;
    }
    case 'function': {
      const funcDecl = declaration.node as AST.FunctionDeclaration;
      const params = funcDecl.params.map(p => `${p.name}: ${p.typeAnnotation}`).join(', ');
      const returnType = funcDecl.returnType ? `: ${funcDecl.returnType}` : '';
      lines.push(`**${funcDecl.name}** (function)`);
      lines.push(`\n\`function(${params})${returnType}\``);
      break;
    }
    case 'tool': {
      const toolDecl = declaration.node as AST.ToolDeclaration;
      const params = toolDecl.params.map(p => `${p.name}: ${p.typeAnnotation}`).join(', ');
      const returnType = toolDecl.returnType ? `: ${toolDecl.returnType}` : '';
      lines.push(`**${toolDecl.name}** (tool)`);
      lines.push(`\n\`tool(${params})${returnType}\``);
      if (toolDecl.description) {
        lines.push('', toolDecl.description);
      }
      break;
    }
    case 'model':
      lines.push(`**${declaration.name}** (model)`);
      lines.push('\nAI model configuration');
      break;
    case 'import': {
      // Try to resolve the actual declaration from the source file
      const resolvedDecl = resolveImportedDeclaration(declaration, documentUri);
      if (resolvedDecl) {
        // Create a pseudo-DeclarationInfo to reuse formatting logic
        const resolvedInfo = createDeclarationInfoFromNode(resolvedDecl, declaration.name);
        if (resolvedInfo) {
          lines.push(formatDeclarationHover(resolvedInfo));
          lines.push(`\n*Imported from \`${declaration.importSource}\`*`);
          break;
        }
      }
      // Fallback if we can't resolve
      const sourceType = declaration.importSourceType === 'ts' ? 'TypeScript' : 'Vibe';
      lines.push(`**${declaration.name}** (imported)`);
      lines.push(`\n*Imported from \`${declaration.importSource}\`*`);
      lines.push(`\n*Source type: ${sourceType}*`);
      break;
    }
    default:
      lines.push(`**${declaration.name}** (${declaration.kind})`);
  }

  return lines.join('\n');
}

/**
 * Check if the cursor is inside a string literal (not including interpolations)
 */
function isInsideStringLiteral(text: string, position: Position): boolean {
  const lines = text.split('\n');
  const line = lines[position.line];
  if (!line) return false;

  const col = position.character;

  // Track which quotes are open
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

  return inDoubleQuote || inSingleQuote || inBacktick;
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
  type: 'reference' | 'expansion' | 'template';  // {var} vs !{var} vs ${var}
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

  // Handle different string types
  if (inBacktick) {
    // Backticks use ${var} syntax
    return findTemplateInterpolation(line, col);
  } else if (inDoubleQuote || inSingleQuote) {
    // Double/single quotes use {var} and !{var} syntax
    return findStringInterpolation(line, col);
  }

  return null;
}

/**
 * Find ${var} interpolation in backtick template strings
 */
function findTemplateInterpolation(line: string, col: number): InterpolatedVariableInfo | null {
  // Search backwards for ${
  let openPos = -1;

  for (let i = col; i >= 1; i--) {
    if (line[i] === '{' && line[i - 1] === '$') {
      openPos = i;
      break;
    }
    // Stop if we hit a closing brace before finding ${
    if (line[i] === '}') break;
  }

  if (openPos === -1) return null;

  // Search forwards for closing brace
  let closePos = -1;
  for (let i = openPos + 1; i < line.length; i++) {
    if (line[i] === '}') {
      closePos = i;
      break;
    }
    // Stop if we hit another ${
    if (line[i] === '{' && i > 0 && line[i - 1] === '$') break;
  }

  if (closePos === -1) return null;

  // Check if cursor is within the interpolation (including ${ and })
  const startPos = openPos - 1; // Include the $
  if (col < startPos || col > closePos) return null;

  // Extract the content - for simple variables only
  const content = line.slice(openPos + 1, closePos).trim();

  // Only handle simple variable references, not complex expressions
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(content)) return null;

  return {
    name: content,
    type: 'template',
  };
}

/**
 * Find {var} or !{var} interpolation in double/single quoted strings
 */
function findStringInterpolation(line: string, col: number): InterpolatedVariableInfo | null {
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
  declaration: DeclarationInfo
): string {
  const lines: string[] = [];

  // Header with variable name and interpolation type
  const interpTypeMap = { expansion: '!{...}', reference: '{...}', template: '${...}' };
  const interpType = interpTypeMap[interpolatedVar.type];
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
      // Node is the parent function/tool declaration - find the parameter type
      const parentDecl = declaration.node as AST.FunctionDeclaration | AST.ToolDeclaration;
      const param = parentDecl.params.find(p => p.name === interpolatedVar.name);
      if (param) {
        const paramType = 'typeAnnotation' in param ? param.typeAnnotation : '';
        lines.push(`\n\`(parameter) ${param.name}: ${paramType}\``);
      } else {
        lines.push(`\n*Function parameter*`);
      }
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
    case 'import':
      lines.push(`\n*Imported from \`${declaration.importSource}\`*`);
      break;
    default:
      lines.push(`\n*${declaration.kind}*`);
  }

  // Add interpolation explanation
  lines.push('');
  if (interpolatedVar.type === 'expansion') {
    lines.push('*Expansion: value is expanded into the prompt for AI context*');
  } else if (interpolatedVar.type === 'template') {
    lines.push('*Template: JavaScript-style interpolation in backtick strings*');
  } else {
    lines.push('*Reference: value is inserted as a string*');
  }

  return lines.join('\n');
}

// Cache for resolved source files to avoid repeated parsing
const sourceFileCache = new Map<string, AST.Program | null>();

/**
 * Resolve an imported declaration by reading and parsing the source file
 */
function resolveImportedDeclaration(declaration: DeclarationInfo, documentUri?: string): AST.Statement | null {
  if (!declaration.importSource || declaration.importSourceType !== 'vibe' || !documentUri) {
    return null;
  }

  // Get the ImportDeclaration node to find the original imported name
  const importDecl = declaration.node as AST.ImportDeclaration;
  const specifier = importDecl.specifiers.find(s => s.local === declaration.name);
  const importedName = specifier?.imported ?? declaration.name;

  try {
    // Resolve the source file path relative to the current document
    const currentFilePath = URI.parse(documentUri).fsPath;
    const currentDir = dirname(currentFilePath);
    const absoluteSourcePath = resolve(currentDir, declaration.importSource);

    // Check cache first
    if (sourceFileCache.has(absoluteSourcePath)) {
      const cachedAst = sourceFileCache.get(absoluteSourcePath);
      if (cachedAst) {
        return findExportedDeclaration(cachedAst, importedName);
      }
      return null;
    }

    // Read and parse the source file
    if (!existsSync(absoluteSourcePath)) {
      sourceFileCache.set(absoluteSourcePath, null);
      return null;
    }

    const sourceContent = readFileSync(absoluteSourcePath, 'utf-8');
    const sourceAst = parse(sourceContent, { file: absoluteSourcePath });

    // Cache the parsed AST
    sourceFileCache.set(absoluteSourcePath, sourceAst);

    return findExportedDeclaration(sourceAst, importedName);
  } catch {
    return null;
  }
}

/**
 * Find an exported declaration by name in an AST
 */
function findExportedDeclaration(ast: AST.Program, name: string): AST.Statement | null {
  for (const statement of ast.body) {
    if (statement.type === 'ExportDeclaration') {
      const decl = statement.declaration;
      if ('name' in decl && decl.name === name) {
        return decl;
      }
    }
  }
  return null;
}

/**
 * Create a DeclarationInfo from an AST node (for reusing formatDeclarationHover)
 */
function createDeclarationInfoFromNode(node: AST.Statement, name: string): DeclarationInfo | null {
  const kindMap: Record<string, DeclarationInfo['kind']> = {
    'FunctionDeclaration': 'function',
    'LetDeclaration': 'variable',
    'ConstDeclaration': 'constant',
    'ModelDeclaration': 'model',
    'ToolDeclaration': 'tool',
  };
  const kind = kindMap[node.type];
  if (!kind) return null;

  return {
    name,
    kind,
    location: node.location,
    node,
  };
}
