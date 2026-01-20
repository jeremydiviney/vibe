import { CompletionItemKind } from 'vscode-languageserver/node';

/**
 * Centralized definitions for all Vibe language built-ins
 * Single source of truth for completions, hover, and signature help
 */

// Keyword definitions with full metadata
export interface KeywordDef {
  name: string;
  kind: CompletionItemKind;
  detail: string;
  documentation: string;
}

export const keywords: KeywordDef[] = [
  {
    name: 'let',
    kind: CompletionItemKind.Keyword,
    detail: 'Declare a variable',
    documentation: 'Declare a mutable variable.\n\nSyntax: `let name: type = value`\n\nDestructuring: `let {name: text, age: number} = do "..." model`',
  },
  {
    name: 'const',
    kind: CompletionItemKind.Keyword,
    detail: 'Declare a constant',
    documentation: 'Declare an immutable constant.\n\nSyntax: `const name: type = value`\n\nDestructuring: `const {name: text, age: number} = do "..." model`',
  },
  {
    name: 'function',
    kind: CompletionItemKind.Keyword,
    detail: 'Define a function',
    documentation: 'Define a function.\n\nSyntax: `function name(params): returnType { body }`',
  },
  {
    name: 'tool',
    kind: CompletionItemKind.Keyword,
    detail: 'Define an AI-callable tool',
    documentation: 'Define an AI-callable tool.\n\nSyntax: `tool name(params): returnType @description "..." { body }`',
  },
  {
    name: 'model',
    kind: CompletionItemKind.Keyword,
    detail: 'Define an AI model',
    documentation: 'Define an AI model configuration.\n\nSyntax: `model name = { provider: "...", modelName: "..." }`',
  },
  {
    name: 'vibe',
    kind: CompletionItemKind.Keyword,
    detail: 'AI expression (multi-turn)',
    documentation: 'AI expression - sends a prompt to an AI model with multi-turn tool calling.\n\nSyntax: `vibe <prompt> <model> <context>`',
  },
  {
    name: 'do',
    kind: CompletionItemKind.Keyword,
    detail: 'AI expression (single-round)',
    documentation: 'AI expression - single-round AI call (executes tools once, no loop back).\n\nSyntax: `do <prompt> <model> <context>`',
  },
  {
    name: 'if',
    kind: CompletionItemKind.Keyword,
    detail: 'Conditional statement',
    documentation: 'Conditional statement.\n\nSyntax: `if condition { body } else { body }`',
  },
  {
    name: 'else',
    kind: CompletionItemKind.Keyword,
    detail: 'Else branch',
    documentation: 'Else branch of an if statement.',
  },
  {
    name: 'for',
    kind: CompletionItemKind.Keyword,
    detail: 'For-in loop',
    documentation: 'For-in loop over arrays or ranges.\n\nSyntax: `for item in collection { body }`',
  },
  {
    name: 'while',
    kind: CompletionItemKind.Keyword,
    detail: 'While loop',
    documentation: 'While loop with condition.\n\nSyntax: `while condition { body }`',
  },
  {
    name: 'return',
    kind: CompletionItemKind.Keyword,
    detail: 'Return from function',
    documentation: 'Return a value from a function.\n\nSyntax: `return expression`',
  },
  {
    name: 'import',
    kind: CompletionItemKind.Keyword,
    detail: 'Import from module',
    documentation: 'Import from another module.\n\nSyntax: `import { name } from "path"`',
  },
  {
    name: 'export',
    kind: CompletionItemKind.Keyword,
    detail: 'Export declaration',
    documentation: 'Export a declaration.\n\nSyntax: `export function|let|const|model ...`',
  },
  {
    name: 'from',
    kind: CompletionItemKind.Keyword,
    detail: 'Import source',
    documentation: 'Specifies the source module for an import.',
  },
  {
    name: 'in',
    kind: CompletionItemKind.Keyword,
    detail: 'For-in operator',
    documentation: 'Used in for-in loops: `for item in collection`',
  },
  {
    name: 'and',
    kind: CompletionItemKind.Operator,
    detail: 'Logical AND',
    documentation: 'Logical AND operator.',
  },
  {
    name: 'or',
    kind: CompletionItemKind.Operator,
    detail: 'Logical OR',
    documentation: 'Logical OR operator.',
  },
  {
    name: 'not',
    kind: CompletionItemKind.Operator,
    detail: 'Logical NOT',
    documentation: 'Logical NOT operator.',
  },
  {
    name: 'true',
    kind: CompletionItemKind.Constant,
    detail: 'Boolean true',
    documentation: 'Boolean literal `true`.',
  },
  {
    name: 'false',
    kind: CompletionItemKind.Constant,
    detail: 'Boolean false',
    documentation: 'Boolean literal `false`.',
  },
  {
    name: 'null',
    kind: CompletionItemKind.Constant,
    detail: 'Null value',
    documentation: 'Null value - represents absence of a value.\n\nCan be assigned to typed variables: `let x: text = null`\n\nCannot be used without a type: `let x = null` is an error.',
  },
  {
    name: 'default',
    kind: CompletionItemKind.Keyword,
    detail: 'Default context',
    documentation: 'Use the default (global) context for AI calls.',
  },
  {
    name: 'local',
    kind: CompletionItemKind.Keyword,
    detail: 'Local context',
    documentation: 'Use local context for AI calls.',
  },
  {
    name: 'forget',
    kind: CompletionItemKind.Keyword,
    detail: 'Context mode: discard',
    documentation: 'Context mode: discard context from block on exit.',
  },
  {
    name: 'verbose',
    kind: CompletionItemKind.Keyword,
    detail: 'Context mode: keep all',
    documentation: 'Context mode: keep full history (default).',
  },
  {
    name: 'compress',
    kind: CompletionItemKind.Keyword,
    detail: 'Context mode: summarize',
    documentation: 'Context mode: AI summarizes context on exit.\n\nSyntax: `compress` or `compress("prompt")`',
  },
  {
    name: 'async',
    kind: CompletionItemKind.Keyword,
    detail: 'Async declaration',
    documentation: 'Declare an async variable that executes in parallel.\n\nSyntax: `async let x = do "..." model`\n\nSupports:\n- `async let/const` for AI calls\n- `async let/const` for TS blocks and functions\n- `async let/const` for Vibe function calls\n- Automatic dependency detection and wave-based execution\n- Implicit await at variable usage or block boundaries',
  },
  {
    name: 'private',
    kind: CompletionItemKind.Keyword,
    detail: 'Private variable modifier',
    documentation: 'Mark a variable as private (hidden from AI context).\n\nSyntax: `let private x: text = "hidden"`\n\nPrivate variables:\n- Exist in runtime but filtered from AI context\n- Useful for API keys, internal state, etc.\n- Can be used with destructuring: `let {private x: text, y: number} = ...`',
  },
];

