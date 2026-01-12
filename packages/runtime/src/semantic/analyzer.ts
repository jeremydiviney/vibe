import * as AST from '../ast';
import { SemanticError, type SourceLocation } from '../errors';
import { SymbolTable, type SymbolKind } from './symbol-table';
import { isValidType, typesCompatible, isValidJson, getBaseType } from './types';

export class SemanticAnalyzer {
  private symbols = new SymbolTable();
  private errors: SemanticError[] = [];
  private inFunction = false;
  private atTopLevel = true;
  private source?: string;

  analyze(program: AST.Program, source?: string): SemanticError[] {
    this.errors = [];
    this.source = source;
    this.symbols.enterScope();

    for (const stmt of program.body) {
      this.visitStatement(stmt);
    }

    this.symbols.exitScope();
    return this.errors;
  }

  private visitStatement(node: AST.Statement): void {
    switch (node.type) {
      case 'ImportDeclaration':
        this.visitImportDeclaration(node);
        break;

      case 'ExportDeclaration':
        // Visit the underlying declaration
        this.visitStatement(node.declaration);
        break;

      case 'LetDeclaration':
        this.visitVariableDeclaration(node, 'variable');
        break;

      case 'ConstDeclaration':
        this.visitVariableDeclaration(node, 'constant');
        break;

      case 'DestructuringDeclaration':
        this.visitDestructuringDeclaration(node);
        break;

      case 'ModelDeclaration':
        this.declare(node.name, 'model', node.location);
        this.validateModelConfig(node);
        break;

      case 'FunctionDeclaration':
        if (!this.atTopLevel) {
          this.error('Functions can only be declared at global scope', node.location);
        }
        this.declare(node.name, 'function', node.location, {
          paramCount: node.params.length,
          paramTypes: node.params.map(p => p.typeAnnotation),
          returnType: node.returnType,
        });
        this.visitFunction(node);
        break;

      case 'ReturnStatement':
        if (!this.inFunction) {
          this.error('return outside of function', node.location);
        }
        if (node.value) this.visitExpression(node.value);
        break;

      case 'IfStatement':
        this.visitExpression(node.condition);
        // Validate condition is boolean when type is knowable at compile time
        this.validateConditionType(node.condition, 'if');
        this.visitStatement(node.consequent);
        if (node.alternate) this.visitStatement(node.alternate);
        break;

      case 'ForInStatement':
        this.visitExpression(node.iterable);
        this.symbols.enterScope();
        this.declare(node.variable, 'variable', node.location, { typeAnnotation: null });
        this.visitStatement(node.body);
        this.symbols.exitScope();
        if (node.contextMode) this.validateContextMode(node.contextMode, node.location);
        break;

      case 'WhileStatement':
        this.visitExpression(node.condition);
        this.validateConditionType(node.condition, 'while');
        this.symbols.enterScope();
        this.visitStatement(node.body);
        this.symbols.exitScope();
        if (node.contextMode) this.validateContextMode(node.contextMode, node.location);
        break;

      case 'BlockStatement':
        const wasAtTopLevel = this.atTopLevel;
        this.atTopLevel = false;
        this.symbols.enterScope();
        for (const stmt of node.body) {
          this.visitStatement(stmt);
        }
        this.symbols.exitScope();
        this.atTopLevel = wasAtTopLevel;
        break;

      case 'ExpressionStatement':
        this.visitExpression(node.expression);
        break;

      case 'ToolDeclaration':
        if (!this.atTopLevel) {
          this.error('Tools can only be declared at global scope', node.location);
        }
        this.declare(node.name, 'tool', node.location, {
          paramCount: node.params.length,
          paramTypes: node.params.map(p => p.typeAnnotation),
          returnType: node.returnType,
        });
        this.validateToolDeclaration(node);
        break;

      case 'AsyncStatement':
        this.validateAsyncExpression(node.expression, node.location);
        this.visitExpression(node.expression);
        break;
    }
  }

