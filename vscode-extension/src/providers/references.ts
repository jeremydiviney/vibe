import { Location, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '../../../src/parser/parse';
import { findIdentifierAtPosition } from '../utils/ast-utils';
import type * as AST from '../../../src/ast';

/**
 * Find all references to the symbol at the cursor position
 */
export function provideReferences(
  document: TextDocument,
  position: Position,
  includeDeclaration: boolean
): Location[] {
  const text = document.getText();
  const references: Location[] = [];

  try {
    const ast = parse(text, { file: document.uri });

    // Convert LSP 0-based position to parser 1-based
    const line = position.line + 1;
    const column = position.character + 1;

    // Find identifier at cursor position
    const identifierName = findIdentifierAtPosition(ast, line, column);
    if (!identifierName) return [];

    // Find all references to this identifier
    findAllReferences(ast, identifierName, document.uri, references, includeDeclaration);

    return references;
  } catch {
    return [];
  }
}

function findAllReferences(
  ast: AST.Program,
  name: string,
  uri: string,
  references: Location[],
  includeDeclaration: boolean
): void {
  for (const statement of ast.body) {
    findReferencesInStatement(statement, name, uri, references, includeDeclaration);
  }
}

function findReferencesInStatement(
  statement: AST.Statement,
  name: string,
  uri: string,
  references: Location[],
  includeDeclaration: boolean
): void {
  switch (statement.type) {
    case 'FunctionDeclaration':
      if (includeDeclaration && statement.name === name) {
        addReference(statement.location, name, uri, references, 9); // "function " offset
      }
      for (const s of statement.body.body) {
        findReferencesInStatement(s, name, uri, references, includeDeclaration);
      }
      break;

    case 'ToolDeclaration':
      if (includeDeclaration && statement.name === name) {
        addReference(statement.location, name, uri, references, 5); // "tool " offset
      }
      for (const s of statement.body.body) {
        findReferencesInStatement(s, name, uri, references, includeDeclaration);
      }
      break;

    case 'ModelDeclaration':
      if (includeDeclaration && statement.name === name) {
        addReference(statement.location, name, uri, references, 6); // "model " offset
      }
      break;

    case 'LetDeclaration':
      if (includeDeclaration && statement.name === name) {
        addReference(statement.location, name, uri, references, 4); // "let " offset
      }
      if (statement.initializer) {
        findReferencesInExpression(statement.initializer, name, uri, references);
      }
      break;

    case 'ConstDeclaration':
      if (includeDeclaration && statement.name === name) {
        addReference(statement.location, name, uri, references, 6); // "const " offset
      }
      if (statement.initializer) {
        findReferencesInExpression(statement.initializer, name, uri, references);
      }
      break;

    case 'DestructuringDeclaration':
      if (statement.initializer) {
        findReferencesInExpression(statement.initializer, name, uri, references);
      }
      break;

    case 'ExpressionStatement':
      findReferencesInExpression(statement.expression, name, uri, references);
      break;

    case 'ReturnStatement':
      if (statement.value) {
        findReferencesInExpression(statement.value, name, uri, references);
      }
      break;

    case 'IfStatement':
      findReferencesInExpression(statement.test, name, uri, references);
      for (const s of statement.consequent.body) {
        findReferencesInStatement(s, name, uri, references, includeDeclaration);
      }
      if (statement.alternate) {
        for (const s of statement.alternate.body) {
          findReferencesInStatement(s, name, uri, references, includeDeclaration);
        }
      }
      break;

    case 'ForInStatement':
      if (includeDeclaration && statement.variable === name) {
        addReference(statement.location, name, uri, references, 4); // "for " offset
      }
      findReferencesInExpression(statement.iterable, name, uri, references);
      for (const s of statement.body.body) {
        findReferencesInStatement(s, name, uri, references, includeDeclaration);
      }
      break;

    case 'WhileStatement':
      findReferencesInExpression(statement.test, name, uri, references);
      for (const s of statement.body.body) {
        findReferencesInStatement(s, name, uri, references, includeDeclaration);
      }
      break;
  }
}

function findReferencesInExpression(
  expr: AST.Expression,
  name: string,
  uri: string,
  references: Location[]
): void {
  switch (expr.type) {
    case 'Identifier':
      if (expr.name === name) {
        addReference(expr.location, name, uri, references, 0);
      }
      break;

    case 'CallExpression':
      findReferencesInExpression(expr.callee, name, uri, references);
      for (const arg of expr.arguments) {
        findReferencesInExpression(arg, name, uri, references);
      }
      break;

    case 'BinaryExpression':
      findReferencesInExpression(expr.left, name, uri, references);
      findReferencesInExpression(expr.right, name, uri, references);
      break;

    case 'UnaryExpression':
      findReferencesInExpression(expr.argument, name, uri, references);
      break;

    case 'MemberExpression':
      findReferencesInExpression(expr.object, name, uri, references);
      break;

    case 'IndexExpression':
      findReferencesInExpression(expr.object, name, uri, references);
      findReferencesInExpression(expr.index, name, uri, references);
      break;

    case 'AssignmentExpression':
      findReferencesInExpression(expr.target, name, uri, references);
      findReferencesInExpression(expr.value, name, uri, references);
      break;

    case 'ArrayLiteral':
      for (const elem of expr.elements) {
        findReferencesInExpression(elem, name, uri, references);
      }
      break;

    case 'ObjectLiteral':
      for (const prop of expr.properties) {
        findReferencesInExpression(prop.value, name, uri, references);
      }
      break;

    case 'VibeExpression':
      findReferencesInExpression(expr.prompt, name, uri, references);
      if (expr.model && expr.model.type === 'Identifier' && expr.model.name === name) {
        addReference(expr.model.location, name, uri, references, 0);
      }
      break;

    case 'TemplateLiteral':
      for (const part of expr.parts) {
        if (part.type === 'expression') {
          findReferencesInExpression(part.value, name, uri, references);
        }
      }
      break;
  }
}

function addReference(
  location: { line: number; column: number },
  name: string,
  uri: string,
  references: Location[],
  keywordOffset: number
): void {
  const startChar = location.column - 1 + keywordOffset;
  references.push({
    uri,
    range: {
      start: { line: location.line - 1, character: startChar },
      end: { line: location.line - 1, character: startChar + name.length },
    },
  });
}
