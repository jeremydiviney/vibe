import type { CstNode, IToken } from 'chevrotain';
import { vibeParser } from './index';
import * as AST from '../ast';
import type { SourceLocation } from '../errors';

// Get the base visitor class from the parser
const BaseVibeVisitor = vibeParser.getBaseCstVisitorConstructor();

// Helper to get location from a token
function tokenLocation(token: IToken): SourceLocation {
  return {
    line: token.startLine ?? 1,
    column: token.startColumn ?? 1,
  };
}

// Helper to extract string value from a string literal token
function parseStringLiteral(token: IToken): string {
  const raw = token.image;
  // Remove quotes and unescape
  return raw.slice(1, -1).replace(/\\(.)/g, '$1');
}

// Helper to extract string value from a template literal token
function parseTemplateLiteral(token: IToken): string {
  const raw = token.image;
  // Remove backticks and unescape
  return raw.slice(1, -1).replace(/\\(.)/g, '$1');
}

// Helper to parse TsBlock token: ts(param1, param2) { body }
function parseTsBlock(token: IToken): { params: string[]; body: string } {
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

class VibeAstVisitor extends BaseVibeVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  // ============================================================================
  // Program
  // ============================================================================

  program(ctx: { statement?: CstNode[] }): AST.Program {
    const statements = ctx.statement?.map((s) => this.visit(s)) ?? [];
    return {
      type: 'Program',
      body: statements,
      location: statements[0]?.location ?? { line: 1, column: 1 },
    };
  }

  // ============================================================================
  // Statements
  // ============================================================================

  statement(ctx: Record<string, CstNode[]>): AST.Statement {
    if (ctx.importDeclaration) return this.visit(ctx.importDeclaration);
    if (ctx.exportDeclaration) return this.visit(ctx.exportDeclaration);
    if (ctx.letDeclaration) return this.visit(ctx.letDeclaration);
    if (ctx.constDeclaration) return this.visit(ctx.constDeclaration);
    if (ctx.modelDeclaration) return this.visit(ctx.modelDeclaration);
    if (ctx.functionDeclaration) return this.visit(ctx.functionDeclaration);
    if (ctx.returnStatement) return this.visit(ctx.returnStatement);
    if (ctx.ifStatement) return this.visit(ctx.ifStatement);
    if (ctx.forInStatement) return this.visit(ctx.forInStatement);
    if (ctx.whileStatement) return this.visit(ctx.whileStatement);
    if (ctx.blockStatement) return this.visit(ctx.blockStatement);
    if (ctx.expressionStatement) return this.visit(ctx.expressionStatement);
    throw new Error('Unknown statement type');
  }

  importDeclaration(ctx: { Import: IToken[]; importSpecifierList: CstNode[]; StringLiteral: IToken[] }): AST.ImportDeclaration {
    const specifiers = this.visit(ctx.importSpecifierList) as AST.ImportSpecifier[];
    const sourcePath = parseStringLiteral(ctx.StringLiteral[0]);
    const sourceType = sourcePath.endsWith('.vibe') ? 'vibe' : 'ts';

    return {
      type: 'ImportDeclaration',
      specifiers,
      source: sourcePath,
      sourceType,
      location: tokenLocation(ctx.Import[0]),
    };
  }

  importSpecifierList(ctx: { Identifier: IToken[] }): AST.ImportSpecifier[] {
    return ctx.Identifier.map((token) => ({
      imported: token.image,
      local: token.image,  // Same name for now (no "as" support)
    }));
  }

  exportDeclaration(ctx: { Export: IToken[]; functionDeclaration?: CstNode[]; letDeclaration?: CstNode[]; constDeclaration?: CstNode[]; modelDeclaration?: CstNode[] }): AST.ExportDeclaration {
    let declaration: AST.FunctionDeclaration | AST.LetDeclaration | AST.ConstDeclaration | AST.ModelDeclaration;

    if (ctx.functionDeclaration) {
      declaration = this.visit(ctx.functionDeclaration);
    } else if (ctx.letDeclaration) {
      declaration = this.visit(ctx.letDeclaration);
    } else if (ctx.constDeclaration) {
      declaration = this.visit(ctx.constDeclaration);
    } else if (ctx.modelDeclaration) {
      declaration = this.visit(ctx.modelDeclaration);
    } else {
      throw new Error('Unknown export declaration type');
    }

    return {
      type: 'ExportDeclaration',
      declaration,
      location: tokenLocation(ctx.Export[0]),
    };
  }

  letDeclaration(ctx: { Let: IToken[]; Identifier: IToken[]; typeAnnotation?: CstNode[]; expression?: CstNode[] }): AST.LetDeclaration {
    const typeAnnotation = ctx.typeAnnotation ? this.visit(ctx.typeAnnotation) : null;
    return {
      type: 'LetDeclaration',
      name: ctx.Identifier[0].image,
      typeAnnotation,
      initializer: ctx.expression ? this.visit(ctx.expression) : null,
      location: tokenLocation(ctx.Let[0]),
    };
  }

  typeAnnotation(ctx: { TextType?: IToken[]; JsonType?: IToken[]; PromptType?: IToken[]; BooleanType?: IToken[]; NumberType?: IToken[]; LBracket?: IToken[] }): string {
    // Get base type
    const baseType = ctx.TextType ? 'text' : ctx.JsonType ? 'json' : ctx.PromptType ? 'prompt' : ctx.BooleanType ? 'boolean' : 'number';
    // Count array brackets
    const bracketCount = ctx.LBracket?.length ?? 0;
    return baseType + '[]'.repeat(bracketCount);
  }

  constDeclaration(ctx: { Const: IToken[]; Identifier: IToken[]; typeAnnotation?: CstNode[]; expression: CstNode[] }): AST.ConstDeclaration {
    const typeAnnotation = ctx.typeAnnotation ? this.visit(ctx.typeAnnotation) : null;
    return {
      type: 'ConstDeclaration',
      name: ctx.Identifier[0].image,
      typeAnnotation,
      initializer: this.visit(ctx.expression),
      location: tokenLocation(ctx.Const[0]),
    };
  }

  modelDeclaration(ctx: { Model: IToken[]; Identifier: IToken[]; objectLiteral: CstNode[] }): AST.ModelDeclaration {
    const { properties, location } = this.visit(ctx.objectLiteral) as { properties: Map<string, { value: AST.Expression; location: SourceLocation }>; location: SourceLocation };

    // Extract required fields (validation happens in semantic analyzer)
    const modelName = properties.get('name')?.value ?? null;
    const apiKey = properties.get('apiKey')?.value ?? null;
    const url = properties.get('url')?.value ?? null;

    // Track which fields were provided for validation
    const providedFields = [...properties.keys()];

    return {
      type: 'ModelDeclaration',
      name: ctx.Identifier[0].image,
      config: {
        type: 'ModelConfig',
        modelName,
        apiKey,
        url,
        providedFields,
        location: location,
      },
      location: tokenLocation(ctx.Model[0]),
    };
  }

  objectLiteral(ctx: { LBrace: IToken[]; propertyList?: CstNode[] }): { properties: Map<string, { value: AST.Expression; location: SourceLocation }>; location: SourceLocation } {
    const properties = new Map<string, { value: AST.Expression; location: SourceLocation }>();
    if (ctx.propertyList) {
      const propList = this.visit(ctx.propertyList) as AST.ObjectProperty[];
      for (const prop of propList) {
        properties.set(prop.key, { value: prop.value, location: prop.location });
      }
    }
    return {
      properties,
      location: tokenLocation(ctx.LBrace[0]),
    };
  }

  propertyList(ctx: { property: CstNode[] }): AST.ObjectProperty[] {
    return ctx.property.map((p) => this.visit(p));
  }

  property(ctx: { Identifier: IToken[]; expression: CstNode[] }): AST.ObjectProperty {
    return {
      type: 'ObjectProperty',
      key: ctx.Identifier[0].image,
      value: this.visit(ctx.expression),
      location: tokenLocation(ctx.Identifier[0]),
    };
  }

  functionDeclaration(ctx: { Function: IToken[]; Identifier: IToken[]; parameterList?: CstNode[]; typeAnnotation?: CstNode[]; blockStatement: CstNode[] }): AST.FunctionDeclaration {
    const params = ctx.parameterList ? this.visit(ctx.parameterList) : [];
    const returnType = ctx.typeAnnotation ? this.visit(ctx.typeAnnotation) : null;
    return {
      type: 'FunctionDeclaration',
      name: ctx.Identifier[0].image,
      params,
      returnType,
      body: this.visit(ctx.blockStatement),
      location: tokenLocation(ctx.Function[0]),
    };
  }

  parameter(ctx: { Identifier: IToken[]; typeAnnotation: CstNode[] }): AST.FunctionParameter {
    // Type is required
    const typeAnnotation = this.visit(ctx.typeAnnotation);
    return {
      name: ctx.Identifier[0].image,
      typeAnnotation,
    };
  }

  parameterList(ctx: { parameter: CstNode[] }): AST.FunctionParameter[] {
    return ctx.parameter.map((p) => this.visit(p));
  }

  returnStatement(ctx: { Return: IToken[]; expression?: CstNode[] }): AST.ReturnStatement {
    return {
      type: 'ReturnStatement',
      value: ctx.expression ? this.visit(ctx.expression) : null,
      location: tokenLocation(ctx.Return[0]),
    };
  }

  ifStatement(ctx: { If: IToken[]; expression: CstNode[]; blockStatement: CstNode[]; ifStatement?: CstNode[] }): AST.IfStatement {
    let alternate: AST.BlockStatement | AST.IfStatement | null = null;
    if (ctx.ifStatement) {
      alternate = this.visit(ctx.ifStatement);
    } else if (ctx.blockStatement.length > 1) {
      alternate = this.visit(ctx.blockStatement[1]);
    }

    return {
      type: 'IfStatement',
      condition: this.visit(ctx.expression),
      consequent: this.visit(ctx.blockStatement[0]),
      alternate,
      location: tokenLocation(ctx.If[0]),
    };
  }

  forInStatement(ctx: { For: IToken[]; Identifier: IToken[]; expression: CstNode[]; blockStatement: CstNode[] }): AST.ForInStatement {
    return {
      type: 'ForInStatement',
      variable: ctx.Identifier[0].image,
      iterable: this.visit(ctx.expression),
      body: this.visit(ctx.blockStatement),
      location: tokenLocation(ctx.For[0]),
    };
  }

  whileStatement(ctx: { While: IToken[]; expression: CstNode[]; blockStatement: CstNode[] }): AST.WhileStatement {
    return {
      type: 'WhileStatement',
      condition: this.visit(ctx.expression),
      body: this.visit(ctx.blockStatement),
      location: tokenLocation(ctx.While[0]),
    };
  }

  blockStatement(ctx: { LBrace: IToken[]; statement?: CstNode[] }): AST.BlockStatement {
    return {
      type: 'BlockStatement',
      body: ctx.statement?.map((s) => this.visit(s)) ?? [],
      location: tokenLocation(ctx.LBrace[0]),
    };
  }

  expressionStatement(ctx: { expression: CstNode[] }): AST.ExpressionStatement {
    const expr = this.visit(ctx.expression);
    return {
      type: 'ExpressionStatement',
      expression: expr,
      location: expr.location,
    };
  }

  // ============================================================================
  // Expressions
  // ============================================================================

  expression(ctx: { Do?: IToken[]; Vibe?: IToken[]; Ask?: IToken[]; assignmentExpression?: CstNode[]; orExpression?: CstNode[]; expression?: CstNode[]; contextSpecifier?: CstNode[] }): AST.Expression {
    if (ctx.Do) {
      return {
        type: 'DoExpression',
        prompt: this.visit(ctx.expression![0]),
        model: this.visit(ctx.expression![1]),
        context: this.visit(ctx.contextSpecifier!),
        location: tokenLocation(ctx.Do[0]),
      };
    }

    if (ctx.Vibe) {
      return {
        type: 'VibeExpression',
        prompt: this.visit(ctx.expression!),
        location: tokenLocation(ctx.Vibe[0]),
      };
    }

    if (ctx.Ask) {
      return {
        type: 'AskExpression',
        prompt: this.visit(ctx.expression![0]),
        model: this.visit(ctx.expression![1]),
        context: this.visit(ctx.contextSpecifier!),
        location: tokenLocation(ctx.Ask[0]),
      };
    }

    if (ctx.assignmentExpression) {
      return this.visit(ctx.assignmentExpression);
    }

    return this.visit(ctx.orExpression!);
  }

  // Or: or
  orExpression(ctx: { andExpression: CstNode[]; Or?: IToken[] }): AST.Expression {
    let left = this.visit(ctx.andExpression[0]);

    const orCount = ctx.Or?.length ?? 0;
    for (let i = 0; i < orCount; i++) {
      const right = this.visit(ctx.andExpression[i + 1]);
      left = {
        type: 'BinaryExpression',
        operator: 'or' as AST.BinaryOperator,
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  // And: and
  andExpression(ctx: { comparisonExpression: CstNode[]; And?: IToken[] }): AST.Expression {
    let left = this.visit(ctx.comparisonExpression[0]);

    const andCount = ctx.And?.length ?? 0;
    for (let i = 0; i < andCount; i++) {
      const right = this.visit(ctx.comparisonExpression[i + 1]);
      left = {
        type: 'BinaryExpression',
        operator: 'and' as AST.BinaryOperator,
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  // Comparison: == != < > <= >=
  comparisonExpression(ctx: {
    additiveExpression: CstNode[];
    EqualEqual?: IToken[];
    NotEqual?: IToken[];
    LessThan?: IToken[];
    GreaterThan?: IToken[];
    LessEqual?: IToken[];
    GreaterEqual?: IToken[];
  }): AST.Expression {
    const left = this.visit(ctx.additiveExpression[0]);

    // Find which operator was used (if any)
    const operators = [
      ...(ctx.EqualEqual ?? []),
      ...(ctx.NotEqual ?? []),
      ...(ctx.LessThan ?? []),
      ...(ctx.GreaterThan ?? []),
      ...(ctx.LessEqual ?? []),
      ...(ctx.GreaterEqual ?? []),
    ];

    if (operators.length === 0) {
      return left;
    }

    const op = operators[0];
    const right = this.visit(ctx.additiveExpression[1]);
    return {
      type: 'BinaryExpression',
      operator: op.image as AST.BinaryOperator,
      left,
      right,
      location: left.location,
    };
  }

  // Additive: + -
  additiveExpression(ctx: {
    multiplicativeExpression: CstNode[];
    Plus?: IToken[];
    Minus?: IToken[];
  }): AST.Expression {
    let left = this.visit(ctx.multiplicativeExpression[0]);

    // Collect all operators and sort by position
    const operators = [
      ...(ctx.Plus ?? []),
      ...(ctx.Minus ?? []),
    ].sort((a, b) => a.startOffset - b.startOffset);

    for (let i = 0; i < operators.length; i++) {
      const op = operators[i];
      const right = this.visit(ctx.multiplicativeExpression[i + 1]);
      left = {
        type: 'BinaryExpression',
        operator: op.image as AST.BinaryOperator,
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  // Multiplicative: * / %
  multiplicativeExpression(ctx: {
    unaryExpression: CstNode[];
    Star?: IToken[];
    Slash?: IToken[];
    Percent?: IToken[];
  }): AST.Expression {
    let left = this.visit(ctx.unaryExpression[0]);

    // Collect all operators and sort by position
    const operators = [
      ...(ctx.Star ?? []),
      ...(ctx.Slash ?? []),
      ...(ctx.Percent ?? []),
    ].sort((a, b) => a.startOffset - b.startOffset);

    for (let i = 0; i < operators.length; i++) {
      const op = operators[i];
      const right = this.visit(ctx.unaryExpression[i + 1]);
      left = {
        type: 'BinaryExpression',
        operator: op.image as AST.BinaryOperator,
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  // Unary: not, -
  unaryExpression(ctx: { Not?: IToken[]; Minus?: IToken[]; unaryExpression?: CstNode[]; rangeExpression?: CstNode[] }): AST.Expression {
    if (ctx.Not) {
      const operand = this.visit(ctx.unaryExpression!);
      return {
        type: 'UnaryExpression',
        operator: 'not' as AST.UnaryOperator,
        operand,
        location: tokenLocation(ctx.Not[0]),
      };
    }

    if (ctx.Minus && ctx.unaryExpression) {
      const operand = this.visit(ctx.unaryExpression);
      return {
        type: 'UnaryExpression',
        operator: '-' as AST.UnaryOperator,
        operand,
        location: tokenLocation(ctx.Minus[0]),
      };
    }

    return this.visit(ctx.rangeExpression!);
  }

  rangeExpression(ctx: { postfixExpression: CstNode[]; DotDot?: IToken[] }): AST.Expression {
    const left = this.visit(ctx.postfixExpression[0]);

    // If no DotDot, just return the postfix expression
    if (!ctx.DotDot) {
      return left;
    }

    // Range expression: start..end
    const right = this.visit(ctx.postfixExpression[1]);
    return {
      type: 'RangeExpression',
      start: left,
      end: right,
      location: left.location,
    };
  }

  assignmentExpression(ctx: { Identifier: IToken[]; expression: CstNode[] }): AST.AssignmentExpression {
    return {
      type: 'AssignmentExpression',
      target: {
        type: 'Identifier',
        name: ctx.Identifier[0].image,
        location: tokenLocation(ctx.Identifier[0]),
      },
      value: this.visit(ctx.expression),
      location: tokenLocation(ctx.Identifier[0]),
    };
  }

  contextSpecifier(ctx: { Default?: IToken[]; Local?: IToken[]; Identifier?: IToken[] }): AST.ContextSpecifier {
    if (ctx.Default) {
      return {
        type: 'ContextSpecifier',
        kind: 'default',
        location: tokenLocation(ctx.Default[0]),
      };
    }
    if (ctx.Local) {
      return {
        type: 'ContextSpecifier',
        kind: 'local',
        location: tokenLocation(ctx.Local[0]),
      };
    }
    return {
      type: 'ContextSpecifier',
      kind: 'variable',
      variable: ctx.Identifier![0].image,
      location: tokenLocation(ctx.Identifier![0]),
    };
  }

  // Postfix: function calls, indexing, slicing, member access
  postfixExpression(ctx: {
    primaryExpression: CstNode[];
    LParen?: IToken[];
    argumentList?: CstNode[];
    LBracket?: IToken[];
    indexOrSlice?: CstNode[];
    Dot?: IToken[];
    Identifier?: IToken[];
  }): AST.Expression {
    let expr = this.visit(ctx.primaryExpression);

    // Process postfix operations (calls, indexing, slicing, member access)
    // We need to interleave all operations in order
    const callTokens = ctx.LParen ?? [];
    const bracketTokens = ctx.LBracket ?? [];
    const dotTokens = ctx.Dot ?? [];
    const identifierTokens = ctx.Identifier ?? [];

    const allOperations: Array<{ type: 'call' | 'bracket' | 'member'; index: number; offset: number }> = [
      ...callTokens.map((t, i) => ({ type: 'call' as const, index: i, offset: t.startOffset })),
      ...bracketTokens.map((t, i) => ({ type: 'bracket' as const, index: i, offset: t.startOffset })),
      ...dotTokens.map((t, i) => ({ type: 'member' as const, index: i, offset: t.startOffset })),
    ].sort((a, b) => a.offset - b.offset);

    for (const op of allOperations) {
      if (op.type === 'call') {
        const args = ctx.argumentList?.[op.index] ? this.visit(ctx.argumentList[op.index]) : [];
        expr = {
          type: 'CallExpression',
          callee: expr,
          arguments: args,
          location: expr.location,
        };
      } else if (op.type === 'bracket') {
        // Bracket access (index or slice)
        const indexOrSliceResult = this.visit(ctx.indexOrSlice![op.index]) as
          | { kind: 'index'; index: AST.Expression }
          | { kind: 'slice'; start: AST.Expression | null; end: AST.Expression | null };

        if (indexOrSliceResult.kind === 'index') {
          expr = {
            type: 'IndexExpression',
            object: expr,
            index: indexOrSliceResult.index,
            location: expr.location,
          };
        } else {
          expr = {
            type: 'SliceExpression',
            object: expr,
            start: indexOrSliceResult.start,
            end: indexOrSliceResult.end,
            location: expr.location,
          };
        }
      } else {
        // Member access
        const propertyName = identifierTokens[op.index].image;
        expr = {
          type: 'MemberExpression',
          object: expr,
          property: propertyName,
          location: expr.location,
        };
      }
    }

    return expr;
  }

  // Index or slice inside brackets
  indexOrSlice(ctx: { Comma?: IToken[]; expression?: CstNode[] }):
    | { kind: 'index'; index: AST.Expression }
    | { kind: 'slice'; start: AST.Expression | null; end: AST.Expression | null } {
    const hasComma = (ctx.Comma?.length ?? 0) > 0;
    const expressions = ctx.expression ?? [];

    if (!hasComma) {
      // Single index: [expr]
      return { kind: 'index', index: this.visit(expressions[0]) };
    }

    // Slice: check if comma comes first
    // If expressions.length === 1 and comma exists, it's either [,expr] or [expr,]
    // If expressions.length === 2 and comma exists, it's [expr,expr]
    // If expressions.length === 0 and comma exists, it's invalid (shouldn't happen)

    if (expressions.length === 0) {
      // [,] - both omitted (shouldn't happen with current parser)
      return { kind: 'slice', start: null, end: null };
    }

    if (expressions.length === 1) {
      // Either [,expr] or [expr,]
      // We need to check if comma comes before or after the expression
      const commaOffset = ctx.Comma![0].startOffset;
      // Get the expression's approximate offset from its location
      const exprResult = this.visit(expressions[0]);
      // If the comma is before the expression, it's [,expr]
      // Use the LBracket position is not available here, so we check expression's start
      // Actually, we need to compare comma position with expression position
      // For [,expr]: comma offset < expression offset
      // For [expr,]: expression offset < comma offset
      // The expression CstNode doesn't have offset directly, but we can check the first token
      const firstExprToken = this.getFirstToken(expressions[0]);
      if (firstExprToken && commaOffset < firstExprToken.startOffset) {
        // [,expr]
        return { kind: 'slice', start: null, end: exprResult };
      } else {
        // [expr,]
        return { kind: 'slice', start: exprResult, end: null };
      }
    }

    // [expr,expr]
    return {
      kind: 'slice',
      start: this.visit(expressions[0]),
      end: this.visit(expressions[1]),
    };
  }

  // Helper to get the first token from a CST node (for position checking)
  private getFirstToken(node: CstNode): IToken | undefined {
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
          const token = this.getFirstToken(first as CstNode);
          if (token) return token;
        }
      }
    }
    return undefined;
  }

  argumentList(ctx: { expression: CstNode[] }): AST.Expression[] {
    return ctx.expression.map((e) => this.visit(e));
  }

  primaryExpression(ctx: {
    TsBlock?: IToken[];
    StringLiteral?: IToken[];
    TemplateLiteral?: IToken[];
    NumberLiteral?: IToken[];
    True?: IToken[];
    False?: IToken[];
    Identifier?: IToken[];
    objectLiteralExpr?: CstNode[];
    arrayLiteral?: CstNode[];
    expression?: CstNode[];
  }): AST.Expression {
    if (ctx.TsBlock) {
      const { params, body } = parseTsBlock(ctx.TsBlock[0]);
      return {
        type: 'TsBlock',
        params,
        body,
        location: tokenLocation(ctx.TsBlock[0]),
      };
    }
    if (ctx.StringLiteral) {
      return {
        type: 'StringLiteral',
        value: parseStringLiteral(ctx.StringLiteral[0]),
        location: tokenLocation(ctx.StringLiteral[0]),
      };
    }

    if (ctx.TemplateLiteral) {
      return {
        type: 'TemplateLiteral',
        value: parseTemplateLiteral(ctx.TemplateLiteral[0]),
        location: tokenLocation(ctx.TemplateLiteral[0]),
      };
    }

    if (ctx.NumberLiteral) {
      return {
        type: 'NumberLiteral',
        value: parseFloat(ctx.NumberLiteral[0].image),
        location: tokenLocation(ctx.NumberLiteral[0]),
      };
    }

    if (ctx.True) {
      return {
        type: 'BooleanLiteral',
        value: true,
        location: tokenLocation(ctx.True[0]),
      };
    }

    if (ctx.False) {
      return {
        type: 'BooleanLiteral',
        value: false,
        location: tokenLocation(ctx.False[0]),
      };
    }

    if (ctx.objectLiteralExpr) {
      return this.visit(ctx.objectLiteralExpr);
    }

    if (ctx.arrayLiteral) {
      return this.visit(ctx.arrayLiteral);
    }

    if (ctx.Identifier) {
      return {
        type: 'Identifier',
        name: ctx.Identifier[0].image,
        location: tokenLocation(ctx.Identifier[0]),
      };
    }

    // Grouped expression
    if (ctx.expression) {
      return this.visit(ctx.expression);
    }

    throw new Error('Unknown primary expression');
  }

  objectLiteralExpr(ctx: { LBrace: IToken[]; propertyList?: CstNode[] }): AST.ObjectLiteral {
    const properties: AST.ObjectProperty[] = ctx.propertyList
      ? this.visit(ctx.propertyList)
      : [];
    return {
      type: 'ObjectLiteral',
      properties,
      location: tokenLocation(ctx.LBrace[0]),
    };
  }

  arrayLiteral(ctx: { LBracket: IToken[]; elementList?: CstNode[] }): AST.ArrayLiteral {
    const elements: AST.Expression[] = ctx.elementList
      ? this.visit(ctx.elementList)
      : [];
    return {
      type: 'ArrayLiteral',
      elements,
      location: tokenLocation(ctx.LBracket[0]),
    };
  }

  elementList(ctx: { expression: CstNode[] }): AST.Expression[] {
    return ctx.expression.map((e) => this.visit(e));
  }
}

// Export a singleton visitor instance
export const vibeAstVisitor = new VibeAstVisitor();
