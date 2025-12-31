// Shared types for symbol-tree MCP

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method' | 'property' | 'enum' | 'namespace' | 'calls' | 'uses' | 'reads' | 'writes' | 'extends' | 'implements';
  signature?: string;
  exported: boolean;
  line: number;
  endLine: number;
  sourceFile?: string;  // For calls/uses - shows which file the called function is from (only when ambiguous)
  outerReads?: string[];   // Variables read from outer scope
  outerWrites?: string[];  // Variables written to outer scope
  extends?: string[];      // For interfaces/classes that extend others
  implements?: string[];   // For classes implementing interfaces
  typeUses?: string[];     // Types referenced in the definition
  children?: SymbolInfo[];
}

export interface FileSymbols {
  filePath: string;
  symbols: SymbolInfo[];
}

export interface ExtractOptions {
  path?: string;
  file?: string;
  symbol?: string;
  pattern?: string;
  depth?: number;
  exportsOnly?: boolean;
}

export interface FormatOptions {
  textLimit?: number;
  showFiles?: boolean;  // Include file path with each symbol
  basePath?: string;    // Base path for relative file paths
  format?: 'tree' | 'adjacency';  // Output format
  entrySymbol?: string; // When set, only show symbols within depth levels of this entry point
  entryFile?: string;   // File path to disambiguate entry symbol (e.g., "src/parser/parse.ts")
  depth?: number;       // Max levels from entry point (default: Infinity)
}

// Internal types for formatting
export interface FlatSymbol extends SymbolInfo {
  filePath: string;
  relativePath: string;
}

export interface PreparedSymbols {
  typeSymbols: FlatSymbol[];
  functionSymbols: FlatSymbol[];
  filteredFunctionSymbols: FlatSymbol[];
}

export interface OutputContext {
  lines: string[];
  currentLength: number;
  textLimit: number;
  truncated: boolean;
}