// Create lookup map for hover
export const keywordDocs: Record<string, string> = Object.fromEntries(
  keywords.map(k => [k.name, k.documentation])
);

// Type definitions
export interface TypeDef {
  name: string;
  detail: string;
  documentation: string;
}

export const types: TypeDef[] = [
  { name: 'text', detail: 'String type', documentation: 'String type - text data.' },
  { name: 'json', detail: 'JSON object type', documentation: 'JSON object type - structured data.' },
  { name: 'prompt', detail: 'Prompt type', documentation: 'Prompt type - AI prompt text.' },
  { name: 'boolean', detail: 'Boolean type', documentation: 'Boolean type - true or false.' },
  { name: 'number', detail: 'Number type', documentation: 'Number type - numeric values.' },
];

// Create lookup map for hover
export const typeDocs: Record<string, string> = Object.fromEntries(
  types.map(t => [t.name, t.documentation])
);

// Built-in function definitions
export interface BuiltinFunctionDef {
  name: string;
  signature: string;
  params: Array<{ name: string; type: string; description: string }>;
  documentation: string;
  /** If true, this function is auto-imported and available without explicit import */
  isAutoImported?: boolean;
}

// Core functions - auto-imported, available everywhere without import
export const coreFunctions: BuiltinFunctionDef[] = [
  {
    name: 'print',
    signature: 'print(message: text)',
    params: [{ name: 'message', type: 'text', description: 'The message to print' }],
    documentation: 'Print a message to the console.\n\n*Auto-imported: available everywhere without import.*',
    isAutoImported: true,
  },
  {
    name: 'env',
    signature: 'env(name: text, defaultValue?: text)',
    params: [
      { name: 'name', type: 'text', description: 'Environment variable name' },
      { name: 'defaultValue', type: 'text', description: 'Default value if not set (optional)' },
    ],
    documentation: 'Get environment variable value.\n\n*Auto-imported: available everywhere without import.*',
    isAutoImported: true,
  },
];

