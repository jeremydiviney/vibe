import type * as AST from '../../../src/ast';
import { KEYWORD_OFFSETS } from './position';

/**
 * Generic AST walker with visitor pattern
 * Consolidates traversal logic used by references, rename, and ast-utils
 */

// Location info for identifiers and declarations
export interface IdentifierLocation {
  name: string;
  location: { line: number; column: number };
}

// Declaration kind for type discrimination
export type DeclarationKind = 'function' | 'tool' | 'model' | 'let' | 'const' | 'for' | 'destructured';

// Declaration info with computed name location
export interface DeclarationLocation extends IdentifierLocation {
  kind: DeclarationKind;
  nameColumn: number; // Column where name starts (after keyword)
}

// Visitor callbacks
export interface ASTVisitor {
  // Called for every identifier reference (in expressions)
  onIdentifier?: (identifier: IdentifierLocation) => void;

  // Called for every declaration (functions, tools, variables, etc.)
  onDeclaration?: (declaration: DeclarationLocation) => void;
}

/**
 * Walk an AST and call visitor callbacks for identifiers and declarations
 */
export function walkAST(ast: AST.Program, visitor: ASTVisitor): void {
  for (const statement of ast.body) {
    walkStatement(statement, visitor);
  }
}

function walkStatement(statement: AST.Statement, visitor: ASTVisitor): void {
  switch (statement.type) {
    case 'FunctionDeclaration':
      if (visitor.onDeclaration) {
        visitor.onDeclaration({
          name: statement.name,
          location: statement.location,
          kind: 'function',
          nameColumn: statement.location.column + (KEYWORD_OFFSETS['function'] ?? 0),
        });
      }
      for (const s of statement.body.body) {
        walkStatement(s, visitor);
      }
      break;

    case 'ToolDeclaration':
      if (visitor.onDeclaration) {
        visitor.onDeclaration({
          name: statement.name,
          location: statement.location,
          kind: 'tool',
          nameColumn: statement.location.column + (KEYWORD_OFFSETS['tool'] ?? 0),
        });
      }
      for (const s of statement.body.body) {
        walkStatement(s, visitor);
      }
      break;

    case 'ModelDeclaration':
      if (visitor.onDeclaration) {
        visitor.onDeclaration({
          name: statement.name,
          location: statement.location,
          kind: 'model',
          nameColumn: statement.location.column + (KEYWORD_OFFSETS['model'] ?? 0),
        });
      }
      break;

    case 'LetDeclaration':
      if (visitor.onDeclaration) {
        visitor.onDeclaration({
          name: statement.name,
          location: statement.location,
          kind: 'let',
          nameColumn: statement.location.column + (KEYWORD_OFFSETS['let'] ?? 0),
        });
      }
      if (statement.initializer) {
        walkExpression(statement.initializer, visitor);
      }
      break;

    case 'ConstDeclaration':
      if (visitor.onDeclaration) {
        visitor.onDeclaration({
          name: statement.name,
          location: statement.location,
          kind: 'const',
          nameColumn: statement.location.column + (KEYWORD_OFFSETS['const'] ?? 0),
        });
      }
      if (statement.initializer) {
        walkExpression(statement.initializer, visitor);
      }
      break;

    case 'DestructuringDeclaration':
      // Each field is a declaration but without precise location
      // We still report the declaration for the fields
      if (visitor.onDeclaration) {
        for (const field of statement.fields) {
          visitor.onDeclaration({
            name: field.name,
            location: statement.location,
            kind: 'destructured',
            nameColumn: statement.location.column + (KEYWORD_OFFSETS[statement.isConst ? 'const' : 'let'] ?? 0),
          });
        }
      }
      if (statement.initializer) {
        walkExpression(statement.initializer, visitor);
      }
      break;

    case 'ExpressionStatement':
      walkExpression(statement.expression, visitor);
      break;

    case 'ReturnStatement':
      if (statement.value) {
        walkExpression(statement.value, visitor);
      }
      break;

    case 'IfStatement':
      walkExpression(statement.test, visitor);
      for (const s of statement.consequent.body) {
        walkStatement(s, visitor);
      }
      if (statement.alternate) {
        for (const s of statement.alternate.body) {
          walkStatement(s, visitor);
        }
      }
      break;

    case 'ForInStatement':
      if (visitor.onDeclaration) {
        visitor.onDeclaration({
          name: statement.variable,
          location: statement.location,
          kind: 'for',
          nameColumn: statement.location.column + (KEYWORD_OFFSETS['for'] ?? 0),
        });
      }
      walkExpression(statement.iterable, visitor);
      for (const s of statement.body.body) {
        walkStatement(s, visitor);
      }
      break;

    case 'WhileStatement':
      walkExpression(statement.test, visitor);
      for (const s of statement.body.body) {
        walkStatement(s, visitor);
      }
      break;

    case 'ExportDeclaration':
      // Walk the inner declaration
      walkStatement(statement.declaration, visitor);
      break;

    case 'ImportDeclaration':
      // Imports don't have expressions to walk
      break;
  }
}

