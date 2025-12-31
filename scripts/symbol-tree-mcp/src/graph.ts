// Call graph and reachability analysis

import type { FlatSymbol } from './types.js';

// Build a call graph map for BFS traversal
export function buildCallGraph(flatSymbols: FlatSymbol[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const symbol of flatSymbols) {
    const calls: string[] = [];

    // Direct calls from this symbol
    if (symbol.children) {
      for (const child of symbol.children) {
        if (child.kind === 'calls' || child.kind === 'uses') {
          calls.push(child.name);
        }
      }
    }

    // For classes, also map method calls
    if (symbol.kind === 'class' && symbol.children) {
      for (const method of symbol.children) {
        if (method.kind === 'method' && method.children) {
          const methodCalls: string[] = [];
          for (const child of method.children) {
            if (child.kind === 'calls' || child.kind === 'uses') {
              methodCalls.push(child.name);
            }
          }
          if (methodCalls.length > 0) {
            graph.set(`${symbol.name}.${method.name}`, methodCalls);
          }
        }
      }
    }

    if (calls.length > 0) {
      graph.set(symbol.name, calls);
    }
  }

  return graph;
}

// Find all symbols reachable within N levels from entry points using BFS
export function findReachableSymbols(
  entryPoints: string[],
  callGraph: Map<string, string[]>,
  maxDepth: number
): Set<string> {
  const reachable = new Set<string>();
  const queue: { name: string; depth: number }[] = [];

  // Start with entry points at depth 0
  for (const entry of entryPoints) {
    queue.push({ name: entry, depth: 0 });
    reachable.add(entry);
  }

  while (queue.length > 0) {
    const { name, depth } = queue.shift()!;

    if (depth >= maxDepth) continue;

    const calls = callGraph.get(name) ?? [];
    for (const callee of calls) {
      if (!reachable.has(callee)) {
        reachable.add(callee);
        queue.push({ name: callee, depth: depth + 1 });
      }
    }
  }

  return reachable;
}

// Build a type dependency graph for recursive type tree expansion
export function buildTypeDependencyGraph(typeSymbols: FlatSymbol[]): Map<string, { extends?: string[], uses?: string[] }> {
  const graph = new Map<string, { extends?: string[], uses?: string[] }>();

  for (const symbol of typeSymbols) {
    if (symbol.extends || symbol.typeUses) {
      graph.set(symbol.name, {
        extends: symbol.extends,
        uses: symbol.typeUses
      });
    }
  }

  return graph;
}
