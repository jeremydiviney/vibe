import type * as AST from '../ast';
import type { SemanticError } from '../errors';
import { SemanticAnalyzer } from './analyzer';

export { SymbolTable, type Symbol, type SymbolKind } from './symbol-table';
export { SemanticAnalyzer } from './analyzer';

export function analyze(program: AST.Program, source: string, basePath: string): SemanticError[] {
  const analyzer = new SemanticAnalyzer();
  return analyzer.analyze(program, source, basePath);
}