  private visitExpression(node: AST.Expression): void {
    switch (node.type) {
      case 'Identifier':
        if (!this.symbols.lookup(node.name)) {
          this.error(`'${node.name}' is not defined`, node.location);
        }
        break;

      case 'StringLiteral':
      case 'BooleanLiteral':
      case 'NumberLiteral':
      case 'NullLiteral':
        // Literals are always valid
        break;

      case 'ObjectLiteral':
        node.properties.forEach((prop) => this.visitExpression(prop.value));
        break;

      case 'ArrayLiteral':
        node.elements.forEach((element) => this.visitExpression(element));
        break;

      case 'AssignmentExpression':
        this.visitAssignmentExpression(node);
        break;

      case 'VibeExpression':
        this.visitExpression(node.prompt);
        this.checkPromptType(node.prompt);
        if (node.model) this.checkModelType(node.model);
        if (node.context) this.checkContextVariable(node.context);
        break;

      case 'CallExpression':
        this.visitExpression(node.callee);
        node.arguments.forEach((arg) => this.visitExpression(arg));
        this.checkCallArguments(node);
        this.checkToolCall(node);
        break;

      case 'TsBlock':
        for (const param of node.params) {
          if (!this.symbols.lookup(param)) this.error(`'${param}' is not defined`, node.location);
        }
        break;

      case 'TemplateLiteral':
        // Template literals are valid (interpolation checked at runtime)
        break;

      case 'RangeExpression':
        this.visitExpression(node.start);
        this.visitExpression(node.end);
        if (node.start.type === 'NumberLiteral' && node.end.type === 'NumberLiteral') {
          if (node.start.value > node.end.value) {
            this.error(`Range start (${node.start.value}) must be <= end (${node.end.value})`, node.location);
          }
        }
        break;

      case 'BinaryExpression':
        this.visitExpression(node.left);
        this.visitExpression(node.right);
        break;

      case 'UnaryExpression':
        this.visitExpression(node.operand);
        break;

      case 'IndexExpression':
        this.visitExpression(node.object);
        this.visitExpression(node.index);
        break;

      case 'SliceExpression':
        this.visitExpression(node.object);
        if (node.start) this.visitExpression(node.start);
        if (node.end) this.visitExpression(node.end);
        break;

      case 'MemberExpression':
        this.visitExpression(node.object);
        break;
    }
  }

  private visitVariableDeclaration(
    node: AST.LetDeclaration | AST.ConstDeclaration,
    kind: 'variable' | 'constant'
  ): void {
    // Check for null initializer rules
    const isNullInitializer = node.initializer?.type === 'NullLiteral';

    if (isNullInitializer) {
      if (kind === 'constant') {
        // const x = null or const x: T = null - both errors
        this.error(`Cannot initialize const with null - const values cannot be reassigned`, node.location);
      } else if (!node.typeAnnotation) {
        // let x = null - error (can't infer type)
        this.error(`Cannot infer type from null - provide a type annotation: let ${node.name}: <type> = null`, node.location);
      }
      // let x: T = null - OK (falls through)
    }

    // Validate async declarations have valid RHS
    if (node.isAsync && node.initializer) {
      this.validateAsyncExpression(node.initializer, node.location);
    }

    // AI calls (do/vibe) require explicit type annotation - types cannot be inferred
    if (node.initializer?.type === 'VibeExpression' && !node.typeAnnotation) {
      this.error(
        `Type cannot be inferred from AI call, must assign to explicitly typed variable: ${kind === 'constant' ? 'const' : 'let'} ${node.name}: <type> = ...`,
        node.location
      );
    }

    // Model type variables must be const (immutable)
    if (node.typeAnnotation === 'model' && kind === 'variable') {
      this.error(`Variables with type 'model' must be declared with 'const', not 'let'`, node.location);
    }
    this.declare(node.name, kind, node.location, { typeAnnotation: node.typeAnnotation });
    if (node.typeAnnotation) {
      this.validateTypeAnnotation(node.typeAnnotation, node.location);
    }
    if (node.initializer) {
      this.visitExpression(node.initializer);
      if (node.typeAnnotation) {
        this.validateLiteralType(node.initializer, node.typeAnnotation, node.location);
      }
    }
  }

