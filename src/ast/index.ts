import type { SourceLocation } from '../errors';

// ============================================================================
// Base types
// ============================================================================

interface BaseNode {
  location: SourceLocation;
}

// ============================================================================
// Program
// ============================================================================

export interface Program extends BaseNode {
  type: 'Program';
  body: Statement[];
}

// ============================================================================
// Statements
// ============================================================================

export type Statement =
  | LetDeclaration
  | ConstDeclaration
  | ModelDeclaration
  | FunctionDeclaration
  | ReturnStatement
  | IfStatement
  | BreakStatement
  | ContinueStatement
  | BlockStatement
  | ExpressionStatement;

export interface LetDeclaration extends BaseNode {
  type: 'LetDeclaration';
  name: string;
  initializer: Expression | null;
}

export interface ConstDeclaration extends BaseNode {
  type: 'ConstDeclaration';
  name: string;
  initializer: Expression;
}

export interface ModelDeclaration extends BaseNode {
  type: 'ModelDeclaration';
  name: string;
  config: ModelConfig;
}

export interface ModelConfig extends BaseNode {
  type: 'ModelConfig';
  properties: ModelProperty[];
}

export interface ModelProperty extends BaseNode {
  type: 'ModelProperty';
  key: string;
  value: Expression;
}

export interface FunctionDeclaration extends BaseNode {
  type: 'FunctionDeclaration';
  name: string;
  params: string[];
  body: BlockStatement;
}

export interface ReturnStatement extends BaseNode {
  type: 'ReturnStatement';
  value: Expression | null;
}

export interface IfStatement extends BaseNode {
  type: 'IfStatement';
  condition: Expression;
  consequent: BlockStatement;
  alternate: BlockStatement | IfStatement | null;
}

export interface BreakStatement extends BaseNode {
  type: 'BreakStatement';
}

export interface ContinueStatement extends BaseNode {
  type: 'ContinueStatement';
}

export interface BlockStatement extends BaseNode {
  type: 'BlockStatement';
  body: Statement[];
}

export interface ExpressionStatement extends BaseNode {
  type: 'ExpressionStatement';
  expression: Expression;
}

// ============================================================================
// Expressions
// ============================================================================

export type Expression =
  | Identifier
  | StringLiteral
  | BooleanLiteral
  | CallExpression
  | DoExpression
  | VibeExpression;

export interface Identifier extends BaseNode {
  type: 'Identifier';
  name: string;
}

export interface StringLiteral extends BaseNode {
  type: 'StringLiteral';
  value: string;
}

export interface BooleanLiteral extends BaseNode {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface CallExpression extends BaseNode {
  type: 'CallExpression';
  callee: Expression;
  arguments: Expression[];
}

export interface DoExpression extends BaseNode {
  type: 'DoExpression';
  prompt: Expression;
  model: Expression;
  context: ContextSpecifier;
}

export interface ContextSpecifier extends BaseNode {
  type: 'ContextSpecifier';
  kind: 'default' | 'local' | 'variable';
  variable?: string;
}

export interface VibeExpression extends BaseNode {
  type: 'VibeExpression';
  prompt: Expression;
}

// ============================================================================
// Node type (union of all nodes)
// ============================================================================

export type Node = Program | Statement | Expression;
