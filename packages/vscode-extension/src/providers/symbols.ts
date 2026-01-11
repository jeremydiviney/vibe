import { DocumentSymbol, SymbolKind, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '@vibe-lang/runtime/parser/parse';
import type * as AST from '@vibe-lang/runtime/ast';

/**
 * Provide document symbols (outline) for a Vibe document
 */
export function provideDocumentSymbols(document: TextDocument): DocumentSymbol[] {
  const text = document.getText();
  const symbols: DocumentSymbol[] = [];

  try {
    const ast = parse(text, { file: document.uri });

    for (const statement of ast.body) {
      const symbol = statementToSymbol(statement);
      if (symbol) {
        symbols.push(symbol);
      }
    }
  } catch {
    // Parse error - return empty symbols
  }

  return symbols;
}

function statementToSymbol(statement: AST.Statement): DocumentSymbol | null {
  switch (statement.type) {
    case 'FunctionDeclaration':
      return createSymbol(
        statement.name,
        SymbolKind.Function,
        statement.location,
        formatParams(statement.params),
        statement.body.body.flatMap(s => {
          const sym = statementToSymbol(s);
          return sym ? [sym] : [];
        })
      );

    case 'ToolDeclaration':
      return createSymbol(
        statement.name,
        SymbolKind.Method, // Use Method to distinguish from regular functions
        statement.location,
        `tool ${formatToolParams(statement.params)}`,
        []
      );

    case 'ModelDeclaration':
      return createSymbol(
        statement.name,
        SymbolKind.Object,
        statement.location,
        'model',
        []
      );

    case 'LetDeclaration':
      return createSymbol(
        statement.name,
        SymbolKind.Variable,
        statement.location,
        statement.typeAnnotation ?? 'let',
        []
      );

    case 'ConstDeclaration':
      return createSymbol(
        statement.name,
        SymbolKind.Constant,
        statement.location,
        statement.typeAnnotation ?? 'const',
        []
      );

    case 'DestructuringDeclaration':
      // Create symbols for each destructured field
      const fieldSymbols = statement.fields.map(field =>
        createSymbol(
          field.name,
          statement.isConst ? SymbolKind.Constant : SymbolKind.Variable,
          statement.location,
          field.type,
          []
        )
      );
      // Return a container symbol with children
      const fieldNames = statement.fields.map(f => f.name).join(', ');
      return createSymbol(
        `{${fieldNames}}`,
        SymbolKind.Struct,
        statement.location,
        statement.isConst ? 'const destructuring' : 'let destructuring',
        fieldSymbols
      );

    case 'ExportDeclaration':
      // Unwrap the export and mark it
      const inner = statementToSymbol(statement.declaration);
      if (inner) {
        inner.detail = `export ${inner.detail ?? ''}`;
      }
      return inner;

    case 'ImportDeclaration':
      // Show imports as a namespace
      const names = statement.specifiers.map(s => s.local).join(', ');
      return createSymbol(
        `{ ${names} }`,
        SymbolKind.Namespace,
        statement.location,
        `from "${statement.source}"`,
        []
      );

    default:
      return null;
  }
}

function createSymbol(
  name: string,
  kind: SymbolKind,
  location: { line: number; column: number },
  detail: string,
  children: DocumentSymbol[]
): DocumentSymbol {
  // LSP uses 0-based line/column
  const line = location.line - 1;
  const column = location.column - 1;

  // Approximate range - just the line for now
  const range: Range = {
    start: { line, character: column },
    end: { line, character: column + name.length },
  };

  return {
    name,
    kind,
    detail,
    range,
    selectionRange: range,
    children: children.length > 0 ? children : undefined,
  };
}

function formatParams(params: AST.FunctionParameter[]): string {
  if (params.length === 0) return '()';
  const paramStr = params.map(p => `${p.name}: ${p.typeAnnotation}`).join(', ');
  return `(${paramStr})`;
}

function formatToolParams(params: AST.ToolParameter[]): string {
  if (params.length === 0) return '()';
  const paramStr = params.map(p => `${p.name}: ${p.typeAnnotation}`).join(', ');
  return `(${paramStr})`;
}
