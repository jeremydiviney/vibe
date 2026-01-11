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
  null: 'Null value - represents absence of a value.\n\nCan be assigned to typed variables: `let x: text = null`\n\nCannot be used without a type: `let x = null` is an error.',
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

// VibeValue property documentation
const vibeValuePropertyDocs: Record<string, string> = {
  err: '**err** (VibeValue property)\n\n`VibeError | null`\n\nReturns the error if the operation failed, or `null` if successful.\n\n```vibe\nlet result = do "..." model default\nif result.err {\n  print("Error: " + result.err.message)\n}\n```\n\nVibeError has:\n- `message: text` - Error message\n- `type: text` - Error type (e.g., "TypeError", "ReferenceError")\n- `location` - Source location info',
  toolCalls: '**toolCalls** (VibeValue property)\n\n`ToolCallRecord[]`\n\nArray of tool calls made during AI execution. Empty for non-AI values.\n\n```vibe\nlet result = vibe "Do something" model default\nfor call in result.toolCalls {\n  print("Tool: " + call.toolName)\n  print("Duration: " + call.duration + "ms")\n}\n```\n\nEach ToolCallRecord has:\n- `toolName: text` - Name of the tool called\n- `args: json` - Arguments passed\n- `result` - Return value\n- `error: text | null` - Error if failed\n- `duration: number` - Execution time in ms',
  len: '**len()** (array/string method)\n\nReturns the length of an array or string.\n\n```vibe\nlet arr = [1, 2, 3]\nlet count = arr.len()  // 3\n\nlet str = "hello"\nlet length = str.len()  // 5\n```',
  push: '**push(item)** (array method)\n\nAdds an item to the end of an array. Returns the array for chaining.\n\n```vibe\nlet arr = [1, 2]\narr.push(3)  // arr is now [1, 2, 3]\n```',
  pop: '**pop()** (array method)\n\nRemoves and returns the last item from an array.\n\n```vibe\nlet arr = [1, 2, 3]\nlet last = arr.pop()  // last is 3, arr is [1, 2]\n```',
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
