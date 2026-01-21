import type * as AST from '@vibe-lang/runtime/ast';
import { KEYWORD_OFFSETS } from './position';

// Additional offset when 'private' modifier is present (adds "private " = 8 chars)
const PRIVATE_OFFSET = 8;

// TypeScript import info - maps local name to import details
export interface TSImportInfo {
  localName: string;      // Name used in this file
  importedName: string;   // Name exported from TS file
  sourcePath: string;     // Import path (e.g., "./utils.ts")
}

// Vibe import info - maps local name to import details
export interface VibeImportInfo {
  localName: string;      // Name used in this file
  importedName: string;   // Name exported from Vibe file
  sourcePath: string;     // Import path (e.g., "./utils.vibe")
}

/**
 * Find all TypeScript imports in the AST
 * Returns a map from local name to import info
 */
export function findTSImports(ast: AST.Program): Map<string, TSImportInfo> {
  const imports = new Map<string, TSImportInfo>();

  for (const statement of ast.body) {
    if (statement.type === 'ImportDeclaration' && statement.sourceType === 'ts') {
      for (const specifier of statement.specifiers) {
        imports.set(specifier.local, {
          localName: specifier.local,
          importedName: specifier.imported,
          sourcePath: statement.source,
        });
      }
    }
  }

  return imports;
}

/**
 * Find all Vibe imports in the AST
 * Returns a map from local name to import info
 */
export function findVibeImports(ast: AST.Program): Map<string, VibeImportInfo> {
  const imports = new Map<string, VibeImportInfo>();

  for (const statement of ast.body) {
    if (statement.type === 'ImportDeclaration' && statement.sourceType === 'vibe') {
      for (const specifier of statement.specifiers) {
        imports.set(specifier.local, {
          localName: specifier.local,
          importedName: specifier.imported,
          sourcePath: statement.source,
        });
      }
    }
  }

  return imports;
}

/**
 * Check if an identifier is from a TypeScript import
 * Returns the import info if found, null otherwise
 */
export function getTSImportForIdentifier(
  ast: AST.Program,
  identifierName: string
): TSImportInfo | null {
  const imports = findTSImports(ast);
  return imports.get(identifierName) ?? null;
}

/**
 * Check if an identifier is from a Vibe import
 * Returns the import info if found, null otherwise
 */
export function getVibeImportForIdentifier(
  ast: AST.Program,
  identifierName: string
): VibeImportInfo | null {
  const imports = findVibeImports(ast);
  return imports.get(identifierName) ?? null;
}

// Declaration info returned by findDeclaration
export interface DeclarationInfo {
  name: string;
  kind: 'function' | 'tool' | 'model' | 'variable' | 'constant' | 'parameter' | 'destructured' | 'import';
  location: { line: number; column: number };
  node: AST.Node;
  importSource?: string;      // For imports: the source file path
  importSourceType?: 'ts' | 'vibe';  // For imports: whether it's a TS or Vibe import
}

interface NodeInfo {
  node: AST.Node;
  kind: 'function' | 'tool' | 'model' | 'variable' | 'constant' | 'parameter' | 'identifier' | 'destructured';
  name: string;
  type?: string;
  description?: string;
}

/**
 * Find the AST node at a given position (1-based line/column)
 */
export function findNodeAtPosition(
  ast: AST.Program,
  line: number,
  column: number
): NodeInfo | null {
  // Walk the AST and find declarations/identifiers at the position
  for (const statement of ast.body) {
    const result = findInStatement(statement, line, column);
    if (result) return result;
  }
  return null;
}