  private visitDestructuringDeclaration(node: AST.DestructuringDeclaration): void {
    // Validate each field has a valid type
    for (const field of node.fields) {
      if (!isValidType(field.type)) {
        this.error(`Invalid type '${field.type}' for field '${field.name}'`, node.location);
      }
    }

    // Validate initializer is a do/vibe expression
    if (node.initializer.type !== 'VibeExpression') {
      this.error('Destructuring assignment requires a do or vibe expression', node.location);
    }

    // Validate async declarations have valid RHS
    if (node.isAsync) {
      this.validateAsyncExpression(node.initializer, node.location);
    }

    // Check for duplicate field names and collect unique ones
    const seenNames = new Set<string>();
    const uniqueFields: typeof node.fields = [];
    for (const field of node.fields) {
      if (seenNames.has(field.name)) {
        this.error(`Duplicate field '${field.name}' in destructuring pattern`, node.location);
      } else {
        seenNames.add(field.name);
        uniqueFields.push(field);
      }
    }

    // Visit the initializer expression
    this.visitExpression(node.initializer);

    // Register only unique fields as variables in scope
    const kind = node.isConst ? 'constant' : 'variable';
    for (const field of uniqueFields) {
      this.declare(field.name, kind, node.location, { typeAnnotation: field.type });
    }
  }

  private visitAssignmentExpression(node: AST.AssignmentExpression): void {
    const name = node.target.name;
    const symbol = this.symbols.lookup(name);

    if (!symbol) {
      this.error(`'${name}' is not defined`, node.target.location);
    } else if (symbol.kind === 'constant') {
      this.error(`Cannot reassign constant '${name}'`, node.location);
    } else if (symbol.kind === 'function') {
      this.error(`Cannot reassign function '${name}'`, node.location);
    } else if (symbol.kind === 'model') {
      this.error(`Cannot reassign model '${name}'`, node.location);
    } else if (symbol.kind === 'import') {
      this.error(`Cannot reassign imported '${name}'`, node.location);
    }

    // Visit the value expression
    this.visitExpression(node.value);
  }

  private visitImportDeclaration(node: AST.ImportDeclaration): void {
    // Imports must be at top level
    if (!this.atTopLevel) {
      this.error('Imports can only be at global scope', node.location);
      return;
    }

    // Determine if this is a tool import (from system/tools)
    const isToolImport = node.source === 'system/tools';

    // Register each imported name
    for (const spec of node.specifiers) {
      const existing = this.symbols.lookup(spec.local);
      if (existing) {
        if (existing.kind === 'import' || existing.kind === 'tool') {
          this.error(
            `'${spec.local}' is already imported from another module`,
            node.location
          );
        } else {
          this.error(
            `Import '${spec.local}' conflicts with existing ${existing.kind}`,
            node.location
          );
        }
      } else {
        // Mark imports from system/tools as tools (except standardTools array)
        const kind = isToolImport && spec.local !== 'standardTools' ? 'tool' : 'import';
        this.declare(spec.local, kind, node.location);
      }
    }
  }

  private validateModelConfig(node: AST.ModelDeclaration): void {
    const config = node.config;
    const requiredFields = ['name', 'apiKey', 'url'];
    const optionalFields = ['provider', 'maxRetriesOnError', 'thinkingLevel', 'tools'];
    const validFields = [...requiredFields, ...optionalFields];
    const provided = new Set(config.providedFields);

    // Check for missing required fields
    for (const field of requiredFields) {
      if (!provided.has(field)) {
        this.error(`Model '${node.name}' is missing required field '${field}'`, node.location);
      }
    }

    // Check for unknown fields
    for (const field of config.providedFields) {
      if (!validFields.includes(field)) {
        this.error(`Model '${node.name}' has unknown field '${field}'`, node.location);
      }
    }

    // Validate provider is one of the allowed values
    if (config.provider) {
      if (config.provider.type === 'StringLiteral') {
        const validProviders = ['anthropic', 'openai', 'google'];
        if (!validProviders.includes(config.provider.value)) {
          this.error(
            `Invalid provider '${config.provider.value}'. Must be: ${validProviders.join(', ')}`,
            config.provider.location
          );
        }
      }
      this.visitExpression(config.provider);
    }

    // Validate maxRetriesOnError is a non-negative number
    if (config.maxRetriesOnError) {
      if (config.maxRetriesOnError.type === 'NumberLiteral') {
        if (config.maxRetriesOnError.value < 0 || !Number.isInteger(config.maxRetriesOnError.value)) {
          this.error(
            `maxRetriesOnError must be a non-negative integer, got ${config.maxRetriesOnError.value}`,
            config.maxRetriesOnError.location
          );
        }
      }
      this.visitExpression(config.maxRetriesOnError);
    }

    // Visit field expressions (check for undefined variables, etc.)
    if (config.modelName) this.visitExpression(config.modelName);
    if (config.apiKey) this.visitExpression(config.apiKey);
    if (config.url) this.visitExpression(config.url);
  }

