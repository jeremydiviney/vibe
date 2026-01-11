import { TextEdit, Range, FormattingOptions } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Format a document with consistent style
 * Uses LSP FormattingOptions for indent configuration
 */
export function provideDocumentFormatting(
  document: TextDocument,
  options: FormattingOptions
): TextEdit[] {
  const text = document.getText();
  const indentStr = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';

  const formatted = formatDocument(text, indentStr);

  // Return single edit replacing entire document
  const lastLine = document.lineCount - 1;
  const lastChar = document.getText().length;

  return [
    {
      range: Range.create(0, 0, lastLine, lastChar),
      newText: formatted,
    },
  ];
}

function formatDocument(text: string, indentStr: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let indentLevel = 0;
  let inMultiLineString = false;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Track block comments
    if (!inMultiLineString) {
      if (line.includes('/*') && !line.includes('*/')) {
        inBlockComment = true;
      }
      if (line.includes('*/')) {
        inBlockComment = false;
      }
    }

    // Track multi-line template strings
    const backtickCount = (line.match(/`/g) || []).length;
    if (backtickCount % 2 === 1) {
      inMultiLineString = !inMultiLineString;
    }

    // Don't format inside multi-line strings or block comments
    if (inMultiLineString || inBlockComment) {
      result.push(line);
      continue;
    }

    // Trim the line
    line = line.trim();

    // Skip empty lines (preserve them)
    if (line === '') {
      result.push('');
      continue;
    }

    // Decrease indent before closing braces
    if (line.startsWith('}') || line.startsWith(']')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    // Format the line
    const formattedLine = formatLine(line);

    // Apply indentation
    const indentedLine = indentStr.repeat(indentLevel) + formattedLine;
    result.push(indentedLine);

    // Increase indent after opening braces (that aren't closed on same line)
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    const openBrackets = (line.match(/\[/g) || []).length;
    const closeBrackets = (line.match(/\]/g) || []).length;

    indentLevel += openBraces - closeBraces;
    indentLevel += openBrackets - closeBrackets;
    indentLevel = Math.max(0, indentLevel);
  }

  // Ensure file ends with newline
  let formatted = result.join('\n');
  if (!formatted.endsWith('\n')) {
    formatted += '\n';
  }

  return formatted;
}

function formatLine(line: string): string {
  // Don't format comment lines
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return line.trim();
  }

  // Preserve strings by temporarily replacing them
  const strings: string[] = [];
  let processed = line.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, (match) => {
    strings.push(match);
    return `__STRING_${strings.length - 1}__`;
  });

  // Preserve inline comments
  const commentMatch = processed.match(/\/\/.*/);
  let inlineComment = '';
  if (commentMatch) {
    inlineComment = commentMatch[0];
    processed = processed.replace(/\/\/.*/, '__COMMENT__');
  }

  // Normalize spacing around operators
  // Assignment and comparison
  processed = processed.replace(/\s*=\s*/g, ' = ');
  processed = processed.replace(/\s*==\s*/g, ' == ');
  processed = processed.replace(/\s*!=\s*/g, ' != ');
  processed = processed.replace(/\s*<=\s*/g, ' <= ');
  processed = processed.replace(/\s*>=\s*/g, ' >= ');
  processed = processed.replace(/\s*<\s*/g, ' < ');
  processed = processed.replace(/\s*>\s*/g, ' > ');

  // Fix double spacing from < and > replacements affecting <= and >=
  processed = processed.replace(/ < = /g, ' <= ');
  processed = processed.replace(/ > = /g, ' >= ');
  processed = processed.replace(/ = = /g, ' == ');
  processed = processed.replace(/ ! = /g, ' != ');

  // Arithmetic operators
  processed = processed.replace(/\s*\+\s*/g, ' + ');
  processed = processed.replace(/\s*-\s*/g, ' - ');
  processed = processed.replace(/\s*\*\s*/g, ' * ');
  processed = processed.replace(/\s*\/\s*/g, ' / ');
  processed = processed.replace(/\s*%\s*/g, ' % ');

  // Logical operators
  processed = processed.replace(/\s+and\s+/g, ' and ');
  processed = processed.replace(/\s+or\s+/g, ' or ');

  // Colon in type annotations (no space before, space after)
  processed = processed.replace(/\s*:\s*/g, ': ');

  // Fix function/tool return type (space before colon for return type)
  processed = processed.replace(/\)\s*:\s*/g, '): ');

  // Comma spacing (no space before, space after)
  processed = processed.replace(/\s*,\s*/g, ', ');

  // Opening brace (space before)
  processed = processed.replace(/\s*\{\s*/g, ' { ');
  processed = processed.replace(/\{ \}/g, '{}'); // Empty braces

  // Fix brace at end of line (no trailing space)
  processed = processed.replace(/\{ $/g, '{');

  // Parentheses (no space inside)
  processed = processed.replace(/\(\s+/g, '(');
  processed = processed.replace(/\s+\)/g, ')');

  // Brackets (no space inside)
  processed = processed.replace(/\[\s+/g, '[');
  processed = processed.replace(/\s+\]/g, ']');

  // Fix negative numbers (no space after minus when at start or after operator/paren)
  processed = processed.replace(/(\(|,\s*|=\s*)\s*-\s+(\d)/g, '$1-$2');

  // Fix range operator (..)
  processed = processed.replace(/\s*\.\.\s*/g, '..');

  // Clean up multiple spaces
  processed = processed.replace(/  +/g, ' ');

  // Restore strings
  processed = processed.replace(/__STRING_(\d+)__/g, (_, index) => strings[parseInt(index)]);

  // Restore inline comment
  if (inlineComment) {
    processed = processed.replace('__COMMENT__', inlineComment);
  }

  return processed.trim();
}
