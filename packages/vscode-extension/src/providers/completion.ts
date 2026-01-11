import {
  CompletionItem,
  CompletionItemKind,
  Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  keywords,
  types,
  builtinFunctions,
  vibeValueProperties,
  arrayMethods,
} from '../utils/builtins';

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
        label: prop.name,
        kind: CompletionItemKind.Property,
        detail: prop.type,
        documentation: prop.documentation,
      });
    }

    // Array/string methods
    for (const method of arrayMethods) {
      items.push({
        label: method.name,
        kind: CompletionItemKind.Method,
        detail: method.type,
        documentation: method.documentation,
      });
    }
    return items;
  }

  // After colon (type context) - suggest types
  if (/:\s*$/.test(textBeforeCursor)) {
    for (const type of types) {
      items.push({
        label: type.name,
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
      label: kw.name,
      kind: kw.kind,
      detail: kw.detail,
    });
  }

  // Built-in functions
  for (const func of builtinFunctions) {
    items.push({
      label: func.name,
      kind: CompletionItemKind.Function,
      detail: func.signature,
      documentation: func.documentation,
    });
  }

  // TODO: Add variables from the current scope by parsing the document

  return items;
}