  private validateToolDeclaration(node: AST.ToolDeclaration): void {
    // Validate @param decorators reference actual parameters
    if (node.paramDecorators) {
      const paramNames = new Set(node.params.map(p => p.name));
      for (const decoratorName of node.paramDecorators) {
        if (!paramNames.has(decoratorName)) {
          this.error(
            `@param '${decoratorName}' does not match any parameter in tool '${node.name}'. ` +
            `Valid parameters: ${node.params.map(p => p.name).join(', ') || '(none)'}`,
            node.location
          );
        }
      }
    }

    // Validate parameter type annotations (allow both Vibe types and imported types)
    for (const param of node.params) {
      // Basic Vibe types and arrays are always valid
      // Imported types (like CustomerInfo) are validated at runtime
      const baseType = param.typeAnnotation.replace(/\[\]$/, '');
      const isVibeType = ['text', 'json', 'boolean', 'number', 'prompt'].includes(baseType);
      if (!isVibeType) {
        // Could be an imported type - check if it's declared
        const symbol = this.symbols.lookup(baseType);
        if (!symbol) {
          this.error(
            `Unknown type '${baseType}' in tool parameter '${param.name}'`,
            node.location
          );
        }
      }
    }

    // Validate return type if present
    if (node.returnType) {
      const baseType = node.returnType.replace(/\[\]$/, '');
      const isVibeType = ['text', 'json', 'boolean', 'number', 'prompt'].includes(baseType);
      if (!isVibeType) {
        const symbol = this.symbols.lookup(baseType);
        if (!symbol) {
          this.error(
            `Unknown return type '${baseType}' in tool '${node.name}'`,
            node.location
          );
        }
      }
    }
  }

  private visitFunction(node: AST.FunctionDeclaration): void {
    const wasInFunction = this.inFunction;
    this.inFunction = true;
    this.symbols.enterScope();

    // Declare parameters with REQUIRED type annotations
    for (const param of node.params) {
      this.validateTypeAnnotation(param.typeAnnotation, node.location);
      this.declare(param.name, 'parameter', node.location, { typeAnnotation: param.typeAnnotation });
    }

    // Validate return type if present
    if (node.returnType) {
      this.validateTypeAnnotation(node.returnType, node.location);
    }

    // Visit function body
    this.visitStatement(node.body);

    this.symbols.exitScope();
    this.inFunction = wasInFunction;
  }

  /**
   * Check that we're not calling a tool directly.
   * Tools can only be used by AI models via the tools array in model declarations.
   */
  private checkToolCall(node: AST.CallExpression): void {
    if (node.callee.type !== 'Identifier') return;

    const symbol = this.symbols.lookup(node.callee.name);
    if (symbol?.kind === 'tool') {
      this.error(
        `Cannot call tool '${node.callee.name}' directly. Tools can only be used by AI models via the tools array in model declarations.`,
        node.location
      );
    }
  }

  /**
   * Check that call arguments match the function's parameter types.
   */
  private checkCallArguments(node: AST.CallExpression): void {
    // Only check if callee is a simple identifier (function name)
    if (node.callee.type !== 'Identifier') return;

    const funcSymbol = this.symbols.lookup(node.callee.name);
    if (!funcSymbol || funcSymbol.kind !== 'function') return;
    if (!funcSymbol.paramTypes) return;

    // Check each argument against corresponding parameter type
    for (let i = 0; i < node.arguments.length && i < funcSymbol.paramTypes.length; i++) {
      const arg = node.arguments[i];
      const expectedType = funcSymbol.paramTypes[i];
      if (expectedType) {
        this.validateLiteralType(arg, expectedType, arg.location);
      }
    }
  }

