import * as AST from '../ast';
import { SemanticError, type SourceLocation } from '../errors';
import { SymbolTable, type SymbolKind } from './symbol-table';

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
        this.declare(node.name, 'variable', node.location, { typeAnnotation: node.typeAnnotation });
        if (node.typeAnnotation) {
          this.validateTypeAnnotation(node.typeAnnotation, node.location);
        }
        if (node.initializer) {
          this.visitExpression(node.initializer);
          // Compile-time type validation for literals
          if (node.typeAnnotation) {
            this.validateLiteralType(node.initializer, node.typeAnnotation, node.location);
          }
        }
        break;

      case 'ConstDeclaration':
        this.declare(node.name, 'constant', node.location, { typeAnnotation: node.typeAnnotation });
        if (node.typeAnnotation) {
          this.validateTypeAnnotation(node.typeAnnotation, node.location);
        }
        this.visitExpression(node.initializer);
        // Compile-time type validation for literals
        if (node.typeAnnotation) {
          this.validateLiteralType(node.initializer, node.typeAnnotation, node.location);
        }
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
        // Enter scope for loop variable
        this.symbols.enterScope();
        this.declare(node.variable, 'variable', node.location, { typeAnnotation: null });
        this.visitStatement(node.body);
        this.symbols.exitScope();
        break;

      case 'WhileStatement':
        this.visitExpression(node.condition);
        // Validate condition is boolean when type is knowable at compile time
        this.validateConditionType(node.condition, 'while');
        this.symbols.enterScope();
        this.visitStatement(node.body);
        this.symbols.exitScope();
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
        // Literals are always valid
        break;

      case 'ObjectLiteral':
        for (const prop of node.properties) {
          this.visitExpression(prop.value);
        }
        break;

      case 'ArrayLiteral':
        for (const element of node.elements) {
          this.visitExpression(element);
        }
        break;

      case 'AssignmentExpression':
        this.visitAssignmentExpression(node);
        break;

      case 'DoExpression':
        this.visitExpression(node.prompt);
        this.checkPromptType(node.prompt);
        this.checkModelType(node.model);
        // Check context variable if it's a variable reference
        if (node.context.kind === 'variable' && node.context.variable) {
          if (!this.symbols.lookup(node.context.variable)) {
            this.error(`'${node.context.variable}' is not defined`, node.context.location);
          }
        }
        break;

      case 'CallExpression':
        this.visitExpression(node.callee);
        for (const arg of node.arguments) {
          this.visitExpression(arg);
        }
        // Check argument types against parameter types
        this.checkCallArguments(node);
        break;

      case 'VibeExpression':
        this.visitExpression(node.prompt);
        this.checkPromptType(node.prompt);
        break;

      case 'AskExpression':
        this.visitExpression(node.prompt);
        this.checkPromptType(node.prompt);
        this.checkModelType(node.model);
        // Check context variable if it's a variable reference
        if (node.context.kind === 'variable' && node.context.variable) {
          if (!this.symbols.lookup(node.context.variable)) {
            this.error(`'${node.context.variable}' is not defined`, node.context.location);
          }
        }
        break;

      case 'TsBlock':
        // Validate that all parameters are defined variables
        for (const param of node.params) {
          if (!this.symbols.lookup(param)) {
            this.error(`'${param}' is not defined`, node.location);
          }
        }
        break;

      case 'TemplateLiteral':
        // Template literals are valid (interpolation checked at runtime)
        break;

      case 'RangeExpression':
        this.visitExpression(node.start);
        this.visitExpression(node.end);
        // Check that if both bounds are number literals, start <= end
        if (node.start.type === 'NumberLiteral' && node.end.type === 'NumberLiteral') {
          if (node.start.value > node.end.value) {
            this.error(
              `Range start (${node.start.value}) must be <= end (${node.end.value})`,
              node.location
            );
          }
        }
        break;
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

    // Register each imported name
    for (const spec of node.specifiers) {
      const existing = this.symbols.lookup(spec.local);
      if (existing) {
        if (existing.kind === 'import') {
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
        this.declare(spec.local, 'import', node.location);
      }
    }
  }

  private validateModelConfig(node: AST.ModelDeclaration): void {
    const config = node.config;
    const requiredFields = ['name', 'apiKey', 'url'];
    const provided = new Set(config.providedFields);

    // Check for missing required fields
    for (const field of requiredFields) {
      if (!provided.has(field)) {
        this.error(`Model '${node.name}' is missing required field '${field}'`, node.location);
      }
    }

    // Check for unknown fields
    for (const field of config.providedFields) {
      if (!requiredFields.includes(field)) {
        this.error(`Model '${node.name}' has unknown field '${field}'`, node.location);
      }
    }

    // Visit field expressions (check for undefined variables, etc.)
    if (config.modelName) this.visitExpression(config.modelName);
    if (config.apiKey) this.visitExpression(config.apiKey);
    if (config.url) this.visitExpression(config.url);
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

  private checkModelType(node: AST.Expression): void {
    if (node.type === 'Identifier') {
      const sym = this.symbols.lookup(node.name);
      if (!sym) {
        this.error(`'${node.name}' is not defined`, node.location);
      } else if (sym.kind !== 'model') {
        this.error(`Expected model, got ${sym.kind} '${node.name}'`, node.location);
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
    options?: { paramCount?: number; typeAnnotation?: string | null }
  ): void {
    if (!this.symbols.declare({ name, kind, location, ...options })) {
      this.error(`'${name}' is already declared`, location);
    }
  }

  private error(message: string, location: SourceLocation): void {
    this.errors.push(new SemanticError(message, location, this.source));
  }

  private validateTypeAnnotation(type: string, location: SourceLocation): void {
    // Strip array brackets to get base type (handles text[], text[][], etc.)
    const baseType = type.replace(/\[\]/g, '');
    const validTypes = ['text', 'json', 'prompt', 'boolean', 'number'];
    if (!validTypes.includes(baseType)) {
      this.error(`Unknown type '${baseType}'`, location);
    }
  }

  private validateJsonLiteral(value: string, location: SourceLocation): void {
    try {
      JSON.parse(value);
    } catch {
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
    if (!this.typesCompatible(sourceType, type)) {
      this.error(`Type error: cannot assign ${sourceType} to ${type}`, location);
    }

    // Additional JSON validation for string literals
    if (type === 'json' && expr.type === 'StringLiteral') {
      this.validateJsonLiteral(expr.value, location);
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

  /**
   * Checks if sourceType can be assigned to targetType.
   */
  private typesCompatible(sourceType: string, targetType: string): boolean {
    // Exact match
    if (sourceType === targetType) return true;

    // text and prompt are compatible
    if ((sourceType === 'text' || sourceType === 'prompt') &&
        (targetType === 'text' || targetType === 'prompt')) {
      return true;
    }

    // json accepts text (will be parsed at runtime)
    if (targetType === 'json' && sourceType === 'text') {
      return true;
    }

    return false;
  }
}
