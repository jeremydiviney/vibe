/**
 * Analyzer Context
 *
 * Shared interface and types for semantic analyzer modules.
 * Provides a clean way to pass analyzer state to helper functions.
 */
import type { SourceLocation } from '../errors';
import type { SymbolTable, SymbolKind } from './symbol-table';
import type { TsFunctionSignature } from './ts-signatures';
import type { TypeRegistry } from './type-registry';
import type { VibeType } from '../ast';

/**
 * Context interface passed to analyzer helper functions.
 * Contains the shared state needed for semantic analysis.
 */
export interface AnalyzerContext {
  /** Symbol table for scope management */
  symbols: SymbolTable;

  /** Type registry for structural type definitions */
  typeRegistry: TypeRegistry;

  /** Map of imported TS function names to their signatures */
  tsImportSignatures: Map<string, TsFunctionSignature>;

  /** Base path for resolving imports */
  basePath?: string;

  /** Original source code (for error messages) */
  source?: string;

  /** Whether currently inside a function body */
  inFunction: boolean;

  /** Whether at top level (not in a block) */
  atTopLevel: boolean;

  /** Current loop nesting depth (0 = not in a loop) */
  loopDepth: number;

  /** Report an error at the given location */
  error(message: string, location: SourceLocation): void;

  /** Declare a symbol in the current scope */
  declare(
    name: string,
    kind: SymbolKind,
    location: SourceLocation,
    options?: {
      paramCount?: number;
      vibeType?: string | null;
      paramTypes?: string[];
      returnType?: string | null;
    }
  ): void;
}

/**
 * Mutable context state that can be modified during analysis.
 * Separate from AnalyzerContext to make mutation explicit.
 */
export interface AnalyzerState {
  inFunction: boolean;
  atTopLevel: boolean;
  loopDepth: number;
  currentFunctionReturnType: VibeType;  // Track return type for prompt context validation
}
