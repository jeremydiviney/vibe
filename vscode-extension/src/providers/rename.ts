import { WorkspaceEdit, TextEdit, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '../../../src/parser/parse';
import { findIdentifierAtPosition } from '../utils/ast-utils';
import type * as AST from '../../../src/ast';

interface RenameLocation {
  line: number;
  character: number;
  length: number;
}

/**
 * Rename a symbol and all its references
 */
export function provideRename(
  document: TextDocument,
  position: Position,
  newName: string
): WorkspaceEdit | null {
  const text = document.getText();

  try {
    const ast = parse(text, { file: document.uri });

    // Convert LSP 0-based position to parser 1-based
    const line = position.line + 1;
    const column = position.character + 1;

    // Find identifier at cursor position
    const identifierName = findIdentifierAtPosition(ast, line, column);
    if (!identifierName) return null;

    // Find all locations to rename
    const locations: RenameLocation[] = [];
    findAllRenameLocations(ast, identifierName, locations);

    if (locations.length === 0) return null;

    // Create text edits
    const edits: TextEdit[] = locations.map(loc => ({
      range: {
        start: { line: loc.line, character: loc.character },
        end: { line: loc.line, character: loc.character + loc.length },
      },
      newText: newName,
    }));

    return {
      changes: {
        [document.uri]: edits,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Prepare rename - validate that rename is possible at this position
 */
export function prepareRename(
  document: TextDocument,
  position: Position
): { range: { start: Position; end: Position }; placeholder: string } | null {
  const text = document.getText();

  try {
    const ast = parse(text, { file: document.uri });

    const line = position.line + 1;
    const column = position.character + 1;

    const identifierName = findIdentifierAtPosition(ast, line, column);
    if (!identifierName) return null;

    // Find the exact position of this identifier for the range
    const locations: RenameLocation[] = [];
    findAllRenameLocations(ast, identifierName, locations);

    // Find the location closest to the cursor
    const cursorLoc = locations.find(
      loc => loc.line === position.line &&
             position.character >= loc.character &&
             position.character <= loc.character + loc.length
    );

    if (!cursorLoc) return null;

    return {
      range: {
        start: { line: cursorLoc.line, character: cursorLoc.character },
        end: { line: cursorLoc.line, character: cursorLoc.character + cursorLoc.length },
      },
      placeholder: identifierName,
    };
  } catch {
    return null;
  }
}

function findAllRenameLocations(
  ast: AST.Program,
  name: string,
  locations: RenameLocation[]
): void {
  for (const statement of ast.body) {
    findRenameLocationsInStatement(statement, name, locations);
  }
}

function findRenameLocationsInStatement(
  statement: AST.Statement,
  name: string,
  locations: RenameLocation[]
): void {
  switch (statement.type) {
    case 'FunctionDeclaration':
      if (statement.name === name) {
        addRenameLocation(statement.location, name, locations, 9); // "function "
      }
      for (const s of statement.body.body) {
        findRenameLocationsInStatement(s, name, locations);
      }
      break;

    case 'ToolDeclaration':
      if (statement.name === name) {
        addRenameLocation(statement.location, name, locations, 5); // "tool "
      }
      for (const s of statement.body.body) {
        findRenameLocationsInStatement(s, name, locations);
      }
      break;

    case 'ModelDeclaration':
      if (statement.name === name) {
        addRenameLocation(statement.location, name, locations, 6); // "model "
      }
      break;

    case 'LetDeclaration':
      if (statement.name === name) {
        addRenameLocation(statement.location, name, locations, 4); // "let "
      }
      if (statement.initializer) {
        findRenameLocationsInExpression(statement.initializer, name, locations);
      }
      break;

    case 'ConstDeclaration':
      if (statement.name === name) {
        addRenameLocation(statement.location, name, locations, 6); // "const "
      }
      if (statement.initializer) {
        findRenameLocationsInExpression(statement.initializer, name, locations);
      }
      break;

    case 'DestructuringDeclaration':
      if (statement.initializer) {
        findRenameLocationsInExpression(statement.initializer, name, locations);
      }
      break;

    case 'ExpressionStatement':
      findRenameLocationsInExpression(statement.expression, name, locations);
      break;

    case 'ReturnStatement':
      if (statement.value) {
        findRenameLocationsInExpression(statement.value, name, locations);
      }
      break;

    case 'IfStatement':
      findRenameLocationsInExpression(statement.test, name, locations);
      for (const s of statement.consequent.body) {
        findRenameLocationsInStatement(s, name, locations);
      }
      if (statement.alternate) {
        for (const s of statement.alternate.body) {
          findRenameLocationsInStatement(s, name, locations);
        }
      }
      break;

    case 'ForInStatement':
      if (statement.variable === name) {
        addRenameLocation(statement.location, name, locations, 4); // "for "
      }
      findRenameLocationsInExpression(statement.iterable, name, locations);
      for (const s of statement.body.body) {
        findRenameLocationsInStatement(s, name, locations);
      }
      break;

    case 'WhileStatement':
      findRenameLocationsInExpression(statement.test, name, locations);
      for (const s of statement.body.body) {
        findRenameLocationsInStatement(s, name, locations);
      }
      break;
  }
}

function findRenameLocationsInExpression(
  expr: AST.Expression,
  name: string,
  locations: RenameLocation[]
): void {
  switch (expr.type) {
    case 'Identifier':
      if (expr.name === name) {
        addRenameLocation(expr.location, name, locations, 0);
      }
      break;

    case 'CallExpression':
      findRenameLocationsInExpression(expr.callee, name, locations);
      for (const arg of expr.arguments) {
        findRenameLocationsInExpression(arg, name, locations);
      }
      break;

    case 'BinaryExpression':
      findRenameLocationsInExpression(expr.left, name, locations);
      findRenameLocationsInExpression(expr.right, name, locations);
      break;

    case 'UnaryExpression':
      findRenameLocationsInExpression(expr.argument, name, locations);
      break;

    case 'MemberExpression':
      findRenameLocationsInExpression(expr.object, name, locations);
      break;

    case 'IndexExpression':
      findRenameLocationsInExpression(expr.object, name, locations);
      findRenameLocationsInExpression(expr.index, name, locations);
      break;

    case 'AssignmentExpression':
      findRenameLocationsInExpression(expr.target, name, locations);
      findRenameLocationsInExpression(expr.value, name, locations);
      break;

    case 'ArrayLiteral':
      for (const elem of expr.elements) {
        findRenameLocationsInExpression(elem, name, locations);
      }
      break;

    case 'ObjectLiteral':
      for (const prop of expr.properties) {
        findRenameLocationsInExpression(prop.value, name, locations);
      }
      break;

    case 'VibeExpression':
      findRenameLocationsInExpression(expr.prompt, name, locations);
      if (expr.model && expr.model.type === 'Identifier' && expr.model.name === name) {
        addRenameLocation(expr.model.location, name, locations, 0);
      }
      break;

    case 'TemplateLiteral':
      for (const part of expr.parts) {
        if (part.type === 'expression') {
          findRenameLocationsInExpression(part.value, name, locations);
        }
      }
      break;
  }
}

function addRenameLocation(
  location: { line: number; column: number },
  name: string,
  locations: RenameLocation[],
  keywordOffset: number
): void {
  locations.push({
    line: location.line - 1, // Convert to 0-based
    character: location.column - 1 + keywordOffset,
    length: name.length,
  });
}
