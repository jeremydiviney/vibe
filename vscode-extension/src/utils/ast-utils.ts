import type * as AST from '../../../src/ast';

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