function walkExpression(expr: AST.Expression, visitor: ASTVisitor): void {
  switch (expr.type) {
    case 'Identifier':
      if (visitor.onIdentifier) {
        visitor.onIdentifier({
          name: expr.name,
          location: expr.location,
        });
      }
      break;

    case 'CallExpression':
      walkExpression(expr.callee, visitor);
      for (const arg of expr.arguments) {
        walkExpression(arg, visitor);
      }
      break;

    case 'BinaryExpression':
      walkExpression(expr.left, visitor);
      walkExpression(expr.right, visitor);
      break;

    case 'UnaryExpression':
      walkExpression(expr.argument, visitor);
      break;

    case 'MemberExpression':
      walkExpression(expr.object, visitor);
      // Don't walk property - it's not an identifier reference
      break;

    case 'IndexExpression':
      walkExpression(expr.object, visitor);
      walkExpression(expr.index, visitor);
      break;

    case 'AssignmentExpression':
      walkExpression(expr.target, visitor);
      walkExpression(expr.value, visitor);
      break;

    case 'ArrayLiteral':
      for (const elem of expr.elements) {
        walkExpression(elem, visitor);
      }
      break;

    case 'ObjectLiteral':
      for (const prop of expr.properties) {
        walkExpression(prop.value, visitor);
      }
      break;

    case 'VibeExpression':
      walkExpression(expr.prompt, visitor);
      // Check model reference - model is an Identifier node
      if (expr.model && expr.model.type === 'Identifier') {
        if (visitor.onIdentifier) {
          visitor.onIdentifier({
            name: expr.model.name,
            location: expr.model.location,
          });
        }
      }
      break;

    case 'TemplateLiteral':
      for (const part of expr.parts) {
        if (part.type === 'expression') {
          walkExpression(part.value, visitor);
        }
      }
      break;

    case 'RangeExpression':
      walkExpression(expr.start, visitor);
      walkExpression(expr.end, visitor);
      break;

    // Literals don't contain identifiers
    case 'StringLiteral':
    case 'NumberLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
      break;
  }
}

/**
 * Find all occurrences of a symbol (both declarations and references)
 * Returns locations suitable for references/rename operations
 */
export function findAllOccurrences(
  ast: AST.Program,
  symbolName: string,
  includeDeclarations: boolean
): Array<{ location: { line: number; column: number }; length: number }> {
  const occurrences: Array<{ location: { line: number; column: number }; length: number }> = [];

  walkAST(ast, {
    onIdentifier: (identifier) => {
      if (identifier.name === symbolName) {
        occurrences.push({
          location: identifier.location,
          length: symbolName.length,
        });
      }
    },
    onDeclaration: includeDeclarations
      ? (declaration) => {
          if (declaration.name === symbolName) {
            occurrences.push({
              location: {
                line: declaration.location.line,
                column: declaration.nameColumn,
              },
              length: symbolName.length,
            });
          }
        }
      : undefined,
  });

  return occurrences;
}
