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
          // Compile-time JSON validation for string literals
          if (node.typeAnnotation === 'json' && node.initializer.type === 'StringLiteral') {
            this.validateJsonLiteral(node.initializer.value, node.initializer.location);
          }
        }
        break;

      case 'ConstDeclaration':
        this.declare(node.name, 'constant', node.location, { typeAnnotation: node.typeAnnotation });
        if (node.typeAnnotation) {
          this.validateTypeAnnotation(node.typeAnnotation, node.location);
        }
        this.visitExpression(node.initializer);
        // Compile-time JSON validation for string literals
        if (node.typeAnnotation === 'json' && node.initializer.type === 'StringLiteral') {
          this.validateJsonLiteral(node.initializer.value, node.initializer.location);
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
        this.declare(node.name, 'function', node.location, { paramCount: node.params.length });
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
        this.visitStatement(node.consequent);
        if (node.alternate) this.visitStatement(node.alternate);
        break;

      case 'BreakStatement':
        // Note: loop checking not implemented yet
        break;

      case 'ContinueStatement':
        // Note: loop checking not implemented yet
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

    // Declare parameters
    for (const param of node.params) {
      this.declare(param, 'parameter', node.location);
    }

    // Visit function body
    this.visitStatement(node.body);

    this.symbols.exitScope();
    this.inFunction = wasInFunction;
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
    const validTypes = ['text', 'json', 'prompt'];
    if (!validTypes.includes(type)) {
      this.error(`Unknown type '${type}'`, location);
    }
  }

  private validateJsonLiteral(value: string, location: SourceLocation): void {
    try {
      JSON.parse(value);
    } catch {
      this.error(`Invalid JSON literal`, location);
    }
  }
}
