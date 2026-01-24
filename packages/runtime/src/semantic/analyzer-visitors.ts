/**
 * Semantic Analyzer Visitors
 *
 * Thin dispatcher that creates the VisitorContext and delegates
 * to focused visitor modules in ./visitors/.
 */
import * as AST from '../ast';
import type { AnalyzerContext, AnalyzerState } from './analyzer-context';
import {
  validateModelConfig,
  validateToolDeclaration,
  validateConditionType,
  validateAsyncExpression,
  validateContextMode,
  validateStringInterpolation,
  getExpressionType,
} from './analyzer-validators';
import type { VisitorContext } from './visitors/types';
import { visitImportDeclaration } from './visitors/imports';
import { visitVariableDeclaration, visitDestructuringDeclaration, visitTypeDeclaration } from './visitors/declarations';
import { visitFunction, visitTool } from './visitors/functions';
import { visitExpressionBody } from './visitors/expressions';

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
  // Forward declarations for circular reference resolution
  let visitStatement: (node: AST.Statement) => void;
  let visitExpression: (node: AST.Expression) => void;

  const getExprType = (expr: AST.Expression) => getExpressionType(ctx, expr);

  const vc: VisitorContext = {
    ctx,
    state,
    get visitStatement() { return visitStatement; },
    get visitExpression() { return visitExpression; },
    getExprType,
  };

  visitStatement = (node: AST.Statement): void => {
    switch (node.type) {
      case 'ImportDeclaration':
        visitImportDeclaration(vc, node);
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
        visitVariableDeclaration(vc, node, 'variable');
        break;

      case 'ConstDeclaration':
        visitVariableDeclaration(vc, node, 'constant');
        break;

      case 'DestructuringDeclaration':
        visitDestructuringDeclaration(vc, node);
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
          paramTypes: node.params.map(p => p.vibeType),
          returnType: node.returnType,
        });
        visitFunction(vc, node);
        break;

      case 'ReturnStatement':
        if (!state.inFunction) {
          ctx.error('return outside of function', node.location);
        }
        if (node.value) {
          const isPromptReturn = state.currentFunctionReturnType === 'prompt';
          if (isPromptReturn && (node.value.type === 'StringLiteral' || node.value.type === 'TemplateLiteral')) {
            validateStringInterpolation(ctx, node.value.value, true, node.value.location);
          } else {
            visitExpression(node.value);
          }
        }
        break;

      case 'BreakStatement':
        if (state.loopDepth === 0) {
          ctx.error('break outside of loop', node.location);
        }
        break;

      case 'ThrowStatement':
        visitExpression(node.message);
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
        ctx.declare(node.variable, 'variable', node.location, { vibeType: null });
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
          paramTypes: node.params.map(p => p.vibeType),
          returnType: node.returnType,
        });
        validateToolDeclaration(ctx, node);
        visitTool(vc, node);
        break;

      case 'TypeDeclaration':
        visitTypeDeclaration(vc, node);
        break;

      case 'AsyncStatement':
        validateAsyncExpression(ctx, node.expression, node.location);
        visitExpression(node.expression);
        break;
    }
  };

  visitExpression = (node: AST.Expression): void => {
    visitExpressionBody(vc, node);
  };

  return { visitStatement, visitExpression };
}
