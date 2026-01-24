/**
 * Visitor Context
 *
 * Shared interface for extracted visitor modules. Solves circular
 * dependencies by passing dispatch functions as callbacks.
 */
import type * as AST from '../../ast';
import type { AnalyzerContext, AnalyzerState } from '../analyzer-context';

export interface VisitorContext {
  ctx: AnalyzerContext;
  state: AnalyzerState;
  visitStatement: (stmt: AST.Statement) => void;
  visitExpression: (expr: AST.Expression) => void;
  getExprType: (expr: AST.Expression) => string | null;
}
