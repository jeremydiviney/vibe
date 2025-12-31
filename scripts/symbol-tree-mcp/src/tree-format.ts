// Tree formatting helpers

import path from 'path';
import type { FlatSymbol, SymbolInfo } from './types.js';

// Format children as a tree structure
export function formatChildren(
  children: SymbolInfo[],
  indent: string,
  basePath?: string,
  outerReads?: string[],
  outerWrites?: string[]
): string[] {
  const lines: string[] = [];

  // Count total items including outer scope entries
  const hasOuterReads = outerReads && outerReads.length > 0;
  const hasOuterWrites = outerWrites && outerWrites.length > 0;
  const totalItems = children.length + (hasOuterReads ? 1 : 0) + (hasOuterWrites ? 1 : 0);
  let currentIndex = 0;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    currentIndex++;
    const isLast = currentIndex === totalItems;
    const prefix = isLast ? '└─ ' : '├─ ';
    const childIndent = isLast ? '   ' : '│  ';

    let line = `${indent}${prefix}${child.kind} ${child.name}`;
    if (child.signature) {
      line += child.signature;
    }
    // Show source file for ambiguous calls (when sourceFile is set)
    if (child.sourceFile && (child.kind === 'calls' || child.kind === 'uses')) {
      const relPath = basePath ? path.relative(basePath, child.sourceFile) : child.sourceFile;
      line += ` (${relPath})`;
    }
    lines.push(line);

    // Recursively format grandchildren (methods have their own outer scope)
    if (child.children && child.children.length > 0) {
      lines.push(...formatChildren(child.children, indent + childIndent, basePath, child.outerReads, child.outerWrites));
    } else if (child.kind === 'method') {
      // Method with no call children but may have outer scope access
      if (child.outerReads && child.outerReads.length > 0) {
        const readsLine = `${indent}${childIndent}├─ reads (outer): ${child.outerReads.join(', ')}`;
        lines.push(readsLine);
      }
      if (child.outerWrites && child.outerWrites.length > 0) {
        const writesLine = `${indent}${childIndent}└─ writes (outer): ${child.outerWrites.join(', ')}`;
        lines.push(writesLine);
      }
    }
  }

  // Add outer scope access at end
  if (hasOuterReads) {
    currentIndex++;
    const isLast = currentIndex === totalItems;
    const prefix = isLast ? '└─ ' : '├─ ';
    lines.push(`${indent}${prefix}reads (outer): ${outerReads!.join(', ')}`);
  }
  if (hasOuterWrites) {
    currentIndex++;
    lines.push(`${indent}└─ writes (outer): ${outerWrites!.join(', ')}`);
  }

  return lines;
}

// Format type dependencies as a recursive tree
export function formatTypeDependencyTree(
  symbol: FlatSymbol,
  typeGraph: Map<string, { extends?: string[], uses?: string[] }>,
  indent: string,
  visited: Set<string>,
  maxDepth: number
): string[] {
  const lines: string[] = [];
  if (maxDepth <= 0) return lines;

  const deps = typeGraph.get(symbol.name);
  if (!deps) return lines;

  const allDeps: { kind: string, name: string }[] = [];

  if (deps.extends) {
    for (const ext of deps.extends) {
      allDeps.push({ kind: 'extends', name: ext });
    }
  }
  if (deps.uses) {
    for (const use of deps.uses) {
      allDeps.push({ kind: 'uses', name: use });
    }
  }

  for (let i = 0; i < allDeps.length; i++) {
    const dep = allDeps[i];
    const isLast = i === allDeps.length - 1;
    const prefix = isLast ? '└─ ' : '├─ ';
    const childIndent = isLast ? '   ' : '│  ';

    lines.push(`${indent}${prefix}${dep.kind}: ${dep.name}`);

    // Recursively expand if not visited and has dependencies
    if (!visited.has(dep.name) && typeGraph.has(dep.name)) {
      visited.add(dep.name);
      const childLines = formatTypeDependencyTree(
        { name: dep.name } as FlatSymbol,
        typeGraph,
        indent + childIndent,
        visited,
        maxDepth - 1
      );
      lines.push(...childLines);
      visited.delete(dep.name);
    }
  }

  return lines;
}

// Format a symbol's dependencies for adjacency list format
export function formatSymbolDeps(name: string, symbol: SymbolInfo): string[] {
  const depLines: string[] = [];

  // Extract calls and uses from children
  const calls: string[] = [];
  const uses: string[] = [];
  if (symbol.children) {
    for (const child of symbol.children) {
      if (child.kind === 'calls') calls.push(child.name);
      if (child.kind === 'uses') uses.push(child.name);
    }
  }

  const hasData = calls.length > 0 || uses.length > 0 ||
                  (symbol.outerReads && symbol.outerReads.length > 0) ||
                  (symbol.outerWrites && symbol.outerWrites.length > 0);

  if (!hasData) return depLines;

  depLines.push(`${name}:`);
  if (calls.length > 0) {
    depLines.push(`  calls: ${calls.join(', ')}`);
  }
  if (uses.length > 0) {
    depLines.push(`  uses: ${uses.join(', ')}`);
  }
  if (symbol.outerReads && symbol.outerReads.length > 0) {
    depLines.push(`  reads: ${symbol.outerReads.join(', ')}`);
  }
  if (symbol.outerWrites && symbol.outerWrites.length > 0) {
    depLines.push(`  writes: ${symbol.outerWrites.join(', ')}`);
  }

  return depLines;
}
