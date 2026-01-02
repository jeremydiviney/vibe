import type { SourceLocation } from '../errors';

// ============================================================================
// Base types
// ============================================================================

interface BaseNode {
  location: SourceLocation;
}

// ============================================================================
// AI Provider Types
// ============================================================================

/** Supported AI provider types - strictly typed */
export type AIProviderType = 'anthropic' | 'openai' | 'google';

// ============================================================================
// Context Modes
// ============================================================================

/** Context mode for loops and functions - controls what happens on exit */
export type ContextMode =
  | 'verbose'                    // Keep full history
  | 'forget'                     // Discard all context from block
  | { compress: string | null }; // AI summarizes (with optional prompt)

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
  | ImportDeclaration
  | ExportDeclaration
  | LetDeclaration
  | ConstDeclaration
  | ModelDeclaration
  | FunctionDeclaration
  | ToolDeclaration
  | ReturnStatement
  | IfStatement
  | ForInStatement
  | WhileStatement
  | BlockStatement
  | ExpressionStatement;

export interface ImportSpecifier {
  imported: string;  // Name in the source module
  local: string;     // Name in this module (usually same as imported)
}

export interface ImportDeclaration extends BaseNode {
  type: 'ImportDeclaration';
  specifiers: ImportSpecifier[];
  source: string;              // "./utils.ts" or "./utils.vibe"
  sourceType: 'ts' | 'vibe';   // Determined by file extension
}

export interface ExportDeclaration extends BaseNode {
  type: 'ExportDeclaration';
  declaration: FunctionDeclaration | LetDeclaration | ConstDeclaration | ModelDeclaration;
}

export interface LetDeclaration extends BaseNode {
  type: 'LetDeclaration';
  name: string;
  typeAnnotation: string | null;
  initializer: Expression | null;
}

export interface ConstDeclaration extends BaseNode {
  type: 'ConstDeclaration';
  name: string;
  typeAnnotation: string | null;
  initializer: Expression;
}

export interface ModelDeclaration extends BaseNode {
  type: 'ModelDeclaration';
  name: string;
  config: ModelConfig;
}

export interface ModelConfig extends BaseNode {
  type: 'ModelConfig';
  modelName: Expression | null;
  apiKey: Expression | null;
  url: Expression | null;
  provider: Expression | null;          // AIProviderType - validated in semantic analyzer
  maxRetriesOnError: Expression | null; // Non-negative integer
  thinkingLevel: Expression | null;     // "none" | "low" | "medium" | "high" | "max"
  providedFields: string[];             // For semantic validation
}

export interface FunctionParameter {
  name: string;
  typeAnnotation: string;  // Required: 'text' | 'json' | 'prompt'
}

export interface FunctionDeclaration extends BaseNode {
  type: 'FunctionDeclaration';
  name: string;
  params: FunctionParameter[];
  returnType: string | null;  // Optional return type
  body: BlockStatement;
  contextMode?: ContextMode;  // What happens to context on function exit
}

// Tool parameter with optional description for AI schema
export interface ToolParameter {
  name: string;
  typeAnnotation: string;     // Vibe type or imported TS type name
  description?: string;       // From @param decorator, for AI schema
}

// Tool declaration - function-like but with AI-callable schema
export interface ToolDeclaration extends BaseNode {
  type: 'ToolDeclaration';
  name: string;
  params: ToolParameter[];
  returnType: string | null;  // Optional return type
  description?: string;       // From @description decorator, for AI schema
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

export interface ForInStatement extends BaseNode {
  type: 'ForInStatement';
  variable: string;           // Loop variable name
  iterable: Expression;       // Array, number (range), or [start, end]
  body: BlockStatement;
  contextMode?: ContextMode;  // What happens to context on loop exit
}

export interface WhileStatement extends BaseNode {
  type: 'WhileStatement';
  condition: Expression;
  body: BlockStatement;
  contextMode?: ContextMode;  // What happens to context on loop exit
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
  | TemplateLiteral
  | BooleanLiteral
  | NumberLiteral
  | ObjectLiteral
  | ArrayLiteral
  | RangeExpression
  | BinaryExpression
  | UnaryExpression
  | IndexExpression
  | SliceExpression
  | MemberExpression
  | AssignmentExpression
  | CallExpression
  | DoExpression
  | VibeExpression
  | AskExpression
  | TsBlock;

export interface Identifier extends BaseNode {
  type: 'Identifier';
  name: string;
}

export interface StringLiteral extends BaseNode {
  type: 'StringLiteral';
  value: string;
}

export interface TemplateLiteral extends BaseNode {
  type: 'TemplateLiteral';
  value: string;
}

export interface BooleanLiteral extends BaseNode {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface NumberLiteral extends BaseNode {
  type: 'NumberLiteral';
  value: number;
}

export interface ObjectLiteral extends BaseNode {
  type: 'ObjectLiteral';
  properties: ObjectProperty[];
}

export interface ObjectProperty extends BaseNode {
  type: 'ObjectProperty';
  key: string;
  value: Expression;
}

export interface ArrayLiteral extends BaseNode {
  type: 'ArrayLiteral';
  elements: Expression[];
}

export interface RangeExpression extends BaseNode {
  type: 'RangeExpression';
  start: Expression;
  end: Expression;
}

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '%'           // Arithmetic
  | '==' | '!=' | '<' | '>' | '<=' | '>=' // Comparison
  | 'and' | 'or';                          // Logical

export interface BinaryExpression extends BaseNode {
  type: 'BinaryExpression';
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}

export type UnaryOperator = 'not' | '-';

export interface UnaryExpression extends BaseNode {
  type: 'UnaryExpression';
  operator: UnaryOperator;
  operand: Expression;
}

export interface IndexExpression extends BaseNode {
  type: 'IndexExpression';
  object: Expression;
  index: Expression;
}

export interface SliceExpression extends BaseNode {
  type: 'SliceExpression';
  object: Expression;
  start: Expression | null;  // null for arr[,5]
  end: Expression | null;    // null for arr[3,]
}

export interface MemberExpression extends BaseNode {
  type: 'MemberExpression';
  object: Expression;
  property: string;  // method/property name
}

export interface AssignmentExpression extends BaseNode {
  type: 'AssignmentExpression';
  target: Identifier;
  value: Expression;
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

export interface AskExpression extends BaseNode {
  type: 'AskExpression';
  prompt: Expression;
  model: Expression;
  context: ContextSpecifier;
}

export interface TsBlock extends BaseNode {
  type: 'TsBlock';
  params: string[];  // Parameter names passed from Vibe scope
  body: string;      // Raw TypeScript code inside braces
}

// ============================================================================
// Node type (union of all nodes)
// ============================================================================

export type Node = Program | Statement | Expression;
