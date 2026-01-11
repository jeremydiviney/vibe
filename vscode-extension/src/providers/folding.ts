import { FoldingRange, FoldingRangeKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '../../../src/parser/parse';
import type * as AST from '../../../src/ast';

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
      addBlockRange(statement.body, ranges);
      for (const s of statement.body.body) {
        collectFoldingRanges(s, text, ranges);
      }
      break;

    case 'ToolDeclaration':
      addBlockRange(statement.body, ranges);
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

    case 'IfStatement':
      addBlockRange(statement.consequent, ranges);
      for (const s of statement.consequent.body) {
        collectFoldingRanges(s, text, ranges);
      }
      if (statement.alternate) {
        addBlockRange(statement.alternate, ranges);
        for (const s of statement.alternate.body) {
          collectFoldingRanges(s, text, ranges);
        }
      }
      break;

    case 'ForInStatement':
      addBlockRange(statement.body, ranges);
      for (const s of statement.body.body) {
        collectFoldingRanges(s, text, ranges);
      }
      break;

    case 'WhileStatement':
      addBlockRange(statement.body, ranges);
      for (const s of statement.body.body) {
        collectFoldingRanges(s, text, ranges);
      }
      break;
  }
}

function addBlockRange(block: AST.BlockStatement, ranges: FoldingRange[]): void {
  if (!block.location) return;

  // Block starts at opening brace, need to find closing brace
  // For now, use a simple heuristic: block spans from its location to last statement + 1
  const startLine = block.location.line - 1; // Convert to 0-based

  if (block.body.length > 0) {
    const lastStatement = block.body[block.body.length - 1];
    // Estimate end line - add 1 for the closing brace
    const endLine = lastStatement.location.line; // Already 0-based after -1 + 1 for brace

    if (endLine > startLine) {
      ranges.push({
        startLine,
        endLine,
        kind: FoldingRangeKind.Region,
      });
    }
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
        depth--;
        if (started && depth === 0) {
          return i;
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
