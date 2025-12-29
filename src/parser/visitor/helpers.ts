// Visitor helper functions

import type { IToken, CstNode } from 'chevrotain';
import type { SourceLocation } from '../../errors';
import type * as AST from '../../ast';

/**
 * Get location from a token.
 */
export function tokenLocation(token: IToken): SourceLocation {
  return {
    line: token.startLine ?? 1,
    column: token.startColumn ?? 1,
  };
}

/**
 * Extract string value from a string literal token.
 */
export function parseStringLiteral(token: IToken): string {
  const raw = token.image;
  // Remove quotes and unescape
  return raw.slice(1, -1).replace(/\\(.)/g, '$1');
}

/**
 * Extract string value from a template literal token.
 */
export function parseTemplateLiteral(token: IToken): string {
  const raw = token.image;
  // Remove backticks and unescape
  return raw.slice(1, -1).replace(/\\(.)/g, '$1');
}

/**
 * Parse TsBlock token: ts(param1, param2) { body }
 */
export function parseTsBlock(token: IToken): { params: string[]; body: string } {
  const raw = token.image;

  // Find the opening paren
  const parenStart = raw.indexOf('(');
  const parenEnd = raw.indexOf(')');

  // Extract params string and split by comma
  const paramsStr = raw.slice(parenStart + 1, parenEnd).trim();
  const params = paramsStr
    ? paramsStr.split(',').map((p) => p.trim())
    : [];

  // Find the body (between first { and last })
  const braceStart = raw.indexOf('{', parenEnd);
  const braceEnd = raw.lastIndexOf('}');
  const body = raw.slice(braceStart + 1, braceEnd);

  return { params, body };
}

/**
 * Get the first token from a CST node (for position checking).
 */
export function getFirstToken(node: CstNode): IToken | undefined {
  // Recursively find the first token in the CST
  for (const key of Object.keys(node.children ?? {})) {
    const child = (node.children as Record<string, (CstNode | IToken)[]>)[key];
    if (child && child.length > 0) {
      const first = child[0];
      if ('image' in first) {
        // It's a token
        return first as IToken;
      } else if ('children' in first) {
        // It's a CstNode, recurse
        const token = getFirstToken(first as CstNode);
        if (token) return token;
      }
    }
  }
  return undefined;
}

/**
 * Build a left-associative binary expression chain from operands and a single operator type.
 * Used for 'and' and 'or' expressions where all operators are the same.
 */
export function buildBinaryChain(
  operands: AST.Expression[],
  operator: AST.BinaryOperator,
  count: number
): AST.Expression {
  let left = operands[0];
  for (let i = 0; i < count; i++) {
    left = {
      type: 'BinaryExpression',
      operator,
      left,
      right: operands[i + 1],
      location: left.location,
    };
  }
  return left;
}

/**
 * Build a left-associative binary expression chain from operands and mixed operators.
 * Operators are sorted by position to maintain correct order.
 * Used for additive (+, -) and multiplicative (*, /, %) expressions.
 */
export function buildMixedBinaryChain(
  operands: AST.Expression[],
  operators: IToken[]
): AST.Expression {
  if (operators.length === 0) {
    return operands[0];
  }

  const sorted = [...operators].sort((a, b) => a.startOffset - b.startOffset);
  let left = operands[0];

  for (let i = 0; i < sorted.length; i++) {
    left = {
      type: 'BinaryExpression',
      operator: sorted[i].image as AST.BinaryOperator,
      left,
      right: operands[i + 1],
      location: left.location,
    };
  }

  return left;
}

/**
 * Build a single binary expression (for comparison operators where only one is allowed).
 */
export function buildSingleBinary(
  left: AST.Expression,
  right: AST.Expression,
  operator: IToken
): AST.BinaryExpression {
  return {
    type: 'BinaryExpression',
    operator: operator.image as AST.BinaryOperator,
    left,
    right,
    location: left.location,
  };
}

// ============================================================================
// Literal node builders
// ============================================================================

export function makeStringLiteral(token: IToken): AST.StringLiteral {
  return {
    type: 'StringLiteral',
    value: parseStringLiteral(token),
    location: tokenLocation(token),
  };
}

export function makeTemplateLiteral(token: IToken): AST.TemplateLiteral {
  return {
    type: 'TemplateLiteral',
    value: parseTemplateLiteral(token),
    location: tokenLocation(token),
  };
}

export function makeNumberLiteral(token: IToken): AST.NumberLiteral {
  return {
    type: 'NumberLiteral',
    value: parseFloat(token.image),
    location: tokenLocation(token),
  };
}

export function makeBooleanLiteral(token: IToken, value: boolean): AST.BooleanLiteral {
  return {
    type: 'BooleanLiteral',
    value,
    location: tokenLocation(token),
  };
}

export function makeIdentifier(token: IToken): AST.Identifier {
  return {
    type: 'Identifier',
    name: token.image,
    location: tokenLocation(token),
  };
}

export function makeTsBlock(token: IToken): AST.TsBlock {
  const { params, body } = parseTsBlock(token);
  return {
    type: 'TsBlock',
    params,
    body,
    location: tokenLocation(token),
  };
}

// ============================================================================
// Expression node builders
// ============================================================================

export function makeCallExpression(
  callee: AST.Expression,
  args: AST.Expression[]
): AST.CallExpression {
  return {
    type: 'CallExpression',
    callee,
    arguments: args,
    location: callee.location,
  };
}

export function makeIndexExpression(
  object: AST.Expression,
  index: AST.Expression
): AST.IndexExpression {
  return {
    type: 'IndexExpression',
    object,
    index,
    location: object.location,
  };
}

export function makeSliceExpression(
  object: AST.Expression,
  start: AST.Expression | null,
  end: AST.Expression | null
): AST.SliceExpression {
  return {
    type: 'SliceExpression',
    object,
    start,
    end,
    location: object.location,
  };
}

export function makeMemberExpression(
  object: AST.Expression,
  property: string
): AST.MemberExpression {
  return {
    type: 'MemberExpression',
    object,
    property,
    location: object.location,
  };
}

export function makeDoExpression(
  token: IToken,
  prompt: AST.Expression,
  model: AST.Expression,
  context: AST.ContextSpecifier
): AST.DoExpression {
  return {
    type: 'DoExpression',
    prompt,
    model,
    context,
    location: tokenLocation(token),
  };
}

export function makeVibeExpression(token: IToken, prompt: AST.Expression): AST.VibeExpression {
  return {
    type: 'VibeExpression',
    prompt,
    location: tokenLocation(token),
  };
}

export function makeAskExpression(
  token: IToken,
  prompt: AST.Expression,
  model: AST.Expression,
  context: AST.ContextSpecifier
): AST.AskExpression {
  return {
    type: 'AskExpression',
    prompt,
    model,
    context,
    location: tokenLocation(token),
  };
}

export function makeContextSpecifier(
  token: IToken,
  kind: 'default' | 'local' | 'variable',
  variable?: string
): AST.ContextSpecifier {
  return {
    type: 'ContextSpecifier',
    kind,
    variable,
    location: tokenLocation(token),
  } as AST.ContextSpecifier;
}
