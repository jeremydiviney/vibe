// Symbol preparation and filtering

import path from 'path';
import type { FileSymbols, FlatSymbol, FormatOptions, PreparedSymbols, SymbolInfo } from './types.js';
import { buildCallGraph, findReachableSymbols } from './graph.js';

// Type symbol kinds for filtering
const TYPE_KINDS = new Set(['interface', 'type', 'enum']);

// Check if a symbol is a type symbol (interface, type, enum, or class with type info)
export function isTypeSymbol(symbol: SymbolInfo): boolean {
  if (TYPE_KINDS.has(symbol.kind)) return true;
  // Classes with extends/implements/typeUses are also type symbols
  if (symbol.kind === 'class' && (symbol.extends || symbol.implements || symbol.typeUses)) return true;
  return false;
}

// Check if a symbol is a function symbol (function, or class with call children)
export function isFunctionSymbol(symbol: SymbolInfo): boolean {
  return symbol.kind === 'function' || symbol.kind === 'class';
}

// Flatten file-grouped symbols into a single list sorted by symbol name
export function flattenSymbols(fileSymbols: FileSymbols[], basePath: string): FlatSymbol[] {
  const flat: FlatSymbol[] = [];

  for (const file of fileSymbols) {
    const relativePath = path.relative(basePath, file.filePath);

    for (const symbol of file.symbols) {
      flat.push({
        ...symbol,
        filePath: file.filePath,
        relativePath
      });
    }
  }

  // Sort by symbol kind priority, then by name
  const kindPriority: Record<string, number> = {
    'class': 1,
    'interface': 2,
    'type': 3,
    'enum': 4,
    'function': 5,
    'variable': 6,
    'namespace': 7,
    'method': 8,
    'property': 9
  };

  return flat.sort((a, b) => {
    const priorityA = kindPriority[a.kind] ?? 99;
    const priorityB = kindPriority[b.kind] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.name.localeCompare(b.name);
  });
}

// Prepare symbols for formatting: flatten, filter, and apply reachability constraints
export function prepareSymbols(
  fileSymbols: FileSymbols[],
  options: FormatOptions
): PreparedSymbols | null {
  const { basePath = process.cwd(), entrySymbol, entryFile, depth = Infinity } = options;

  const flatSymbols = flattenSymbols(fileSymbols, basePath);
  if (flatSymbols.length === 0) return null;

  const typeSymbols = flatSymbols.filter(isTypeSymbol);
  const functionSymbols = flatSymbols.filter(isFunctionSymbol);

  // Apply reachability constraint if depth limiting
  let filteredFunctionSymbols = functionSymbols;
  if (depth !== Infinity) {
    const callGraph = buildCallGraph(flatSymbols);

    // Find entry points, optionally disambiguated by file
    let entryPoints: string[];
    if (entrySymbol) {
      if (entryFile) {
        const normalizedEntryFile = entryFile.replace(/\\/g, '/');
        const matchingSymbols = flatSymbols.filter(s =>
          s.name === entrySymbol &&
          s.relativePath.replace(/\\/g, '/').includes(normalizedEntryFile)
        );
        entryPoints = matchingSymbols.length > 0
          ? matchingSymbols.map(s => s.name)
          : [entrySymbol];
      } else {
        entryPoints = [entrySymbol];
      }
    } else {
      entryPoints = flatSymbols.map(s => s.name);
    }

    const reachableSymbols = findReachableSymbols(entryPoints, callGraph, depth);
    filteredFunctionSymbols = functionSymbols.filter(s => reachableSymbols.has(s.name));
  }

  return { typeSymbols, functionSymbols, filteredFunctionSymbols };
}
