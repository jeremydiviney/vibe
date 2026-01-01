import type { CstNode, IToken } from 'chevrotain';
import { vibeParser } from './index';
import * as AST from '../ast';
import type { SourceLocation } from '../errors';
import {
  tokenLocation,
  parseStringLiteral,
  getFirstToken,
  buildBinaryChain,
  buildMixedBinaryChain,
  buildSingleBinary,
  makeStringLiteral,
  makeTemplateLiteral,
  makeNumberLiteral,
  makeBooleanLiteral,
  makeIdentifier,
  makeTsBlock,
  makeCallExpression,
  makeIndexExpression,
  makeSliceExpression,
  makeMemberExpression,
  makeDoExpression,
  makeVibeExpression,
  makeAskExpression,
  makeContextSpecifier,
} from './visitor/helpers';

// Get the base visitor class from the parser
const BaseVibeVisitor = vibeParser.getBaseCstVisitorConstructor();

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
    const decl = ctx.functionDeclaration ?? ctx.letDeclaration ?? ctx.constDeclaration ?? ctx.modelDeclaration;
    if (!decl) throw new Error('Unknown export declaration type');
    return { type: 'ExportDeclaration', declaration: this.visit(decl), location: tokenLocation(ctx.Export[0]) };
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
    return {
      type: 'ModelDeclaration',
      name: ctx.Identifier[0].image,
      config: {
        type: 'ModelConfig',
        modelName: properties.get('name')?.value ?? null,
        apiKey: properties.get('apiKey')?.value ?? null,
        url: properties.get('url')?.value ?? null,
        provider: properties.get('provider')?.value ?? null,
        maxRetriesOnError: properties.get('maxRetriesOnError')?.value ?? null,
        thinkingLevel: properties.get('thinkingLevel')?.value ?? null,
        providedFields: [...properties.keys()],
        location,
      },
      location: tokenLocation(ctx.Model[0]),
    };
  }

  objectLiteral(ctx: { LBrace: IToken[]; propertyList?: CstNode[] }): { properties: Map<string, { value: AST.Expression; location: SourceLocation }>; location: SourceLocation } {
    const props = ctx.propertyList ? this.visit(ctx.propertyList) as AST.ObjectProperty[] : [];
    const properties = new Map(props.map((p) => [p.key, { value: p.value, location: p.location }]));
    return { properties, location: tokenLocation(ctx.LBrace[0]) };
  }

  propertyList(ctx: { property: CstNode[] }): AST.ObjectProperty[] {
    return ctx.property.map((p) => this.visit(p));
  }

  property(ctx: { Identifier: IToken[]; expression: CstNode[] }): AST.ObjectProperty {
    return { type: 'ObjectProperty', key: ctx.Identifier[0].image, value: this.visit(ctx.expression), location: tokenLocation(ctx.Identifier[0]) };
  }

  functionDeclaration(ctx: { Function: IToken[]; Identifier: IToken[]; parameterList?: CstNode[]; typeAnnotation?: CstNode[]; blockStatement: CstNode[]; contextMode?: CstNode[] }): AST.FunctionDeclaration {
    return {
      type: 'FunctionDeclaration', name: ctx.Identifier[0].image,
      params: ctx.parameterList ? this.visit(ctx.parameterList) : [],
      returnType: ctx.typeAnnotation ? this.visit(ctx.typeAnnotation) : null,
      body: this.visit(ctx.blockStatement), location: tokenLocation(ctx.Function[0]),
      contextMode: ctx.contextMode ? this.visit(ctx.contextMode) : undefined,
    };
  }

  parameter(ctx: { Identifier: IToken[]; typeAnnotation: CstNode[] }): AST.FunctionParameter {
    return { name: ctx.Identifier[0].image, typeAnnotation: this.visit(ctx.typeAnnotation) };
  }

  parameterList(ctx: { parameter: CstNode[] }): AST.FunctionParameter[] {
    return ctx.parameter.map((p) => this.visit(p));
  }

  returnStatement(ctx: { Return: IToken[]; expression?: CstNode[] }): AST.ReturnStatement {
    return { type: 'ReturnStatement', value: ctx.expression ? this.visit(ctx.expression) : null, location: tokenLocation(ctx.Return[0]) };
  }

  ifStatement(ctx: { If: IToken[]; expression: CstNode[]; blockStatement: CstNode[]; ifStatement?: CstNode[] }): AST.IfStatement {
    const alternate = ctx.ifStatement ? this.visit(ctx.ifStatement) : ctx.blockStatement.length > 1 ? this.visit(ctx.blockStatement[1]) : null;
    return { type: 'IfStatement', condition: this.visit(ctx.expression), consequent: this.visit(ctx.blockStatement[0]), alternate, location: tokenLocation(ctx.If[0]) };
  }

  forInStatement(ctx: { For: IToken[]; Identifier: IToken[]; expression: CstNode[]; blockStatement: CstNode[]; contextMode?: CstNode[] }): AST.ForInStatement {
    return {
      type: 'ForInStatement',
      variable: ctx.Identifier[0].image,
      iterable: this.visit(ctx.expression),
      body: this.visit(ctx.blockStatement),
      location: tokenLocation(ctx.For[0]),
      contextMode: ctx.contextMode ? this.visit(ctx.contextMode) : undefined,
    };
  }

  whileStatement(ctx: { While: IToken[]; expression: CstNode[]; blockStatement: CstNode[]; contextMode?: CstNode[] }): AST.WhileStatement {
    return {
      type: 'WhileStatement',
      condition: this.visit(ctx.expression),
      body: this.visit(ctx.blockStatement),
      location: tokenLocation(ctx.While[0]),
      contextMode: ctx.contextMode ? this.visit(ctx.contextMode) : undefined,
    };
  }

  contextMode(ctx: { Forget?: IToken[]; Verbose?: IToken[]; Compress?: IToken[]; StringLiteral?: IToken[] }): AST.ContextMode {
    if (ctx.Forget) return 'forget';
    if (ctx.Verbose) return 'verbose';
    // Compress with optional prompt
    const prompt = ctx.StringLiteral ? parseStringLiteral(ctx.StringLiteral[0]) : null;
    return { compress: prompt };
  }

  blockStatement(ctx: { LBrace: IToken[]; statement?: CstNode[] }): AST.BlockStatement {
    return { type: 'BlockStatement', body: ctx.statement?.map((s) => this.visit(s)) ?? [], location: tokenLocation(ctx.LBrace[0]) };
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
      return makeDoExpression(ctx.Do[0], this.visit(ctx.expression![0]), this.visit(ctx.expression![1]), this.visit(ctx.contextSpecifier!));
    }
    if (ctx.Vibe) {
      return makeVibeExpression(ctx.Vibe[0], this.visit(ctx.expression!));
    }
    if (ctx.Ask) {
      return makeAskExpression(ctx.Ask[0], this.visit(ctx.expression![0]), this.visit(ctx.expression![1]), this.visit(ctx.contextSpecifier!));
    }
    if (ctx.assignmentExpression) return this.visit(ctx.assignmentExpression);
    return this.visit(ctx.orExpression!);
  }

  // Or: or
  orExpression(ctx: { andExpression: CstNode[]; Or?: IToken[] }): AST.Expression {
    const operands = ctx.andExpression.map((n) => this.visit(n));
    return buildBinaryChain(operands, 'or', ctx.Or?.length ?? 0);
  }

  // And: and
  andExpression(ctx: { comparisonExpression: CstNode[]; And?: IToken[] }): AST.Expression {
    const operands = ctx.comparisonExpression.map((n) => this.visit(n));
    return buildBinaryChain(operands, 'and', ctx.And?.length ?? 0);
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
    const operators = [
      ...(ctx.EqualEqual ?? []),
      ...(ctx.NotEqual ?? []),
      ...(ctx.LessThan ?? []),
      ...(ctx.GreaterThan ?? []),
      ...(ctx.LessEqual ?? []),
      ...(ctx.GreaterEqual ?? []),
    ];

    if (operators.length === 0) return left;
    return buildSingleBinary(left, this.visit(ctx.additiveExpression[1]), operators[0]);
  }

  // Additive: + -
  additiveExpression(ctx: {
    multiplicativeExpression: CstNode[];
    Plus?: IToken[];
    Minus?: IToken[];
  }): AST.Expression {
    const operands = ctx.multiplicativeExpression.map((n) => this.visit(n));
    const operators = [...(ctx.Plus ?? []), ...(ctx.Minus ?? [])];
    return buildMixedBinaryChain(operands, operators);
  }

  // Multiplicative: * / %
  multiplicativeExpression(ctx: {
    unaryExpression: CstNode[];
    Star?: IToken[];
    Slash?: IToken[];
    Percent?: IToken[];
  }): AST.Expression {
    const operands = ctx.unaryExpression.map((n) => this.visit(n));
    const operators = [...(ctx.Star ?? []), ...(ctx.Slash ?? []), ...(ctx.Percent ?? [])];
    return buildMixedBinaryChain(operands, operators);
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
    if (ctx.Default) return makeContextSpecifier(ctx.Default[0], 'default');
    if (ctx.Local) return makeContextSpecifier(ctx.Local[0], 'local');
    return makeContextSpecifier(ctx.Identifier![0], 'variable', ctx.Identifier![0].image);
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
    const callTokens = ctx.LParen ?? [];
    const bracketTokens = ctx.LBracket ?? [];
    const dotTokens = ctx.Dot ?? [];
    const identifierTokens = ctx.Identifier ?? [];

    const allOps = [
      ...callTokens.map((t, i) => ({ type: 'call' as const, index: i, offset: t.startOffset })),
      ...bracketTokens.map((t, i) => ({ type: 'bracket' as const, index: i, offset: t.startOffset })),
      ...dotTokens.map((t, i) => ({ type: 'member' as const, index: i, offset: t.startOffset })),
    ].sort((a, b) => a.offset - b.offset);

    for (const op of allOps) {
      if (op.type === 'call') {
        expr = makeCallExpression(expr, ctx.argumentList?.[op.index] ? this.visit(ctx.argumentList[op.index]) : []);
      } else if (op.type === 'bracket') {
        const result = this.visit(ctx.indexOrSlice![op.index]) as
          | { kind: 'index'; index: AST.Expression }
          | { kind: 'slice'; start: AST.Expression | null; end: AST.Expression | null };
        expr = result.kind === 'index'
          ? makeIndexExpression(expr, result.index)
          : makeSliceExpression(expr, result.start, result.end);
      } else {
        expr = makeMemberExpression(expr, identifierTokens[op.index].image);
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
      const firstExprToken = getFirstToken(expressions[0]);
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
    if (ctx.TsBlock) return makeTsBlock(ctx.TsBlock[0]);
    if (ctx.StringLiteral) return makeStringLiteral(ctx.StringLiteral[0]);
    if (ctx.TemplateLiteral) return makeTemplateLiteral(ctx.TemplateLiteral[0]);
    if (ctx.NumberLiteral) return makeNumberLiteral(ctx.NumberLiteral[0]);
    if (ctx.True) return makeBooleanLiteral(ctx.True[0], true);
    if (ctx.False) return makeBooleanLiteral(ctx.False[0], false);
    if (ctx.objectLiteralExpr) return this.visit(ctx.objectLiteralExpr);
    if (ctx.arrayLiteral) return this.visit(ctx.arrayLiteral);
    if (ctx.Identifier) return makeIdentifier(ctx.Identifier[0]);
    if (ctx.expression) return this.visit(ctx.expression);
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
