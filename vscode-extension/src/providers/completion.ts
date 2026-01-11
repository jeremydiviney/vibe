import {
  CompletionItem,
  CompletionItemKind,
  Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Keywords with their completion details
const keywords: Array<{ label: string; detail: string; kind: CompletionItemKind }> = [
  { label: 'let', detail: 'Declare a variable', kind: CompletionItemKind.Keyword },
  { label: 'const', detail: 'Declare a constant', kind: CompletionItemKind.Keyword },
  { label: 'function', detail: 'Define a function', kind: CompletionItemKind.Keyword },
  { label: 'tool', detail: 'Define an AI-callable tool', kind: CompletionItemKind.Keyword },
  { label: 'model', detail: 'Define an AI model', kind: CompletionItemKind.Keyword },
  { label: 'vibe', detail: 'AI expression (multi-turn)', kind: CompletionItemKind.Keyword },
  { label: 'do', detail: 'AI expression (single-round)', kind: CompletionItemKind.Keyword },
  { label: 'if', detail: 'Conditional statement', kind: CompletionItemKind.Keyword },
  { label: 'else', detail: 'Else branch', kind: CompletionItemKind.Keyword },
  { label: 'for', detail: 'For-in loop', kind: CompletionItemKind.Keyword },
  { label: 'while', detail: 'While loop', kind: CompletionItemKind.Keyword },
  { label: 'return', detail: 'Return from function', kind: CompletionItemKind.Keyword },
  { label: 'import', detail: 'Import from module', kind: CompletionItemKind.Keyword },
  { label: 'export', detail: 'Export declaration', kind: CompletionItemKind.Keyword },
  { label: 'from', detail: 'Import source', kind: CompletionItemKind.Keyword },
  { label: 'in', detail: 'For-in operator', kind: CompletionItemKind.Keyword },
  { label: 'and', detail: 'Logical AND', kind: CompletionItemKind.Operator },
  { label: 'or', detail: 'Logical OR', kind: CompletionItemKind.Operator },
  { label: 'not', detail: 'Logical NOT', kind: CompletionItemKind.Operator },
  { label: 'true', detail: 'Boolean true', kind: CompletionItemKind.Constant },
  { label: 'false', detail: 'Boolean false', kind: CompletionItemKind.Constant },
  { label: 'default', detail: 'Default context', kind: CompletionItemKind.Keyword },
  { label: 'local', detail: 'Local context', kind: CompletionItemKind.Keyword },
  { label: 'forget', detail: 'Context mode: discard', kind: CompletionItemKind.Keyword },
  { label: 'verbose', detail: 'Context mode: keep all', kind: CompletionItemKind.Keyword },
  { label: 'compress', detail: 'Context mode: summarize', kind: CompletionItemKind.Keyword },
];

// Types
const types: Array<{ label: string; detail: string }> = [
  { label: 'text', detail: 'String type' },
  { label: 'json', detail: 'JSON object type' },
  { label: 'prompt', detail: 'Prompt type' },
  { label: 'boolean', detail: 'Boolean type' },
  { label: 'number', detail: 'Number type' },
];

// Built-in tools
const builtinTools: Array<{ label: string; detail: string; documentation: string }> = [
  { label: 'sleep', detail: 'sleep(ms: number)', documentation: 'Pause execution for specified milliseconds' },
  { label: 'now', detail: 'now()', documentation: 'Get current timestamp in milliseconds' },
  { label: 'jsonParse', detail: 'jsonParse(text: text)', documentation: 'Parse JSON string to object' },
  { label: 'jsonStringify', detail: 'jsonStringify(value: json)', documentation: 'Convert object to JSON string' },
  { label: 'env', detail: 'env(name: text)', documentation: 'Get environment variable' },
  { label: 'print', detail: 'print(message: text)', documentation: 'Print message to console' },
  { label: 'read', detail: 'read(path: text)', documentation: 'Read file contents' },
  { label: 'write', detail: 'write(path: text, content: text)', documentation: 'Write content to file' },
  { label: 'exec', detail: 'exec(command: text)', documentation: 'Execute shell command' },
  { label: 'fetch', detail: 'fetch(url: text)', documentation: 'HTTP GET request' },
  { label: 'length', detail: 'length(value: text | json[])', documentation: 'Get length of string or array' },
];

// VibeValue properties (available on all values)
const vibeValueProperties: Array<{ label: string; detail: string; documentation: string }> = [
  { label: 'err', detail: 'VibeError | null', documentation: 'Error if operation failed, null if success. Check with `if x.err { ... }`' },
  { label: 'toolCalls', detail: 'ToolCallRecord[]', documentation: 'Array of AI tool calls made during this operation. Empty for non-AI values.' },
];

// Array/string methods
const arrayMethods: Array<{ label: string; detail: string; documentation: string }> = [
  { label: 'len', detail: 'len(): number', documentation: 'Get the length of an array or string' },
  { label: 'push', detail: 'push(item)', documentation: 'Add an item to the end of an array' },
  { label: 'pop', detail: 'pop(): item', documentation: 'Remove and return the last item from an array' },
];

/**
 * Provide completion items for a position in the document
 */
export function provideCompletions(
  document: TextDocument,
  position: Position
): CompletionItem[] {
  const text = document.getText();
  const items: CompletionItem[] = [];

  // Get context (what's before the cursor)
  const lineText = text.split('\n')[position.line] ?? '';
  const textBeforeCursor = lineText.slice(0, position.character);

  // After @ - suggest decorators
  if (textBeforeCursor.endsWith('@')) {
    items.push({
      label: 'description',
      kind: CompletionItemKind.Property,
      detail: 'Tool description decorator',
      insertText: 'description ',
    });
    items.push({
      label: 'param',
      kind: CompletionItemKind.Property,
      detail: 'Parameter description decorator',
      insertText: 'param ',
    });
    return items;
  }

  // After dot - suggest VibeValue properties and methods
  if (/\.\s*$/.test(textBeforeCursor)) {
    // VibeValue properties (available on all values)
    for (const prop of vibeValueProperties) {
      items.push({
        label: prop.label,
        kind: CompletionItemKind.Property,
        detail: prop.detail,
        documentation: prop.documentation,
      });
    }

    // Array/string methods
    for (const method of arrayMethods) {
      items.push({
        label: method.label,
        kind: CompletionItemKind.Method,
        detail: method.detail,
        documentation: method.documentation,
      });
    }
    return items;
  }

  // After colon (type context) - suggest types
  if (/:\s*$/.test(textBeforeCursor)) {
    for (const type of types) {
      items.push({
        label: type.label,
        kind: CompletionItemKind.TypeParameter,
        detail: type.detail,
      });
    }
    return items;
  }

  // General completions
  // Keywords
  for (const kw of keywords) {
    items.push({
      label: kw.label,
      kind: kw.kind,
      detail: kw.detail,
    });
  }

  // Built-in tools
  for (const tool of builtinTools) {
    items.push({
      label: tool.label,
      kind: CompletionItemKind.Function,
      detail: tool.detail,
      documentation: tool.documentation,
    });
  }

  // TODO: Add variables from the current scope by parsing the document

  return items;
}