  private checkContextVariable(context: AST.ContextSpecifier): void {
    if (context.kind === 'variable' && context.variable) {
      if (!this.symbols.lookup(context.variable)) {
        this.error(`'${context.variable}' is not defined`, context.location);
      }
    }
  }

  private checkModelType(node: AST.Expression): void {
    if (node.type === 'Identifier') {
      const sym = this.symbols.lookup(node.name);
      if (!sym) {
        this.error(`'${node.name}' is not defined`, node.location);
      } else if (sym.kind !== 'model') {
        // Also accept parameters with 'model' type annotation (for vibe-generated functions)
        const isModelParam = sym.kind === 'parameter' && sym.typeAnnotation === 'model';
        if (!isModelParam) {
          this.error(`Expected model, got ${sym.kind} '${node.name}'`, node.location);
        }
      }
    } else {
      // For non-identifier expressions, just visit them
      this.visitExpression(node);
    }
  }

  /**
   * Validates that prompt parameters are string literals or text/prompt typed variables.
   * Rejects json typed variables and model references.
   * Call visitExpression first before calling this method.
   */
  private checkPromptType(node: AST.Expression): void {
    if (node.type !== 'Identifier') return;

    const sym = this.symbols.lookup(node.name);
    if (!sym) return; // Already reported by visitExpression

    if (sym.kind === 'model') {
      this.error(`Cannot use model '${node.name}' as prompt`, node.location);
    } else if (sym.kind === 'function') {
      this.error(`Cannot use function '${node.name}' as prompt`, node.location);
    } else if (sym.typeAnnotation === 'json') {
      this.error(`Cannot use json typed variable '${node.name}' as prompt`, node.location);
    }
  }

  private declare(
    name: string,
    kind: SymbolKind,
    location: SourceLocation,
    options?: { paramCount?: number; typeAnnotation?: string | null; paramTypes?: string[]; returnType?: string | null }
  ): void {
    if (!this.symbols.declare({ name, kind, location, ...options })) {
      this.error(`'${name}' is already declared`, location);
    }
  }

  private error(message: string, location: SourceLocation): void {
    this.errors.push(new SemanticError(message, location, this.source));
  }

  private validateTypeAnnotation(type: string, location: SourceLocation): void {
    if (!isValidType(type)) {
      this.error(`Unknown type '${getBaseType(type)}'`, location);
    }
  }

  private validateJsonLiteral(value: string, location: SourceLocation): void {
    if (!isValidJson(value)) {
      this.error(`Invalid JSON literal`, location);
    }
  }

  /**
   * Validates that a condition expression is boolean when its type is knowable at compile time.
   * Used for if/while conditions.
   */
  private validateConditionType(expr: AST.Expression, context: 'if' | 'while'): void {
    const exprType = this.getExpressionType(expr);
    if (exprType && exprType !== 'boolean') {
      this.error(`${context} condition must be boolean, got ${exprType}`, expr.location);
    }
  }

  /**
   * Validates that an expression is compatible with its type annotation.
   * Checks literals and variable references with known types.
   */
  private validateLiteralType(expr: AST.Expression, type: string, location: SourceLocation): void {
    // Handle array types
    if (type.endsWith('[]')) {
      if (expr.type === 'ArrayLiteral') {
        const elementType = type.slice(0, -2);
        for (const element of expr.elements) {
          this.validateLiteralType(element, elementType, element.location);
        }
      }
      // Non-array literals assigned to array type - let runtime handle
      return;
    }

    // Get the source type from the expression
    const sourceType = this.getExpressionType(expr);
    if (!sourceType) {
      // Can't determine type at compile time (function call, AI expression, etc.)
      // JSON string validation still applies
      if (type === 'json' && expr.type === 'StringLiteral') {
        this.validateJsonLiteral(expr.value, location);
      }
      return;
    }

    // Check type compatibility
    if (!typesCompatible(sourceType, type)) {
      this.error(`Type error: cannot assign ${sourceType} to ${type}`, location);
    }

    // Additional JSON validation for string literals
    if (type === 'json' && expr.type === 'StringLiteral') {
      this.validateJsonLiteral(expr.value, location);
    }
  }