function findInStatement(
  statement: AST.Statement,
  line: number,
  column: number
): NodeInfo | null {
  // Check if position is within this statement
  if (statement.location.line !== line) {
    // For now, simple line-based matching
    // TODO: Track end positions for proper range matching
  }

  switch (statement.type) {
    case 'FunctionDeclaration':
      if (isPositionAtName(statement.location, statement.name, line, column)) {
        return {
          node: statement,
          kind: 'function',
          name: statement.name,
          type: formatFunctionSignature(statement),
        };
      }
      // Check body
      for (const s of statement.body.body) {
        const result = findInStatement(s, line, column);
        if (result) return result;
      }
      break;

    case 'ToolDeclaration':
      if (isPositionAtName(statement.location, statement.name, line, column)) {
        return {
          node: statement,
          kind: 'tool',
          name: statement.name,
          type: formatToolSignature(statement),
          description: statement.description,
        };
      }
      break;

    case 'ModelDeclaration':
      if (isPositionAtName(statement.location, statement.name, line, column)) {
        return {
          node: statement,
          kind: 'model',
          name: statement.name,
          type: 'model',
        };
      }
      break;

    case 'LetDeclaration':
      if (isPositionAtName(statement.location, statement.name, line, column)) {
        return {
          node: statement,
          kind: 'variable',
          name: statement.name,
          type: statement.typeAnnotation ?? undefined,
        };
      }
      break;

    case 'ConstDeclaration':
      if (isPositionAtName(statement.location, statement.name, line, column)) {
        return {
          node: statement,
          kind: 'constant',
          name: statement.name,
          type: statement.typeAnnotation ?? undefined,
        };
      }
      break;

    case 'DestructuringDeclaration':
      if (statement.location.line === line) {
        // Check if cursor is on any of the field names
        for (const field of statement.fields) {
          return {
            node: statement,
            kind: 'destructured',
            name: field.name,
            type: field.type,
            description: statement.isConst ? 'const destructuring' : 'let destructuring',
          };
        }
      }
      break;

    case 'ExportDeclaration':
      // Delegate to the inner declaration
      return findInStatement(statement.declaration, line, column);
  }

  return null;
}

function isPositionAtName(
  location: { line: number; column: number },
  name: string,
  line: number,
  column: number
): boolean {
  // Simple check - on same line
  // TODO: More precise column range checking
  return location.line === line;
}

function formatFunctionSignature(func: AST.FunctionDeclaration): string {
  const params = func.params.map(p => `${p.name}: ${p.typeAnnotation}`).join(', ');
  const returnType = func.returnType ? `: ${func.returnType}` : '';
  return `function(${params})${returnType}`;
}

function formatToolSignature(tool: AST.ToolDeclaration): string {
  const params = tool.params.map(p => `${p.name}: ${p.typeAnnotation}`).join(', ');
  const returnType = tool.returnType ? `: ${tool.returnType}` : '';
  return `tool(${params})${returnType}`;
}

/**
 * Get a markdown description for a node
 */
export function getNodeDescription(info: NodeInfo): string {
  const lines: string[] = [];

  switch (info.kind) {
    case 'function':
      lines.push(`**${info.name}** (function)`);
      if (info.type) lines.push(`\`${info.type}\``);
      break;

    case 'tool':
      lines.push(`**${info.name}** (tool)`);
      if (info.type) lines.push(`\`${info.type}\``);
      if (info.description) lines.push('', info.description);
      break;

    case 'model':
      lines.push(`**${info.name}** (model)`);
      lines.push('AI model configuration');
      break;

    case 'variable':
      lines.push(`**${info.name}** (variable)`);
      if (info.type) lines.push(`Type: \`${info.type}\``);
      break;

    case 'constant':
      lines.push(`**${info.name}** (constant)`);
      if (info.type) lines.push(`Type: \`${info.type}\``);
      break;

    case 'parameter':
      lines.push(`**${info.name}** (parameter)`);
      if (info.type) lines.push(`Type: \`${info.type}\``);
      break;

    case 'destructured':
      lines.push(`**${info.name}** (destructured field)`);
      if (info.type) lines.push(`Type: \`${info.type}\``);
      if (info.description) lines.push('', info.description);
      break;

    case 'identifier':
      lines.push(`**${info.name}**`);
      break;
  }

  return lines.join('\n');
}