// Library functions - require explicit import from "system"
export const libraryFunctions: BuiltinFunctionDef[] = [
  {
    name: 'uuid',
    signature: 'uuid()',
    params: [],
    documentation: 'Generate a UUID v4.\n\n*Requires: `import { uuid } from "system"`*',
  },
  {
    name: 'sleep',
    signature: 'sleep(ms: number)',
    params: [{ name: 'ms', type: 'number', description: 'Milliseconds to sleep' }],
    documentation: 'Pause execution for specified milliseconds.\n\n*Requires: `import { sleep } from "system"`*',
  },
  {
    name: 'now',
    signature: 'now()',
    params: [],
    documentation: 'Get current timestamp in milliseconds.\n\n*Requires: `import { now } from "system"`*',
  },
  {
    name: 'read',
    signature: 'read(path: text)',
    params: [{ name: 'path', type: 'text', description: 'File path to read' }],
    documentation: 'Read file contents.\n\n*Requires: `import { read } from "system"`*',
  },
  {
    name: 'write',
    signature: 'write(path: text, content: text)',
    params: [
      { name: 'path', type: 'text', description: 'File path' },
      { name: 'content', type: 'text', description: 'Content to write' },
    ],
    documentation: 'Write content to file.\n\n*Requires: `import { write } from "system"`*',
  },
  {
    name: 'exec',
    signature: 'exec(command: text)',
    params: [{ name: 'command', type: 'text', description: 'Shell command to execute' }],
    documentation: 'Execute shell command.\n\n*Requires: `import { exec } from "system"`*',
  },
  {
    name: 'fetch',
    signature: 'fetch(url: text)',
    params: [{ name: 'url', type: 'text', description: 'URL to fetch' }],
    documentation: 'HTTP GET request.\n\n*Requires: `import { fetch } from "system"`*',
  },
  {
    name: 'length',
    signature: 'length(value: text | json[])',
    params: [{ name: 'value', type: 'text | json[]', description: 'String or array' }],
    documentation: 'Get length of string or array.\n\n*Requires: `import { length } from "system"`*',
  },
  {
    name: 'jsonParse',
    signature: 'jsonParse(text: text)',
    params: [{ name: 'text', type: 'text', description: 'JSON string' }],
    documentation: 'Parse JSON string to object.\n\n*Requires: `import { jsonParse } from "system"`*',
  },
  {
    name: 'jsonStringify',
    signature: 'jsonStringify(value: json)',
    params: [{ name: 'value', type: 'json', description: 'Object to stringify' }],
    documentation: 'Convert object to JSON string.\n\n*Requires: `import { jsonStringify } from "system"`*',
  },
];

// All built-in functions (core + library)
export const builtinFunctions: BuiltinFunctionDef[] = [
  ...coreFunctions,
  ...libraryFunctions,
];

// Set of auto-imported function names for quick lookup
export const autoImportedFunctionNames = new Set(
  coreFunctions.map(f => f.name)
);

// Create lookup map for signature help
export const builtinSignatures: Record<string, { label: string; params: string[]; doc: string }> = Object.fromEntries(
  builtinFunctions.map(f => [
    f.name,
    {
      label: f.signature,
      params: f.params.map(p => `${p.name}: ${p.type} - ${p.description}`),
      doc: f.documentation,
    },
  ])
);

// VibeValue properties (available on all values)
export interface PropertyDef {
  name: string;
  type: string;
  documentation: string;
}

export const vibeValueProperties: PropertyDef[] = [
  {
    name: 'err',
    type: 'boolean',
    documentation: '**err** (VibeValue property)\n\n`boolean`\n\nReturns `true` if the operation failed, `false` if successful. Use in boolean conditions directly.\n\n```vibe\nlet result = do "..." model default\nif result.err {\n  print("Error: " + result.errDetails.message)\n}\n```\n\nUse `.errDetails` to access the full error information when `err` is true.',
  },
  {
    name: 'errDetails',
    type: 'VibeError | null',
    documentation: '**errDetails** (VibeValue property)\n\n`VibeError | null`\n\nReturns the error details if `.err` is true, or `null` if successful.\n\n```vibe\nlet result = do "..." model default\nif result.err {\n  print("Error type: " + result.errDetails.type)\n  print("Error message: " + result.errDetails.message)\n}\n```\n\nVibeError has:\n- `message: text` - Error message\n- `type: text` - Error type (e.g., "TypeError", "ReferenceError")\n- `location` - Source location info',
  },
  {
    name: 'toolCalls',
    type: 'ToolCallRecord[]',
    documentation: '**toolCalls** (VibeValue property)\n\n`ToolCallRecord[]`\n\nArray of tool calls made during AI execution. Empty for non-AI values.\n\n```vibe\nlet result = vibe "Do something" model default\nfor call in result.toolCalls {\n  print("Tool: " + call.toolName)\n  print("Duration: " + call.duration + "ms")\n}\n```\n\nEach ToolCallRecord has:\n- `toolName: text` - Name of the tool called\n- `args: json` - Arguments passed\n- `result` - Return value\n- `error: text | null` - Error if failed\n- `duration: number` - Execution time in ms',
  },
];

// Array/string methods
export const arrayMethods: PropertyDef[] = [
  {
    name: 'len',
    type: 'len(): number',
    documentation: '**len()** (array/string method)\n\nReturns the length of an array or string.\n\n```vibe\nlet arr = [1, 2, 3]\nlet count = arr.len()  // 3\n\nlet str = "hello"\nlet length = str.len()  // 5\n```',
  },
  {
    name: 'push',
    type: 'push(item)',
    documentation: '**push(item)** (array method)\n\nAdds an item to the end of an array. Returns the array for chaining.\n\n```vibe\nlet arr = [1, 2]\narr.push(3)  // arr is now [1, 2, 3]\n```',
  },
  {
    name: 'pop',
    type: 'pop(): item',
    documentation: '**pop()** (array method)\n\nRemoves and returns the last item from an array.\n\n```vibe\nlet arr = [1, 2, 3]\nlet last = arr.pop()  // last is 3, arr is [1, 2]\n```',
  },
];

// Combined property docs for hover lookup
export const vibeValuePropertyDocs: Record<string, string> = Object.fromEntries([
  ...vibeValueProperties.map(p => [p.name, p.documentation]),
  ...arrayMethods.map(p => [p.name, p.documentation]),
]);