  /**
   * Validates that an async expression is a single async-capable operation.
   * Valid: VibeExpression (do/vibe), TsBlock, CallExpression
   * Invalid: Literals, binary expressions, other compound expressions
   */
  private validateAsyncExpression(expr: AST.Expression, location: SourceLocation): void {
    const validTypes = ['VibeExpression', 'TsBlock', 'CallExpression'];
    if (!validTypes.includes(expr.type)) {
      this.error(
        `async declarations require a single do, vibe, ts block, or function call`,
        location
      );
    }
  }

  /**
   * Validates compress context mode arguments.
   * - Single identifier: must be model or prompt type
   * - Two arguments: first must be prompt/literal, second must be model
   */
  private validateContextMode(mode: AST.ContextMode, location: SourceLocation): void {
    if (mode === 'forget' || mode === 'verbose') return;

    // It's a compress mode
    const { arg1, arg2 } = mode.compress;

    if (arg1 && arg1.kind === 'identifier') {
      const sym = this.symbols.lookup(arg1.name);
      if (!sym) {
        this.error(`compress argument '${arg1.name}' is not declared`, location);
      } else if (arg2) {
        // Two args: first must be prompt type (or constant with prompt-compatible type)
        const isPromptType = sym.kind === 'constant' && sym.typeAnnotation === 'prompt';
        const isTextType = sym.typeAnnotation === 'text' || sym.typeAnnotation === 'prompt';
        if (!isPromptType && !isTextType) {
          this.error(
            `compress first argument '${arg1.name}' must be prompt type when two arguments provided, got ${sym.typeAnnotation ?? sym.kind}`,
            location
          );
        }
      } else {
        // Single identifier: must be model or prompt type
        const isModelType = sym.kind === 'model' || (sym.kind === 'constant' && sym.typeAnnotation === 'model');
        const isPromptType = sym.kind === 'constant' && sym.typeAnnotation === 'prompt';
        const isTextType = sym.typeAnnotation === 'text' || sym.typeAnnotation === 'prompt';
        if (!isModelType && !isPromptType && !isTextType) {
          this.error(
            `compress argument '${arg1.name}' must be prompt or model type, got ${sym.typeAnnotation ?? sym.kind}`,
            location
          );
        }
      }
    }

    if (arg2 && arg2.kind === 'identifier') {
      const sym = this.symbols.lookup(arg2.name);
      if (!sym) {
        this.error(`compress model '${arg2.name}' is not declared`, location);
      } else {
        const isModelType = sym.kind === 'model' || (sym.kind === 'constant' && sym.typeAnnotation === 'model');
        if (!isModelType) {
          this.error(
            `compress second argument '${arg2.name}' must be model type, got ${sym.typeAnnotation ?? sym.kind}`,
            location
          );
        }
      }
    }
  }

  /**
   * Gets the type of an expression if it can be determined at compile time.
   * Returns null for expressions that require runtime evaluation.
   */
  private getExpressionType(expr: AST.Expression): string | null {
    switch (expr.type) {
      case 'StringLiteral':
      case 'TemplateLiteral':
        return 'text';
      case 'BooleanLiteral':
        return 'boolean';
      case 'NumberLiteral':
        return 'number';
      case 'NullLiteral':
        return 'null';  // Special type - compatible with any typed variable
      case 'ObjectLiteral':
        return 'json';
      case 'ArrayLiteral':
        // Could infer array element type, but for now treat as unknown
        return null;
      case 'Identifier': {
        const symbol = this.symbols.lookup(expr.name);
        if (symbol?.typeAnnotation) {
          return symbol.typeAnnotation;
        }
        return null;
      }
      case 'CallExpression': {
        // Get return type of function if callee is an identifier
        if (expr.callee.type === 'Identifier') {
          const funcSymbol = this.symbols.lookup(expr.callee.name);
          if (funcSymbol?.kind === 'function' && funcSymbol.returnType) {
            return funcSymbol.returnType;
          }
        }
        return null;
      }
      default:
        // AI expressions, etc. - can't determine at compile time
        return null;
    }
  }

}
