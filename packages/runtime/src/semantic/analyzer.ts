/**
 * Semantic Analyzer
 *
 * Main entry point for semantic analysis of Vibe programs.
 * Orchestrates the analysis using modular validators and visitors.
 */
import * as AST from '../ast';
import { SemanticError, type SourceLocation } from '../errors';
import { SymbolTable, type SymbolKind } from './symbol-table';
import { TypeRegistry } from './type-registry';
import type { TsFunctionSignature } from './ts-signatures';
import type { AnalyzerContext, AnalyzerState } from './analyzer-context';
import { createVisitors } from './analyzer-visitors';

export class SemanticAnalyzer {
  private symbols = new SymbolTable();
  private typeRegistry = new TypeRegistry();
  private errors: SemanticError[] = [];
  private source?: string;
  private basePath?: string;
  private tsImportSignatures: Map<string, TsFunctionSignature> = new Map();

  /**
   * Analyze a Vibe program and return any semantic errors.
   */
  analyze(program: AST.Program, source?: string, basePath?: string): SemanticError[] {
    this.errors = [];
    this.source = source;
    this.basePath = basePath;
    this.tsImportSignatures.clear();
    this.typeRegistry = new TypeRegistry();  // Fresh registry for each analysis
    this.symbols = new SymbolTable();  // Fresh symbol table for each analysis
    this.symbols.enterScope();

    // Create context and state for visitors
    const ctx = this.createContext();
    const state: AnalyzerState = {
      inFunction: false,
      atTopLevel: true,
      loopDepth: 0,
      currentFunctionReturnType: null,
    };

    // Create visitors with context
    const visitors = createVisitors(ctx, state);

    // Visit all statements
    for (const stmt of program.body) {
      visitors.visitStatement(stmt);
    }

    // Note: scope intentionally left open so getSymbols() can query after analysis
    return this.errors;
  }

  /**
   * Create the analyzer context for validators and visitors.
   */
  private createContext(): AnalyzerContext {
    return {
      symbols: this.symbols,
      typeRegistry: this.typeRegistry,
      tsImportSignatures: this.tsImportSignatures,
      basePath: this.basePath,
      source: this.source,
      inFunction: false,
      atTopLevel: true,
      loopDepth: 0,
      error: (message: string, location: SourceLocation) => {
        this.errors.push(new SemanticError(message, location, this.source));
      },
      declare: (
        name: string,
        kind: SymbolKind,
        location: SourceLocation,
        options?: {
          paramCount?: number;
          vibeType?: string | null;
          paramTypes?: string[];
          returnType?: string | null;
        }
      ) => {
        if (!this.symbols.declare({ name, kind, location, ...options })) {
          this.errors.push(new SemanticError(`'${name}' is already declared`, location, this.source));
        }
      },
    };
  }

  /**
   * Get the type registry (for access to structural type definitions).
   */
  getTypeRegistry(): TypeRegistry {
    return this.typeRegistry;
  }

  /**
   * Get the symbol table (for reading inferred types after analysis).
   */
  getSymbols(): SymbolTable {
    return this.symbols;
  }
}