/**
 * Find the identifier name at a given position (1-based line/column)
 * Walks through expressions to find identifiers, not just declarations
 */
export function findIdentifierAtPosition(
  ast: AST.Program,
  line: number,
  column: number
): string | null {
  for (const statement of ast.body) {
    const result = findIdentifierInStatement(statement, line, column);
    if (result) return result;
  }
  return null;
}

function findIdentifierInStatement(
  statement: AST.Statement,
  line: number,
  column: number
): string | null {
  // Check declarations first - return their name if cursor is on declaration
  switch (statement.type) {
    case 'FunctionDeclaration':
      if (isPositionAtDeclarationName(statement.location, 'function', statement.name, line, column)) {
        return statement.name;
      }
      // Check parameters - they appear after the name and '('
      // Parameters don't have reliable locations, skip for now
      // Recurse into body
      for (const s of statement.body.body) {
        const result = findIdentifierInStatement(s, line, column);
        if (result) return result;
      }
      break;

    case 'ToolDeclaration':
      if (isPositionAtDeclarationName(statement.location, 'tool', statement.name, line, column)) {
        return statement.name;
      }
      for (const s of statement.body.body) {
        const result = findIdentifierInStatement(s, line, column);
        if (result) return result;
      }
      break;

    case 'ModelDeclaration':
      if (isPositionAtDeclarationName(statement.location, 'model', statement.name, line, column)) {
        return statement.name;
      }
      break;

    case 'LetDeclaration': {
      // Account for 'private' modifier if present
      const letPrivateOffset = statement.isPrivate ? PRIVATE_OFFSET : 0;
      if (isPositionAtDeclarationName(statement.location, 'let', statement.name, line, column, letPrivateOffset)) {
        return statement.name;
      }
      if (statement.initializer) {
        const result = findIdentifierInExpression(statement.initializer, line, column);
        if (result) return result;
      }
      break;
    }

    case 'ConstDeclaration': {
      // Account for 'private' modifier if present
      const constPrivateOffset = statement.isPrivate ? PRIVATE_OFFSET : 0;
      if (isPositionAtDeclarationName(statement.location, 'const', statement.name, line, column, constPrivateOffset)) {
        return statement.name;
      }
      if (statement.initializer) {
        const result = findIdentifierInExpression(statement.initializer, line, column);
        if (result) return result;
      }
      break;
    }

    case 'DestructuringDeclaration':
      // Fields don't have individual locations, check initializer
      if (statement.initializer) {
        const result = findIdentifierInExpression(statement.initializer, line, column);
        if (result) return result;
      }
      break;

    case 'ExpressionStatement':
      return findIdentifierInExpression(statement.expression, line, column);

    case 'ReturnStatement':
      if (statement.value) {
        return findIdentifierInExpression(statement.value, line, column);
      }
      break;

    case 'IfStatement':
      {
        const condResult = findIdentifierInExpression(statement.test, line, column);
        if (condResult) return condResult;
        for (const s of statement.consequent.body) {
          const result = findIdentifierInStatement(s, line, column);
          if (result) return result;
        }
        if (statement.alternate) {
          for (const s of statement.alternate.body) {
            const result = findIdentifierInStatement(s, line, column);
            if (result) return result;
          }
        }
      }
      break;

    case 'ForInStatement':
      if (isPositionAtDeclarationName(statement.location, 'for', statement.variable, line, column)) {
        return statement.variable;
      }
      {
        const iterResult = findIdentifierInExpression(statement.iterable, line, column);
        if (iterResult) return iterResult;
        for (const s of statement.body.body) {
          const result = findIdentifierInStatement(s, line, column);
          if (result) return result;
        }
      }
      break;

    case 'WhileStatement':
      {
        const testResult = findIdentifierInExpression(statement.test, line, column);
        if (testResult) return testResult;
        for (const s of statement.body.body) {
          const result = findIdentifierInStatement(s, line, column);
          if (result) return result;
        }
      }
      break;

    case 'AsyncStatement':
      // Fire-and-forget async: async do/vibe/ts/function()
      return findIdentifierInExpression(statement.expression, line, column);

    case 'ExportDeclaration':
      // Delegate to the inner declaration
      return findIdentifierInStatement(statement.declaration, line, column);
  }

  return null;
}

