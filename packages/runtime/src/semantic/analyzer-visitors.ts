/**
 * Semantic Analyzer Visitors
 *
 * Statement and expression visitor functions for the semantic analyzer.
 */
import * as AST from '../ast';
import type { SourceLocation } from '../errors';
import type { AnalyzerContext, AnalyzerState } from './analyzer-context';
import { isValidType } from './types';
import { isCoreFunction } from '../runtime/stdlib/core';
import { extractFunctionSignature } from './ts-signatures';
import { resolve, dirname } from 'path';
import {
  validateModelConfig,
  validateToolDeclaration,
  validateTypeAnnotation,
  validateLiteralType,
  validateConditionType,
  validateAsyncExpression,
  validateContextMode,
  validateTsBlock,
  checkToolCall,
  checkCallArguments,
  checkPromptType,
  checkModelType,
  checkContextVariable,
  validateStringInterpolation,
  getExpressionType,
} from './analyzer-validators';

/**
 * Visitor interface for recursive visiting.
 */
export interface AnalyzerVisitor {
  visitStatement(node: AST.Statement): void;
  visitExpression(node: AST.Expression): void;
}

/**
 * Creates statement and expression visitors for the analyzer.
 */
export function createVisitors(
  ctx: AnalyzerContext,
  state: AnalyzerState
): AnalyzerVisitor {
  // Helper to get expression type with context
  const getExprType = (expr: AST.Expression) => getExpressionType(ctx, expr);

  // Helper for validateLiteralType with context
  const validateLitType = (expr: AST.Expression, type: string, location: SourceLocation) => {
    validateLiteralType(ctx, expr, type, location, getExprType);
  };

  // Validate array concatenation types (guard clause style)
  function validateArrayConcatenation(node: AST.BinaryExpression): void {
    if (node.operator !== '+') {
      return;
    }

    const leftType = getExprType(node.left);
    const rightType = getExprType(node.right);
    const leftIsArray = leftType?.endsWith('[]') || node.left.type === 'ArrayLiteral';
    const rightIsArray = rightType?.endsWith('[]') || node.right.type === 'ArrayLiteral';

    // Not an array operation - nothing to check
    if (!leftIsArray && !rightIsArray) {
      return;
    }

    // One is array, one is not - error
    if (!leftIsArray || !rightIsArray) {
      ctx.error('Cannot concatenate array with non-array using +', node.location);
      return;
    }

    // Both arrays but different types - error
    if (leftType && rightType && leftType !== rightType) {
      ctx.error(
        `Cannot concatenate ${leftType} with ${rightType}: array types must match`,
        node.location
      );
    }
  }

  function visitStatement(node: AST.Statement): void {
    switch (node.type) {
      case 'ImportDeclaration':
        visitImportDeclaration(node);
        break;

      case 'ExportDeclaration':
        if (node.declaration.type === 'LetDeclaration') {
          ctx.error(
            `Cannot export mutable variable '${node.declaration.name}'. Only constants can be exported.`,
            node.location
          );
        }
        visitStatement(node.declaration);
        break;

      case 'LetDeclaration':
        visitVariableDeclaration(node, 'variable');
        break;

      case 'ConstDeclaration':
        visitVariableDeclaration(node, 'constant');
        break;

      case 'DestructuringDeclaration':
        visitDestructuringDeclaration(node);
        break;

      case 'ModelDeclaration':
        ctx.declare(node.name, 'model', node.location);
        validateModelConfig(ctx, node, visitExpression);
        break;

      case 'FunctionDeclaration':
        if (!state.atTopLevel) {
          ctx.error('Functions can only be declared at global scope', node.location);
        }
        ctx.declare(node.name, 'function', node.location, {
          paramCount: node.params.length,
          paramTypes: node.params.map(p => p.typeAnnotation),
          returnType: node.returnType,
        });
        visitFunction(node);
        break;

      case 'ReturnStatement':
        if (!state.inFunction) {
          ctx.error('return outside of function', node.location);
        }
        if (node.value) visitExpression(node.value);
        break;

      case 'BreakStatement':
        if (state.loopDepth === 0) {
          ctx.error('break outside of loop', node.location);
        }
        break;

      case 'IfStatement':
        visitExpression(node.condition);
        validateConditionType(ctx, node.condition, 'if', getExprType);
        visitStatement(node.consequent);
        if (node.alternate) visitStatement(node.alternate);
        break;

      case 'ForInStatement':
        visitExpression(node.iterable);
        ctx.symbols.enterScope();
        ctx.declare(node.variable, 'variable', node.location, { typeAnnotation: null });
        state.loopDepth++;
        visitStatement(node.body);
        state.loopDepth--;
        ctx.symbols.exitScope();
        if (node.contextMode) validateContextMode(ctx, node.contextMode, node.location);
        break;

      case 'WhileStatement':
        visitExpression(node.condition);
        validateConditionType(ctx, node.condition, 'while', getExprType);
        ctx.symbols.enterScope();
        state.loopDepth++;
        visitStatement(node.body);
        state.loopDepth--;
        ctx.symbols.exitScope();
        if (node.contextMode) validateContextMode(ctx, node.contextMode, node.location);
        break;

      case 'BlockStatement': {
        const wasAtTopLevel = state.atTopLevel;
        state.atTopLevel = false;
        ctx.symbols.enterScope();
        for (const stmt of node.body) {
          visitStatement(stmt);
        }
        ctx.symbols.exitScope();
        state.atTopLevel = wasAtTopLevel;
        break;
      }

      case 'ExpressionStatement':
        visitExpression(node.expression);
        break;

      case 'ToolDeclaration':
        if (!state.atTopLevel) {
          ctx.error('Tools can only be declared at global scope', node.location);
        }
        ctx.declare(node.name, 'tool', node.location, {
          paramCount: node.params.length,
          paramTypes: node.params.map(p => p.typeAnnotation),
          returnType: node.returnType,
        });
        validateToolDeclaration(ctx, node);
        break;

      case 'AsyncStatement':
        validateAsyncExpression(ctx, node.expression, node.location);
        visitExpression(node.expression);
        break;
    }
  }

  function visitExpression(node: AST.Expression): void {
    switch (node.type) {
      case 'Identifier':
        if (!ctx.symbols.lookup(node.name) && !isCoreFunction(node.name)) {
          ctx.error(`'${node.name}' is not defined`, node.location);
        }
        break;

      case 'StringLiteral':
        validateStringInterpolation(ctx, node.value, false, node.location);
        break;

      case 'TemplateLiteral':
        validateStringInterpolation(ctx, node.value, false, node.location);
        break;

      case 'BooleanLiteral':
      case 'NumberLiteral':
      case 'NullLiteral':
        break;

      case 'ObjectLiteral':
        node.properties.forEach((prop) => visitExpression(prop.value));
        break;

      case 'ArrayLiteral':
        node.elements.forEach((element) => visitExpression(element));
        break;

      case 'AssignmentExpression':
        visitAssignmentExpression(node);
        break;

      case 'VibeExpression':
        visitVibePrompt(node.prompt);
        checkPromptType(ctx, node.prompt);
        if (node.model) checkModelType(ctx, node.model, visitExpression);
        if (node.context) checkContextVariable(ctx, node.context);
        break;

      case 'CallExpression':
        visitExpression(node.callee);
        node.arguments.forEach((arg) => visitExpression(arg));
        checkCallArguments(ctx, node, getExprType, validateLitType);
        checkToolCall(ctx, node);
        break;

      case 'TsBlock':
        validateTsBlock(ctx, node);
        break;

      case 'RangeExpression':
        visitExpression(node.start);
        visitExpression(node.end);
        if (node.start.type === 'NumberLiteral' && node.end.type === 'NumberLiteral') {
          if (node.start.value > node.end.value) {
            ctx.error(`Range start (${node.start.value}) must be <= end (${node.end.value})`, node.location);
          }
        }
        break;

      case 'BinaryExpression':
        visitExpression(node.left);
        visitExpression(node.right);
        validateArrayConcatenation(node);
        break;

      case 'UnaryExpression':
        visitExpression(node.operand);
        break;

      case 'IndexExpression':
        visitExpression(node.object);
        visitExpression(node.index);
        break;

      case 'SliceExpression':
        visitExpression(node.object);
        if (node.start) visitExpression(node.start);
        if (node.end) visitExpression(node.end);
        break;

      case 'MemberExpression':
        visitExpression(node.object);
        break;
    }
  }

  function visitVibePrompt(node: AST.Expression): void {
    if (node.type === 'StringLiteral') {
      validateStringInterpolation(ctx, node.value, true, node.location);
      return;
    }
    if (node.type === 'TemplateLiteral') {
      validateStringInterpolation(ctx, node.value, true, node.location);
      return;
    }
    visitExpression(node);
  }

  function visitVariableDeclaration(
    node: AST.LetDeclaration | AST.ConstDeclaration,
    kind: 'variable' | 'constant'
  ): void {
    const isNullInitializer = node.initializer?.type === 'NullLiteral';

    if (isNullInitializer) {
      if (kind === 'constant') {
        ctx.error(`Cannot initialize const with null - const values cannot be reassigned`, node.location);
      } else if (!node.typeAnnotation) {
        ctx.error(`Cannot infer type from null - provide a type annotation: let ${node.name}: <type> = null`, node.location);
      }
    }

    if (node.isAsync && node.initializer) {
      validateAsyncExpression(ctx, node.initializer, node.location);
    }

    if (node.initializer?.type === 'VibeExpression' && !node.typeAnnotation) {
      ctx.error(
        `Type cannot be inferred from AI call, must assign to explicitly typed variable: ${kind === 'constant' ? 'const' : 'let'} ${node.name}: <type> = ...`,
        node.location
      );
    }

    if (node.typeAnnotation === 'model' && kind === 'variable') {
      ctx.error(`Variables with type 'model' must be declared with 'const', not 'let'`, node.location);
    }

    let effectiveType = node.typeAnnotation;
    if (!effectiveType && node.initializer) {
      effectiveType = getExprType(node.initializer);
    }

    ctx.declare(node.name, kind, node.location, { typeAnnotation: effectiveType });
    if (node.typeAnnotation) {
      validateTypeAnnotation(ctx, node.typeAnnotation, node.location);
    }
    if (node.initializer) {
      if (node.initializer.type === 'CallExpression' && node.initializer.callee.type === 'Identifier') {
        const funcSymbol = ctx.symbols.lookup(node.initializer.callee.name);
        if (funcSymbol?.kind === 'function' && !funcSymbol.returnType) {
          ctx.error(
            `Cannot assign result of '${node.initializer.callee.name}()' to a variable - function has no return type`,
            node.location
          );
        }
      }
      const isPromptType = node.typeAnnotation === 'prompt';
      if (isPromptType && (node.initializer.type === 'StringLiteral' || node.initializer.type === 'TemplateLiteral')) {
        validateStringInterpolation(ctx, node.initializer.value, true, node.initializer.location);
      } else {
        visitExpression(node.initializer);
      }
      if (node.typeAnnotation) {
        validateLitType(node.initializer, node.typeAnnotation, node.location);
      }
    }
  }

  function visitDestructuringDeclaration(node: AST.DestructuringDeclaration): void {
    for (const field of node.fields) {
      if (!isValidType(field.type)) {
        ctx.error(`Invalid type '${field.type}' for field '${field.name}'`, node.location);
      }
    }

    if (node.initializer.type !== 'VibeExpression') {
      ctx.error('Destructuring assignment requires a do or vibe expression', node.location);
    }

    if (node.isAsync) {
      validateAsyncExpression(ctx, node.initializer, node.location);
    }

    const seenNames = new Set<string>();
    const uniqueFields: typeof node.fields = [];
    for (const field of node.fields) {
      if (seenNames.has(field.name)) {
        ctx.error(`Duplicate field '${field.name}' in destructuring pattern`, node.location);
      } else {
        seenNames.add(field.name);
        uniqueFields.push(field);
      }
    }

    visitExpression(node.initializer);

    const declarationKind = node.isConst ? 'constant' : 'variable';
    for (const field of uniqueFields) {
      ctx.declare(field.name, declarationKind, node.location, { typeAnnotation: field.type });
    }
  }

  function visitAssignmentExpression(node: AST.AssignmentExpression): void {
    const name = node.target.name;
    const symbol = ctx.symbols.lookup(name);

    if (!symbol) {
      ctx.error(`'${name}' is not defined`, node.target.location);
    } else if (symbol.kind === 'constant') {
      ctx.error(`Cannot reassign constant '${name}'`, node.location);
    } else if (symbol.kind === 'function') {
      ctx.error(`Cannot reassign function '${name}'`, node.location);
    } else if (symbol.kind === 'model') {
      ctx.error(`Cannot reassign model '${name}'`, node.location);
    } else if (symbol.kind === 'import') {
      ctx.error(`Cannot reassign imported '${name}'`, node.location);
    }

    visitExpression(node.value);
  }

  function visitImportDeclaration(node: AST.ImportDeclaration): void {
    if (!state.atTopLevel) {
      ctx.error('Imports can only be at global scope', node.location);
      return;
    }

    const isToolImport = node.source === 'system/tools';

    if (node.sourceType === 'ts' && ctx.basePath) {
      const sourcePath = resolve(dirname(ctx.basePath), node.source);
      for (const spec of node.specifiers) {
        try {
          const sig = extractFunctionSignature(sourcePath, spec.imported);
          if (sig) {
            ctx.tsImportSignatures.set(spec.local, sig);
          }
        } catch {
          // Skip if can't extract signature
        }
      }
    }

    for (const spec of node.specifiers) {
      const existing = ctx.symbols.lookup(spec.local);
      if (existing) {
        if (existing.kind === 'import' || existing.kind === 'tool') {
          ctx.error(
            `'${spec.local}' is already imported from another module`,
            node.location
          );
        } else {
          ctx.error(
            `Import '${spec.local}' conflicts with existing ${existing.kind}`,
            node.location
          );
        }
      } else {
        // Tool bundles (allTools, readonlyTools, safeTools) are imports, individual tools are 'tool' kind
        const toolBundles = ['allTools', 'readonlyTools', 'safeTools'];
        const importKind = isToolImport && !toolBundles.includes(spec.local) ? 'tool' : 'import';
        ctx.declare(spec.local, importKind, node.location);
      }
    }
  }

  function visitFunction(node: AST.FunctionDeclaration): void {
    const wasInFunction = state.inFunction;
    state.inFunction = true;
    ctx.symbols.enterScope();

    for (const param of node.params) {
      validateTypeAnnotation(ctx, param.typeAnnotation, node.location);
      ctx.declare(param.name, 'parameter', node.location, { typeAnnotation: param.typeAnnotation });
    }

    if (node.returnType) {
      validateTypeAnnotation(ctx, node.returnType, node.location);
    }

    visitStatement(node.body);

    ctx.symbols.exitScope();
    state.inFunction = wasInFunction;
  }

  return { visitStatement, visitExpression };
}
