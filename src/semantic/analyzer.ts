import * as AST from '../ast';
import { SemanticError, type SourceLocation } from '../errors';
import { SymbolTable, type SymbolKind } from './symbol-table';

export class SemanticAnalyzer {
  private symbols = new SymbolTable();
  private errors: SemanticError[] = [];
  private inFunction = false;
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
      case 'LetDeclaration':
        this.declare(node.name, 'variable', node.location);
        if (node.initializer) this.visitExpression(node.initializer);
        break;

      case 'ConstDeclaration':
        this.declare(node.name, 'constant', node.location);
        this.visitExpression(node.initializer);
        break;

      case 'ModelDeclaration':
        this.declare(node.name, 'model', node.location);
        // Check property values
        for (const prop of node.config.properties) {
          this.visitExpression(prop.value);
        }
        break;

      case 'FunctionDeclaration':
        this.declare(node.name, 'function', node.location, node.params.length);
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
        this.symbols.enterScope();
        for (const stmt of node.body) {
          this.visitStatement(stmt);
        }
        this.symbols.exitScope();
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

      case 'DoExpression':
        this.visitExpression(node.prompt);
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
        break;
    }
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

  private declare(
    name: string,
    kind: SymbolKind,
    location: SourceLocation,
    paramCount?: number
  ): void {
    if (!this.symbols.declare({ name, kind, location, paramCount })) {
      this.error(`'${name}' is already declared`, location);
    }
  }

  private error(message: string, location: SourceLocation): void {
    this.errors.push(new SemanticError(message, location, this.source));
  }
}