function findIdentifierInExpression(
  expr: AST.Expression,
  line: number,
  column: number
): string | null {
  switch (expr.type) {
    case 'Identifier':
      if (isPositionInRange(expr.location, expr.name, line, column)) {
        return expr.name;
      }
      break;

    case 'CallExpression':
      {
        const calleeResult = findIdentifierInExpression(expr.callee, line, column);
        if (calleeResult) return calleeResult;
        for (const arg of expr.arguments) {
          const result = findIdentifierInExpression(arg, line, column);
          if (result) return result;
        }
      }
      break;

    case 'BinaryExpression':
      {
        const leftResult = findIdentifierInExpression(expr.left, line, column);
        if (leftResult) return leftResult;
        const rightResult = findIdentifierInExpression(expr.right, line, column);
        if (rightResult) return rightResult;
      }
      break;

    case 'UnaryExpression':
      return findIdentifierInExpression(expr.argument, line, column);

    case 'MemberExpression':
      {
        const objResult = findIdentifierInExpression(expr.object, line, column);
        if (objResult) return objResult;
        // Don't resolve property - it's not an identifier reference
      }
      break;

    case 'IndexExpression':
      {
        const objResult = findIdentifierInExpression(expr.object, line, column);
        if (objResult) return objResult;
        const indexResult = findIdentifierInExpression(expr.index, line, column);
        if (indexResult) return indexResult;
      }
      break;

    case 'AssignmentExpression':
      {
        const targetResult = findIdentifierInExpression(expr.target, line, column);
        if (targetResult) return targetResult;
        const valueResult = findIdentifierInExpression(expr.value, line, column);
        if (valueResult) return valueResult;
      }
      break;

    case 'ArrayLiteral':
      for (const elem of expr.elements) {
        const result = findIdentifierInExpression(elem, line, column);
        if (result) return result;
      }
      break;

    case 'ObjectLiteral':
      for (const prop of expr.properties) {
        const result = findIdentifierInExpression(prop.value, line, column);
        if (result) return result;
      }
      break;

    case 'VibeExpression':
      {
        const promptResult = findIdentifierInExpression(expr.prompt, line, column);
        if (promptResult) return promptResult;
        // Check model reference - model is an Identifier node
        if (expr.model && expr.model.type === 'Identifier') {
          const modelResult = findIdentifierInExpression(expr.model, line, column);
          if (modelResult) return modelResult;
        }
      }
      break;

    case 'TemplateLiteral':
      for (const part of expr.parts) {
        if (part.type === 'expression') {
          const result = findIdentifierInExpression(part.value, line, column);
          if (result) return result;
        }
      }
      break;

    case 'SliceExpression':
      {
        const objResult = findIdentifierInExpression(expr.object, line, column);
        if (objResult) return objResult;
        if (expr.start) {
          const startResult = findIdentifierInExpression(expr.start, line, column);
          if (startResult) return startResult;
        }
        if (expr.end) {
          const endResult = findIdentifierInExpression(expr.end, line, column);
          if (endResult) return endResult;
        }
      }
      break;

    case 'RangeExpression':
      {
        const startResult = findIdentifierInExpression(expr.start, line, column);
        if (startResult) return startResult;
        const endResult = findIdentifierInExpression(expr.end, line, column);
        if (endResult) return endResult;
      }
      break;
  }

  return null;
}

