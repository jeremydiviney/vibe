/**
 * Function and Tool Declaration Visitors
 *
 * Handles semantic analysis of function and tool declarations,
 * including return type checking and inference.
 */
import * as AST from '../../ast';
import { validateTypeAnnotation } from '../analyzer-validators';
import type { VisitorContext } from './types';

export function visitFunction(vc: VisitorContext, node: AST.FunctionDeclaration): void {
  const { ctx, state, visitStatement } = vc;

  const wasInFunction = state.inFunction;
  const prevReturnType = state.currentFunctionReturnType;
  state.inFunction = true;
  state.currentFunctionReturnType = node.returnType;
  ctx.symbols.enterScope();

  for (const param of node.params) {
    validateTypeAnnotation(ctx, param.vibeType, node.location);
    ctx.declare(param.name, 'parameter', node.location, { vibeType: param.vibeType });
  }

  if (node.returnType) {
    validateTypeAnnotation(ctx, node.returnType, node.location);
  }

  // Visit body statements directly (don't use visitStatement on the BlockStatement
  // which would create a redundant nested scope - the function scope is sufficient)
  const wasAtTopLevel = state.atTopLevel;
  state.atTopLevel = false;
  for (const stmt of node.body.body) {
    visitStatement(stmt);
  }
  state.atTopLevel = wasAtTopLevel;

  // Check that typed functions always return or throw
  if (node.returnType && !alwaysReturnsOrThrows(node.body, true)) {
    ctx.error(
      `Function '${node.name}' has return type '${node.returnType}' but not all code paths return or throw`,
      node.location
    );
  }

  // Infer return type from return statements if not explicitly annotated
  if (!node.returnType) {
    const inferredType = inferReturnTypeFromBody(vc, node.body);
    if (inferredType) {
      node.returnType = inferredType;
      const symbol = ctx.symbols.lookup(node.name);
      if (symbol) {
        symbol.returnType = inferredType;
      }
    }
  }

  ctx.symbols.exitScope();
  state.inFunction = wasInFunction;
  state.currentFunctionReturnType = prevReturnType;
}

export function visitTool(vc: VisitorContext, node: AST.ToolDeclaration): void {
  const { ctx, state, visitStatement } = vc;

  const wasInFunction = state.inFunction;
  const prevReturnType = state.currentFunctionReturnType;
  state.inFunction = true;
  state.currentFunctionReturnType = node.returnType;
  ctx.symbols.enterScope();

  for (const param of node.params) {
    ctx.declare(param.name, 'parameter', node.location, { vibeType: param.vibeType });
  }

  visitStatement(node.body);

  // Tools always have a return type - check that all code paths return or throw
  if (!alwaysReturnsOrThrows(node.body, true)) {
    ctx.error(
      `Tool '${node.name}' has return type '${node.returnType}' but not all code paths return or throw`,
      node.location
    );
  }

  ctx.symbols.exitScope();
  state.inFunction = wasInFunction;
  state.currentFunctionReturnType = prevReturnType;
}

/**
 * Check if a statement always returns or throws on all code paths.
 * Used to verify functions with return types exit properly.
 *
 * Note: In Vibe, if a function/tool body ends with an expression statement,
 * that expression's value is implicitly returned.
 */
export function alwaysReturnsOrThrows(stmt: AST.Statement, isLastInBlock: boolean = false): boolean {
  switch (stmt.type) {
    case 'ReturnStatement':
    case 'ThrowStatement':
      return true;

    case 'ExpressionStatement':
      // An expression at the end of a function/tool body is an implicit return
      return isLastInBlock;

    case 'IfStatement':
      // Must have else branch and both branches must return
      if (!stmt.alternate) {
        return false;
      }
      return alwaysReturnsOrThrows(stmt.consequent, isLastInBlock) &&
             alwaysReturnsOrThrows(stmt.alternate, isLastInBlock);

    case 'BlockStatement':
      // Check if any statement in the block guarantees return/throw
      // For the last statement, also consider implicit returns
      for (let i = 0; i < stmt.body.length; i++) {
        const s = stmt.body[i];
        const isLast = i === stmt.body.length - 1;
        if (alwaysReturnsOrThrows(s, isLast && isLastInBlock)) {
          return true;
        }
      }
      return false;

    case 'ForInStatement':
    case 'WhileStatement':
      // Loops don't guarantee execution (might iterate 0 times)
      return false;

    default:
      return false;
  }
}

/**
 * Infer return type from a function body by examining return statements.
 */
export function inferReturnTypeFromBody(vc: VisitorContext, body: AST.Statement): string | null {
  const { getExprType } = vc;
  const returnExprs: AST.Expression[] = [];
  collectReturnExpressions(body, returnExprs);
  if (returnExprs.length === 0) return null;

  // Use the type of the first return expression
  const firstType = getExprType(returnExprs[0]);
  if (!firstType) return null;

  // All return expressions should have the same type
  for (const expr of returnExprs) {
    const t = getExprType(expr);
    if (t && t !== firstType) return null; // Conflicting types, can't infer
  }

  return firstType;
}

/**
 * Recursively collect return expressions from statements.
 */
export function collectReturnExpressions(stmt: AST.Statement, out: AST.Expression[]): void {
  if (stmt.type === 'ReturnStatement' && stmt.value) {
    out.push(stmt.value);
    return;
  }
  if (stmt.type === 'BlockStatement') {
    for (const s of stmt.body) collectReturnExpressions(s, out);
  }
  if (stmt.type === 'IfStatement') {
    collectReturnExpressions(stmt.consequent, out);
    if (stmt.alternate) collectReturnExpressions(stmt.alternate, out);
  }
  if (stmt.type === 'WhileStatement' || stmt.type === 'ForInStatement') {
    collectReturnExpressions(stmt.body, out);
  }
}
