import { FoldingRange, FoldingRangeKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '@vibe-lang/runtime/parser/parse';
import type * as AST from '@vibe-lang/runtime/ast';

/**
 * Provide folding ranges for code blocks
 */
export function provideFoldingRanges(document: TextDocument): FoldingRange[] {
  const text = document.getText();
  const ranges: FoldingRange[] = [];

  try {
    const ast = parse(text, { file: document.uri });

    for (const statement of ast.body) {
      collectFoldingRanges(statement, text, ranges);
    }
  } catch {
    // Parse error - fall back to brace matching
    collectBraceFoldingRanges(text, ranges);
  }

  // Also add comment folding
  collectCommentFoldingRanges(text, ranges);

  return ranges;
}

function collectFoldingRanges(
  statement: AST.Statement,
  text: string,
  ranges: FoldingRange[]
): void {
  switch (statement.type) {
    case 'FunctionDeclaration':
      addBlockRange(statement.body, ranges, text);
      for (const s of statement.body.body) {
        collectFoldingRanges(s, text, ranges);
      }
      break;

    case 'ToolDeclaration':
      addBlockRange(statement.body, ranges, text);
      for (const s of statement.body.body) {
        collectFoldingRanges(s, text, ranges);
      }
      break;

    case 'ModelDeclaration':
      // Model configs are single-line object literals, could fold if multi-line
      if (statement.location) {
        const endLine = findClosingBrace(text, statement.location.line - 1);
        if (endLine > statement.location.line - 1) {
          ranges.push({
            startLine: statement.location.line - 1,
            endLine,
            kind: FoldingRangeKind.Region,
          });
        }
      }
      break;

    case 'LetDeclaration':
    case 'ConstDeclaration':
      // Handle JSON objects and arrays as initializers
      if (statement.initializer) {
        collectExpressionFoldingRanges(statement.initializer, text, ranges);
      }
      break;

    case 'ExportDeclaration':
      // Handle exported declarations - delegate to the inner declaration
      collectFoldingRanges(statement.declaration, text, ranges);
      break;

    case 'IfStatement':
      addBlockRange(statement.consequent, ranges, text);
      for (const s of statement.consequent.body) {
        collectFoldingRanges(s, text, ranges);
      }
      if (statement.alternate) {
        addBlockRange(statement.alternate, ranges, text);
        for (const s of statement.alternate.body) {
          collectFoldingRanges(s, text, ranges);
        }
      }
      break;

    case 'ForInStatement':
      addBlockRange(statement.body, ranges, text);
      for (const s of statement.body.body) {
        collectFoldingRanges(s, text, ranges);
      }
      break;

    case 'WhileStatement':
      addBlockRange(statement.body, ranges, text);
      for (const s of statement.body.body) {
        collectFoldingRanges(s, text, ranges);
      }
      break;
  }
}

/**
 * Collect folding ranges from expressions (JSON objects, arrays, etc.)
 */
function collectExpressionFoldingRanges(
  expr: AST.Expression,
  text: string,
  ranges: FoldingRange[]
): void {
  switch (expr.type) {
    case 'ObjectLiteral':
      if (expr.location) {
        const startLine = expr.location.line - 1; // Convert to 0-based
        const endLine = findClosingBrace(text, startLine);
        if (endLine > startLine) {
          ranges.push({
            startLine,
            endLine,
            kind: FoldingRangeKind.Region,
          });
        }
        // Recurse into nested objects
        for (const prop of expr.properties) {
          collectExpressionFoldingRanges(prop.value, text, ranges);
        }
      }
      break;

    case 'ArrayLiteral':
      if (expr.location) {
        const startLine = expr.location.line - 1;
        const endLine = findClosingBracket(text, startLine);
        if (endLine > startLine) {
          ranges.push({
            startLine,
            endLine,
            kind: FoldingRangeKind.Region,
          });
        }
        // Recurse into nested elements
        for (const elem of expr.elements) {
          collectExpressionFoldingRanges(elem, text, ranges);
        }
      }
      break;
  }
}

function findClosingBracket(text: string, startLine: number): number {
  const lines = text.split('\n');
  let depth = 0;
  let started = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '[') {
        depth++;
        started = true;
      } else if (char === ']') {
        depth--;
        if (started && depth === 0) {
          return i;
        }
      }
    }
  }

  return startLine;
}

function addBlockRange(block: AST.BlockStatement, ranges: FoldingRange[], text: string): void {
  if (!block.location) return;

  const startLine = block.location.line - 1; // Convert to 0-based
  // Find the actual closing brace instead of estimating
  const endLine = findClosingBrace(text, startLine);

  if (endLine > startLine) {
    ranges.push({
      startLine,
      endLine,
      kind: FoldingRangeKind.Region,
    });
  }
}

function findClosingBrace(text: string, startLine: number): number {
  const lines = text.split('\n');
  let depth = 0;
  let started = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '{') {
        depth++;
        started = true;
      } else if (char === '}') {
        // Only decrement if we've started (seen at least one {)
        // This handles cases like "} else {" where we start on a line with }
        if (started) {
          depth--;
          if (depth === 0) {
            return i;
          }
        }
      }
    }
  }

  return startLine;
}

/**
 * Fallback: fold based on brace matching when AST parsing fails
 */
function collectBraceFoldingRanges(text: string, ranges: FoldingRange[]): void {
  const lines = text.split('\n');
  const stack: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '{') {
        stack.push(i);
      } else if (char === '}') {
        const startLine = stack.pop();
        if (startLine !== undefined && i > startLine) {
          ranges.push({
            startLine,
            endLine: i,
            kind: FoldingRangeKind.Region,
          });
        }
      }
    }
  }
}

/**
 * Fold consecutive comment lines
 */
function collectCommentFoldingRanges(text: string, ranges: FoldingRange[]): void {
  const lines = text.split('\n');
  let commentStart: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const isComment = trimmed.startsWith('//');

    if (isComment) {
      if (commentStart === null) {
        commentStart = i;
      }
    } else {
      if (commentStart !== null && i - commentStart > 1) {
        // Multiple consecutive comment lines
        ranges.push({
          startLine: commentStart,
          endLine: i - 1,
          kind: FoldingRangeKind.Comment,
        });
      }
      commentStart = null;
    }
  }

  // Handle comments at end of file
  if (commentStart !== null && lines.length - commentStart > 1) {
    ranges.push({
      startLine: commentStart,
      endLine: lines.length - 1,
      kind: FoldingRangeKind.Comment,
    });
  }

  // Also handle block comments /* */
  let blockStart: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('/*') && !line.includes('*/')) {
      blockStart = i;
    } else if (blockStart !== null && line.includes('*/')) {
      if (i > blockStart) {
        ranges.push({
          startLine: blockStart,
          endLine: i,
          kind: FoldingRangeKind.Comment,
        });
      }
      blockStart = null;
    }
  }
}
