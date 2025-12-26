import type { SourceLocation } from '../errors';

export type SymbolKind = 'variable' | 'constant' | 'model' | 'function' | 'parameter' | 'import';

export interface Symbol {
  name: string;
  kind: SymbolKind;
  location: SourceLocation;
  paramCount?: number;
  typeAnnotation?: string | null;
}

interface Scope {
  parent: Scope | null;
  symbols: Map<string, Symbol>;
}

export class SymbolTable {
  private currentScope: Scope | null = null;

  enterScope(): void {
    this.currentScope = {
      parent: this.currentScope,
      symbols: new Map(),
    };
  }

  exitScope(): void {
    if (this.currentScope) {
      this.currentScope = this.currentScope.parent;
    }
  }

  declare(symbol: Symbol): boolean {
    if (!this.currentScope) return false;
    if (this.currentScope.symbols.has(symbol.name)) {
      return false;
    }
    this.currentScope.symbols.set(symbol.name, symbol);
    return true;
  }

  lookup(name: string): Symbol | undefined {
    let scope = this.currentScope;
    while (scope) {
      const symbol = scope.symbols.get(name);
      if (symbol) return symbol;
      scope = scope.parent;
    }
    return undefined;
  }

  lookupLocal(name: string): Symbol | undefined {
    return this.currentScope?.symbols.get(name);
  }
}
