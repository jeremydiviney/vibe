import { Hover, MarkupKind, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '../../../src/parser/parse';
import { findNodeAtPosition, getNodeDescription } from '../utils/ast-utils';

// Keyword documentation
const keywordDocs: Record<string, string> = {
  vibe: 'AI expression - sends a prompt to an AI model with multi-turn tool calling.\n\nSyntax: `vibe <prompt> <model> <context>`',
  do: 'AI expression - single-round AI call (executes tools once, no loop back).\n\nSyntax: `do <prompt> <model> <context>`',
  let: 'Declare a mutable variable.\n\nSyntax: `let name: type = value`\n\nDestructuring: `let {name: text, age: number} = do "..." model`',
  const: 'Declare an immutable constant.\n\nSyntax: `const name: type = value`\n\nDestructuring: `const {name: text, age: number} = do "..." model`',
  function: 'Define a function.\n\nSyntax: `function name(params): returnType { body }`',
  tool: 'Define an AI-callable tool.\n\nSyntax: `tool name(params): returnType @description "..." { body }`',
  model: 'Define an AI model configuration.\n\nSyntax: `model name = { provider: "...", modelName: "..." }`',
  if: 'Conditional statement.\n\nSyntax: `if condition { body } else { body }`',
  for: 'For-in loop over arrays or ranges.\n\nSyntax: `for item in collection { body }`',
  while: 'While loop with condition.\n\nSyntax: `while condition { body }`',
  return: 'Return a value from a function.\n\nSyntax: `return expression`',
  import: 'Import from another module.\n\nSyntax: `import { name } from "path"`',
  export: 'Export a declaration.\n\nSyntax: `export function|let|const|model ...`',
  forget: 'Context mode: discard context from block on exit.',
  verbose: 'Context mode: keep full history (default).',
  compress: 'Context mode: AI summarizes context on exit.\n\nSyntax: `compress` or `compress("prompt")`',
  default: 'Use the default (global) context for AI calls.',
  local: 'Use local context for AI calls.',
  and: 'Logical AND operator.',
  or: 'Logical OR operator.',
  not: 'Logical NOT operator.',
  true: 'Boolean literal `true`.',
  false: 'Boolean literal `false`.',
  in: 'Used in for-in loops: `for item in collection`',
};

// Type documentation
const typeDocs: Record<string, string> = {
  text: 'String type - text data.',
  json: 'JSON object type - structured data.',
  prompt: 'Prompt type - AI prompt text.',
  boolean: 'Boolean type - true or false.',
  number: 'Number type - numeric values.',
};

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

  // Try to find the symbol in the AST
  try {
    const ast = parse(text, { file: document.uri });
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
