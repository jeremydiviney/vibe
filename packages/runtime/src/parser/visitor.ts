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
  makeNullLiteral,
  makeIdentifier,
  makeTsBlock,
  makeCallExpression,
  makeIndexExpression,
  makeSliceExpression,
  makeMemberExpression,
  makeVibeExpression,
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
    if (ctx.asyncStatement) return this.visit(ctx.asyncStatement);
    if (ctx.letDeclaration) return this.visit(ctx.letDeclaration);
    if (ctx.constDeclaration) return this.visit(ctx.constDeclaration);
    if (ctx.modelDeclaration) return this.visit(ctx.modelDeclaration);
    if (ctx.functionDeclaration) return this.visit(ctx.functionDeclaration);
    if (ctx.toolDeclaration) return this.visit(ctx.toolDeclaration);
    if (ctx.returnStatement) return this.visit(ctx.returnStatement);
    if (ctx.breakStatement) return this.visit(ctx.breakStatement);
    if (ctx.throwStatement) return this.visit(ctx.throwStatement);
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

  asyncStatement(ctx: { Async: IToken[]; asyncLetDeclaration?: CstNode[]; asyncConstDeclaration?: CstNode[]; asyncExpression?: CstNode[] }): AST.Statement {
    if (ctx.asyncLetDeclaration) {
      return this.visit(ctx.asyncLetDeclaration);
    }
    if (ctx.asyncConstDeclaration) {
      return this.visit(ctx.asyncConstDeclaration);
    }
    // Standalone async expression (fire-and-forget)
    const expr = this.visit(ctx.asyncExpression!) as AST.VibeExpression | AST.TsBlock | AST.CallExpression;
    return {
      type: 'AsyncStatement',
      expression: expr,
      location: tokenLocation(ctx.Async[0]),
    };
  }

  asyncLetDeclaration(ctx: { Let: IToken[]; Private?: IToken[]; Identifier?: IToken[]; typeAnnotation?: CstNode[]; asyncExpression?: CstNode[]; destructuringPattern?: CstNode[] }): AST.LetDeclaration | AST.DestructuringDeclaration {
    // Check for destructuring pattern
    if (ctx.destructuringPattern) {
      const fields = this.visit(ctx.destructuringPattern) as AST.DestructuringField[];
      return {
        type: 'DestructuringDeclaration',
        fields,
        initializer: this.visit(ctx.asyncExpression!),
        isConst: false,
        isAsync: true,
        location: tokenLocation(ctx.Let[0]),
      };
    }

    // Regular let declaration
    const typeAnnotation = ctx.typeAnnotation ? this.visit(ctx.typeAnnotation) : null;
    const isPrivate = ctx.Private !== undefined;
    const node: AST.LetDeclaration = {
      type: 'LetDeclaration',
      name: ctx.Identifier![0].image,
      typeAnnotation,
      initializer: this.visit(ctx.asyncExpression!),
      isAsync: true,
      location: tokenLocation(ctx.Let[0]),
    };
    if (isPrivate) {
      node.isPrivate = true;
    }
    return node;
  }

  asyncConstDeclaration(ctx: { Const: IToken[]; Private?: IToken[]; Identifier?: IToken[]; typeAnnotation?: CstNode[]; asyncExpression: CstNode[]; destructuringPattern?: CstNode[] }): AST.ConstDeclaration | AST.DestructuringDeclaration {
    // Check for destructuring pattern
    if (ctx.destructuringPattern) {
      const fields = this.visit(ctx.destructuringPattern) as AST.DestructuringField[];
      return {
        type: 'DestructuringDeclaration',
        fields,
        initializer: this.visit(ctx.asyncExpression),
        isConst: true,
        isAsync: true,
        location: tokenLocation(ctx.Const[0]),
      };
    }

    // Regular const declaration
    const typeAnnotation = ctx.typeAnnotation ? this.visit(ctx.typeAnnotation) : null;
    const isPrivate = ctx.Private !== undefined;
    const node: AST.ConstDeclaration = {
      type: 'ConstDeclaration',
      name: ctx.Identifier![0].image,
      typeAnnotation,
      initializer: this.visit(ctx.asyncExpression),
      isAsync: true,
      location: tokenLocation(ctx.Const[0]),
    };
    if (isPrivate) {
      node.isPrivate = true;
    }
    return node;
  }

  asyncExpression(ctx: { Vibe?: IToken[]; Do?: IToken[]; TsBlock?: IToken[]; expression?: CstNode[]; vibeModifiers?: CstNode[]; postfixExpression?: CstNode[] }): AST.Expression {
    if (ctx.Vibe) {
      const prompt = this.visit(ctx.expression![0]);
      const modifiers = this.visit(ctx.vibeModifiers![0]) as { model: AST.Expression | null; context: AST.ContextSpecifier | null };
      return makeVibeExpression(ctx.Vibe[0], prompt, modifiers.model, modifiers.context, 'vibe');
    }
    if (ctx.Do) {
      const prompt = this.visit(ctx.expression![0]);
      const modifiers = this.visit(ctx.vibeModifiers![0]) as { model: AST.Expression | null; context: AST.ContextSpecifier | null };
      return makeVibeExpression(ctx.Do[0], prompt, modifiers.model, modifiers.context, 'do');
    }
    if (ctx.TsBlock) {
      return makeTsBlock(ctx.TsBlock[0]);
    }
    if (ctx.postfixExpression) {
      return this.visit(ctx.postfixExpression);
    }
    throw new Error('Unknown async expression type');
  }

  letDeclaration(ctx: { Let: IToken[]; Private?: IToken[]; Identifier?: IToken[]; typeAnnotation?: CstNode[]; expression?: CstNode[]; destructuringPattern?: CstNode[] }): AST.LetDeclaration | AST.DestructuringDeclaration {
    // Check for destructuring pattern
    if (ctx.destructuringPattern) {
      const fields = this.visit(ctx.destructuringPattern) as AST.DestructuringField[];
      return {
        type: 'DestructuringDeclaration',
        fields,
        initializer: this.visit(ctx.expression!),
        isConst: false,
        location: tokenLocation(ctx.Let[0]),
      };
    }

    // Regular let declaration
    const typeAnnotation = ctx.typeAnnotation ? this.visit(ctx.typeAnnotation) : null;
    const isPrivate = ctx.Private !== undefined;
    const node: AST.LetDeclaration = {
      type: 'LetDeclaration',
      name: ctx.Identifier![0].image,
      typeAnnotation,
      initializer: ctx.expression ? this.visit(ctx.expression) : null,
      location: tokenLocation(ctx.Let[0]),
    };
    if (isPrivate) {
      node.isPrivate = true;
    }
    return node;
  }

  typeAnnotation(ctx: { TextType?: IToken[]; JsonType?: IToken[]; PromptType?: IToken[]; BooleanType?: IToken[]; NumberType?: IToken[]; Model?: IToken[]; LBracket?: IToken[] }): string {
    // Get base type
    const baseType = ctx.TextType ? 'text' : ctx.JsonType ? 'json' : ctx.PromptType ? 'prompt' : ctx.BooleanType ? 'boolean' : ctx.NumberType ? 'number' : 'model';
    // Count array brackets
    const bracketCount = ctx.LBracket?.length ?? 0;
    return baseType + '[]'.repeat(bracketCount);
  }

  constDeclaration(ctx: { Const: IToken[]; Private?: IToken[]; Identifier?: IToken[]; typeAnnotation?: CstNode[]; expression: CstNode[]; destructuringPattern?: CstNode[] }): AST.ConstDeclaration | AST.DestructuringDeclaration {
    // Check for destructuring pattern
    if (ctx.destructuringPattern) {
      const fields = this.visit(ctx.destructuringPattern) as AST.DestructuringField[];
      return {
        type: 'DestructuringDeclaration',
        fields,
        initializer: this.visit(ctx.expression),
        isConst: true,
        location: tokenLocation(ctx.Const[0]),
      };
    }

    // Regular const declaration
    const typeAnnotation = ctx.typeAnnotation ? this.visit(ctx.typeAnnotation) : null;
    const isPrivate = ctx.Private !== undefined;
    const node: AST.ConstDeclaration = {
      type: 'ConstDeclaration',
      name: ctx.Identifier![0].image,
      typeAnnotation,
      initializer: this.visit(ctx.expression),
      location: tokenLocation(ctx.Const[0]),
    };
    if (isPrivate) {
      node.isPrivate = true;
    }
    return node;
  }

  destructuringPattern(ctx: { destructuringField: CstNode[] }): AST.DestructuringField[] {
    return ctx.destructuringField.map((f) => this.visit(f));
  }

  destructuringField(ctx: { Private?: IToken[]; Identifier: IToken[]; typeAnnotation: CstNode[] }): AST.DestructuringField {
    const isPrivate = ctx.Private !== undefined;
    const field: AST.DestructuringField = {
      name: ctx.Identifier[0].image,
      type: this.visit(ctx.typeAnnotation),
    };
    if (isPrivate) {
      field.isPrivate = true;
    }
    return field;
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
        tools: properties.get('tools')?.value ?? null,
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

  functionDeclaration(ctx: { Function: IToken[]; Identifier: IToken[]; parameterList?: CstNode[]; typeAnnotation?: CstNode[]; blockStatement: CstNode[] }): AST.FunctionDeclaration {
    return {
      type: 'FunctionDeclaration', name: ctx.Identifier[0].image,
      params: ctx.parameterList ? this.visit(ctx.parameterList) : [],
      returnType: ctx.typeAnnotation ? this.visit(ctx.typeAnnotation) : null,
      body: this.visit(ctx.blockStatement), location: tokenLocation(ctx.Function[0]),
    };
  }

  toolDeclaration(ctx: { Tool: IToken[]; Identifier: IToken[]; toolParameterList?: CstNode[]; toolTypeAnnotation?: CstNode[]; toolMetadata?: CstNode[]; blockStatement: CstNode[] }): AST.ToolDeclaration {
    // Build param descriptions map from @param metadata
    const paramDescriptions: Record<string, string> = {};
    const paramDecorators: string[] = [];  // Track @param names for validation
    let description: string | undefined;

    if (ctx.toolMetadata) {
      for (const metadata of ctx.toolMetadata) {
        const result = this.visit(metadata) as { type: 'description'; text: string } | { type: 'param'; name: string; text: string };
        if (result.type === 'description') {
          description = result.text;
        } else {
          paramDescriptions[result.name] = result.text;
          paramDecorators.push(result.name);
        }
      }
    }

    // Get parameters and attach descriptions
    const params: AST.ToolParameter[] = ctx.toolParameterList
      ? (this.visit(ctx.toolParameterList) as AST.ToolParameter[]).map((p) => ({
          ...p,
          description: paramDescriptions[p.name],
        }))
      : [];

    const node: AST.ToolDeclaration = {
      type: 'ToolDeclaration',
      name: ctx.Identifier[0].image,
      params,
      returnType: ctx.toolTypeAnnotation ? this.visit(ctx.toolTypeAnnotation) : null,
      description,
      body: this.visit(ctx.blockStatement),
      location: tokenLocation(ctx.Tool[0]),
    };

    // Only include paramDecorators if there are any (for validation)
    if (paramDecorators.length > 0) {
      node.paramDecorators = paramDecorators;
    }

    return node;
  }

  toolTypeAnnotation(ctx: { TextType?: IToken[]; JsonType?: IToken[]; PromptType?: IToken[]; BooleanType?: IToken[]; NumberType?: IToken[]; Identifier?: IToken[]; LBracket?: IToken[] }): string {
    // Get base type - could be built-in or imported type name
    const baseType = ctx.TextType ? 'text'
      : ctx.JsonType ? 'json'
      : ctx.PromptType ? 'prompt'
      : ctx.BooleanType ? 'boolean'
      : ctx.NumberType ? 'number'
      : ctx.Identifier![0].image;  // Imported TS type
    // Count array brackets
    const bracketCount = ctx.LBracket?.length ?? 0;
    return baseType + '[]'.repeat(bracketCount);
  }

  toolMetadata(ctx: { AtDescription?: IToken[]; AtParam?: IToken[]; Identifier?: IToken[]; StringLiteral: IToken[] }): { type: 'description'; text: string } | { type: 'param'; name: string; text: string } {
    if (ctx.AtDescription) {
      return { type: 'description', text: parseStringLiteral(ctx.StringLiteral[0]) };
    }
    // @param name "text"
    return { type: 'param', name: ctx.Identifier![0].image, text: parseStringLiteral(ctx.StringLiteral[0]) };
  }

  toolParameter(ctx: { Identifier: IToken[]; toolTypeAnnotation: CstNode[] }): AST.ToolParameter {
    return { name: ctx.Identifier[0].image, typeAnnotation: this.visit(ctx.toolTypeAnnotation) };
  }

  toolParameterList(ctx: { toolParameter: CstNode[] }): AST.ToolParameter[] {
    return ctx.toolParameter.map((p) => this.visit(p));
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

  breakStatement(ctx: { Break: IToken[] }): AST.BreakStatement {
    return { type: 'BreakStatement', location: tokenLocation(ctx.Break[0]) };
  }

  throwStatement(ctx: { Throw: IToken[]; expression: CstNode[] }): AST.ThrowStatement {
    return {
      type: 'ThrowStatement',
      message: this.visit(ctx.expression),
      location: tokenLocation(ctx.Throw[0]),
    };
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
      contextMode: ctx.contextMode ? this.visit(ctx.contextMode) : 'verbose',  // Default to verbose
    };
  }

  whileStatement(ctx: { While: IToken[]; expression: CstNode[]; blockStatement: CstNode[]; contextMode?: CstNode[] }): AST.WhileStatement {
    return {
      type: 'WhileStatement',
      condition: this.visit(ctx.expression),
      body: this.visit(ctx.blockStatement),
      location: tokenLocation(ctx.While[0]),
      contextMode: ctx.contextMode ? this.visit(ctx.contextMode) : 'verbose',  // Default to verbose
    };
  }

  contextMode(ctx: { Forget?: IToken[]; Verbose?: IToken[]; Compress?: IToken[]; StringLiteral?: IToken[]; Identifier?: IToken[] }): AST.ContextMode {
    if (ctx.Forget) return 'forget';
    if (ctx.Verbose) return 'verbose';
    // Compress with optional args: compress, compress(arg1), compress(arg1, arg2)
    // arg1 can be string literal or identifier (prompt or model - resolved at semantic analysis)
    // arg2 is always identifier (model)
    let arg1: AST.CompressArg | null = null;
    let arg2: AST.CompressArg | null = null;

    if (ctx.StringLiteral) {
      // First arg is string literal
      arg1 = { kind: 'literal', value: parseStringLiteral(ctx.StringLiteral[0]) };
      // Second arg (if present) is identifier
      if (ctx.Identifier?.[0]) {
        arg2 = { kind: 'identifier', name: ctx.Identifier[0].image };
      }
    } else if (ctx.Identifier) {
      // First arg is identifier
      arg1 = { kind: 'identifier', name: ctx.Identifier[0].image };
      // Second arg (if present) is also identifier
      if (ctx.Identifier[1]) {
        arg2 = { kind: 'identifier', name: ctx.Identifier[1].image };
      }
    }

    return { compress: { arg1, arg2 } };
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

  expression(ctx: { Vibe?: IToken[]; Do?: IToken[]; assignmentExpression?: CstNode[]; orExpression?: CstNode[]; expression?: CstNode[]; vibeModifiers?: CstNode[] }): AST.Expression {
    if (ctx.Vibe) {
      const prompt = this.visit(ctx.expression![0]);
      const modifiers = this.visit(ctx.vibeModifiers![0]) as { model: AST.Expression | null; context: AST.ContextSpecifier | null };
      return makeVibeExpression(ctx.Vibe[0], prompt, modifiers.model, modifiers.context, 'vibe');
    }
    if (ctx.Do) {
      const prompt = this.visit(ctx.expression![0]);
      const modifiers = this.visit(ctx.vibeModifiers![0]) as { model: AST.Expression | null; context: AST.ContextSpecifier | null };
      return makeVibeExpression(ctx.Do[0], prompt, modifiers.model, modifiers.context, 'do');
    }
    if (ctx.assignmentExpression) return this.visit(ctx.assignmentExpression);
    return this.visit(ctx.orExpression!);
  }

  // Parse optional model and context modifiers for vibe/do
  vibeModifiers(ctx: { Identifier?: IToken[]; contextSpecifier?: CstNode[] }): { model: AST.Expression | null; context: AST.ContextSpecifier | null } {
    // No modifiers at all
    if (!ctx.Identifier && !ctx.contextSpecifier) {
      return { model: null, context: null };
    }

    // Context keyword only (default/local), no model
    if (!ctx.Identifier && ctx.contextSpecifier) {
      return { model: null, context: this.visit(ctx.contextSpecifier[0]) };
    }

    // Model identifier present
    const modelToken = ctx.Identifier![0];
    const model: AST.Identifier = {
      type: 'Identifier',
      name: modelToken.image,
      location: tokenLocation(modelToken),
    };

    // Model with optional context
    const context = ctx.contextSpecifier ? this.visit(ctx.contextSpecifier[0]) : null;
    return { model, context };
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
        expr = makeCallExpression(
          expr,
          ctx.argumentList?.[op.index] ? this.visit(ctx.argumentList[op.index]) : []
        );
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

  // Index or slice inside brackets (Python-style colon syntax)
  indexOrSlice(ctx: { Colon?: IToken[]; expression?: CstNode[] }):
    | { kind: 'index'; index: AST.Expression }
    | { kind: 'slice'; start: AST.Expression | null; end: AST.Expression | null } {
    const hasColon = (ctx.Colon?.length ?? 0) > 0;
    const expressions = ctx.expression ?? [];

    if (!hasColon) {
      // Single index: [expr]
      return { kind: 'index', index: this.visit(expressions[0]) };
    }

    // Slice: check if colon comes first
    // If expressions.length === 1 and colon exists, it's either [:expr] or [expr:]
    // If expressions.length === 2 and colon exists, it's [expr:expr]
    // If expressions.length === 0 and colon exists, it's [:] (full slice)

    if (expressions.length === 0) {
      // [:] - full slice (copy entire array)
      return { kind: 'slice', start: null, end: null };
    }

    if (expressions.length === 1) {
      // Either [:expr] or [expr:]
      // We need to check if colon comes before or after the expression
      const colonOffset = ctx.Colon![0].startOffset;
      // Get the expression's approximate offset from its location
      const exprResult = this.visit(expressions[0]);
      // If the colon is before the expression, it's [:expr]
      // For [:expr]: colon offset < expression offset
      // For [expr:]: expression offset < colon offset
      const firstExprToken = getFirstToken(expressions[0]);
      if (firstExprToken && colonOffset < firstExprToken.startOffset) {
        // [:expr]
        return { kind: 'slice', start: null, end: exprResult };
      } else {
        // [expr:]
        return { kind: 'slice', start: exprResult, end: null };
      }
    }

    // [expr:expr]
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
    Null?: IToken[];
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
    if (ctx.Null) return makeNullLiteral(ctx.Null[0]);
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