function isPositionInRange(
  location: { line: number; column: number },
  name: string,
  line: number,
  column: number
): boolean {
  if (location.line !== line) return false;
  const startCol = location.column;
  const endCol = location.column + name.length;
  return column >= startCol && column <= endCol;
}

/**
 * Calculate where the declaration name actually starts (after keyword)
 * Uses centralized KEYWORD_OFFSETS from position.ts
 */
export function getDeclarationNameColumn(kind: string, baseColumn: number): number {
  return baseColumn + (KEYWORD_OFFSETS[kind] ?? 0);
}

function isPositionAtDeclarationName(
  location: { line: number; column: number },
  kind: string,
  name: string,
  line: number,
  column: number,
  extraOffset: number = 0
): boolean {
  if (location.line !== line) return false;
  const nameCol = getDeclarationNameColumn(kind, location.column) + extraOffset;
  const endCol = nameCol + name.length;
  return column >= nameCol && column <= endCol;
}

/**
 * Find the innermost function or tool that contains the given line
 */
function findEnclosingFunctionOrTool(
  ast: AST.Program,
  line: number
): AST.FunctionDeclaration | AST.ToolDeclaration | null {
  let enclosing: AST.FunctionDeclaration | AST.ToolDeclaration | null = null;

  function visitFunctionOrTool(decl: AST.FunctionDeclaration | AST.ToolDeclaration): void {
    // Check if line is after the declaration start
    if (line >= decl.location.line) {
      // Check if we're inside by looking at the body
      const body = decl.body;
      if (body.body.length > 0) {
        const lastStmt = body.body[body.body.length - 1];
        // If line is between start and last statement, we're inside
        if (line <= lastStmt.location.line + 10) { // +10 for closing brace buffer
          enclosing = decl;
        }
      } else if (line <= decl.location.line + 3) {
        // Empty body, small buffer
        enclosing = decl;
      }
    }
    // Recurse into body
    for (const s of decl.body.body) {
      visit(s);
    }
  }

  function visit(statement: AST.Statement): void {
    if (statement.type === 'FunctionDeclaration' || statement.type === 'ToolDeclaration') {
      visitFunctionOrTool(statement);
    } else if (statement.type === 'ExportDeclaration') {
      // Handle exported functions
      const decl = statement.declaration;
      if (decl.type === 'FunctionDeclaration') {
        visitFunctionOrTool(decl);
      }
    } else if (statement.type === 'IfStatement') {
      for (const s of statement.consequent.body) visit(s);
      if (statement.alternate) {
        for (const s of statement.alternate.body) visit(s);
      }
    } else if (statement.type === 'ForInStatement' || statement.type === 'WhileStatement') {
      for (const s of statement.body.body) visit(s);
    }
  }

  for (const statement of ast.body) {
    visit(statement);
  }

  return enclosing;
}

/**
 * Find the declaration of a symbol by name
 * Returns the declaration info with location
 */
export function findDeclaration(
  ast: AST.Program,
  name: string,
  fromLine?: number,
  fromColumn?: number
): DeclarationInfo | null {
  // Collect all declarations (without parameters first)
  const declarations: DeclarationInfo[] = [];

  for (const statement of ast.body) {
    collectDeclarations(statement, declarations);
  }

  // If we have a search position, also add parameters from enclosing function/tool
  if (fromLine !== undefined) {
    const enclosing = findEnclosingFunctionOrTool(ast, fromLine);
    if (enclosing) {
      for (const param of enclosing.params) {
        declarations.push({
          name: param.name,
          kind: 'parameter',
          location: {
            line: enclosing.location.line,
            column: enclosing.location.column,
          },
          node: enclosing,
        });
      }
    }
  }

  // Find matching declaration
  // If multiple exist (shadowing), prefer the one closest before the reference
  const matches = declarations.filter(d => d.name === name);

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Multiple matches - find best one (closest before reference position)
  if (fromLine !== undefined) {
    const before = matches.filter(d => d.location.line <= fromLine);
    if (before.length > 0) {
      // Return the last one before the reference
      return before[before.length - 1];
    }
  }

  // Default to first declaration
  return matches[0];
}

function collectDeclarations(
  statement: AST.Statement,
  declarations: DeclarationInfo[]
): void {
  switch (statement.type) {
    case 'FunctionDeclaration':
      declarations.push({
        name: statement.name,
        kind: 'function',
        location: {
          line: statement.location.line,
          column: getDeclarationNameColumn('function', statement.location.column),
        },
        node: statement,
      });
      // Recurse into body
      for (const s of statement.body.body) {
        collectDeclarations(s, declarations);
      }
      break;

    case 'ToolDeclaration':
      declarations.push({
        name: statement.name,
        kind: 'tool',
        location: {
          line: statement.location.line,
          column: getDeclarationNameColumn('tool', statement.location.column),
        },
        node: statement,
      });
      for (const s of statement.body.body) {
        collectDeclarations(s, declarations);
      }
      break;

    case 'ModelDeclaration':
      declarations.push({
        name: statement.name,
        kind: 'model',
        location: {
          line: statement.location.line,
          column: getDeclarationNameColumn('model', statement.location.column),
        },
        node: statement,
      });
      break;

    case 'LetDeclaration': {
      // Account for 'private' modifier if present: "let private " vs "let "
      const letPrivateOffset = statement.isPrivate ? PRIVATE_OFFSET : 0;
      declarations.push({
        name: statement.name,
        kind: 'variable',
        location: {
          line: statement.location.line,
          column: getDeclarationNameColumn('let', statement.location.column) + letPrivateOffset,
        },
        node: statement,
      });
      break;
    }

    case 'ConstDeclaration': {
      // Account for 'private' modifier if present: "const private " vs "const "
      const constPrivateOffset = statement.isPrivate ? PRIVATE_OFFSET : 0;
      declarations.push({
        name: statement.name,
        kind: 'constant',
        location: {
          line: statement.location.line,
          column: getDeclarationNameColumn('const', statement.location.column) + constPrivateOffset,
        },
        node: statement,
      });
      break;
    }

    case 'DestructuringDeclaration':
      // Each destructured field is a declaration
      // Use const or let keyword offset
      for (const field of statement.fields) {
        declarations.push({
          name: field.name,
          kind: 'destructured',
          location: {
            line: statement.location.line,
            column: getDeclarationNameColumn(statement.isConst ? 'const' : 'let', statement.location.column),
          },
          node: statement,
        });
      }
      break;

    case 'ForInStatement':
      // Loop variable is a declaration
      declarations.push({
        name: statement.variable,
        kind: 'variable',
        location: {
          line: statement.location.line,
          column: getDeclarationNameColumn('for', statement.location.column),
        },
        node: statement,
      });
      for (const s of statement.body.body) {
        collectDeclarations(s, declarations);
      }
      break;

    case 'IfStatement':
      for (const s of statement.consequent.body) {
        collectDeclarations(s, declarations);
      }
      if (statement.alternate) {
        for (const s of statement.alternate.body) {
          collectDeclarations(s, declarations);
        }
      }
      break;

    case 'WhileStatement':
      for (const s of statement.body.body) {
        collectDeclarations(s, declarations);
      }
      break;

    case 'ExportDeclaration':
      // Delegate to the inner declaration
      collectDeclarations(statement.declaration, declarations);
      break;

    case 'ImportDeclaration':
      // Each imported specifier is a declaration in this file
      for (const specifier of statement.specifiers) {
        declarations.push({
          name: specifier.local,
          kind: 'import',
          location: {
            line: statement.location.line,
            column: statement.location.column,
          },
          node: statement,
          importSource: statement.source,
          importSourceType: statement.sourceType,
        });
      }
      break;
  }
}
