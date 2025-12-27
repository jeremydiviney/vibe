import type { FileSymbols, SymbolInfo } from './symbol-extractor.js';
import path from 'path';

export interface FormatOptions {
  textLimit?: number;
  showFiles?: boolean;  // Include file path with each symbol
  basePath?: string;    // Base path for relative file paths
  format?: 'tree' | 'adjacency';  // Output format
  entrySymbol?: string; // When set, only show symbols within depth levels of this entry point
  entryFile?: string;   // File path to disambiguate entry symbol (e.g., "src/parser/parse.ts")
  depth?: number;       // Max levels from entry point (default: Infinity)
}

interface FlatSymbol extends SymbolInfo {
  filePath: string;
  relativePath: string;
}

// Build a call graph map for BFS traversal
function buildCallGraph(flatSymbols: FlatSymbol[]): Map<string, string[]> {
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
function findReachableSymbols(
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

// Flatten file-grouped symbols into a single list sorted by symbol name
function flattenSymbols(fileSymbols: FileSymbols[], basePath: string): FlatSymbol[] {
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

function formatSymbol(symbol: FlatSymbol, options: FormatOptions, indent: string = ''): string {
  const { showFiles = true } = options;

  let line = `${indent}${symbol.kind} ${symbol.name}`;

  if (symbol.signature) {
    line += symbol.signature;
  }

  if (showFiles) {
    line += ` (${symbol.relativePath}:${symbol.line})`;
  }

  return line;
}

function formatChildren(
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

export function formatSymbolTree(
  fileSymbols: FileSymbols[],
  options: FormatOptions = {}
): string {
  const {
    textLimit = 10000,
    showFiles = true,
    basePath = process.cwd(),
    entrySymbol,
    entryFile,
    depth = Infinity
  } = options;

  const flatSymbols = flattenSymbols(fileSymbols, basePath);

  if (flatSymbols.length === 0) {
    return 'No symbols found.';
  }

  // Build call graph and find reachable symbols if depth limiting
  let reachableSymbols: Set<string> | null = null;
  if (depth !== Infinity) {
    const callGraph = buildCallGraph(flatSymbols);

    // Find entry points, optionally disambiguated by file
    let entryPoints: string[];
    if (entrySymbol) {
      // If entryFile is provided, match both symbol name AND file path
      if (entryFile) {
        const normalizedEntryFile = entryFile.replace(/\\/g, '/');
        const matchingSymbols = flatSymbols.filter(s =>
          s.name === entrySymbol &&
          s.relativePath.replace(/\\/g, '/').includes(normalizedEntryFile)
        );
        entryPoints = matchingSymbols.map(s => s.name);
        if (entryPoints.length === 0) {
          // Fallback: try exact match on just symbol name
          entryPoints = [entrySymbol];
        }
      } else {
        entryPoints = [entrySymbol];
      }
    } else {
      entryPoints = flatSymbols.map(s => s.name);
    }
    reachableSymbols = findReachableSymbols(entryPoints, callGraph, depth);
  }

  // Filter symbols if we have a reachability constraint
  const filteredSymbols = reachableSymbols
    ? flatSymbols.filter(s => reachableSymbols!.has(s.name))
    : flatSymbols;

  const lines: string[] = [];
  let currentLength = 0;
  let truncated = false;

  // BREADTH-FIRST with proper tree output:
  // Pass 1: Output all top-level symbols (headers only, no children)
  // Pass 2: Output each symbol with its full tree (header + children)

  // Pass 1: Quick overview of all symbols
  lines.push('=== SYMBOLS OVERVIEW ===');
  currentLength += 24;

  for (const symbol of filteredSymbols) {
    let line = `${symbol.kind} ${symbol.name}`;
    if (symbol.signature) {
      line += symbol.signature;
    }
    if (showFiles) {
      line += ` (${symbol.relativePath}:${symbol.line})`;
    }

    const lineLength = line.length + 1;
    if (currentLength + lineLength > textLimit) {
      truncated = true;
      break;
    }
    lines.push(line);
    currentLength += lineLength;
  }

  if (truncated) {
    lines.push('');
    lines.push('[truncated - text_limit reached]');
    return lines.join('\n');
  }

  // Pass 2: Full trees for symbols with children or outer scope access
  const symbolsWithDetails = filteredSymbols.filter(s =>
    (s.children && s.children.length > 0) ||
    (s.outerReads && s.outerReads.length > 0) ||
    (s.outerWrites && s.outerWrites.length > 0)
  );

  if (symbolsWithDetails.length > 0) {
    lines.push('');
    lines.push('=== DETAILED MEMBERS ===');
    currentLength += 26;

    for (const symbol of symbolsWithDetails) {
      // Symbol header
      let header = `\n${symbol.kind} ${symbol.name}`;
      if (showFiles) {
        header += ` (${symbol.relativePath}:${symbol.line})`;
      }

      if (currentLength + header.length + 1 > textLimit) {
        truncated = true;
        break;
      }
      lines.push(header);
      currentLength += header.length + 1;

      // Children as tree (calls, uses, methods)
      if (symbol.children && symbol.children.length > 0) {
        const childLines = formatChildren(symbol.children!, '', basePath, symbol.outerReads, symbol.outerWrites);
        for (const childLine of childLines) {
          const childLength = childLine.length + 1;
          if (currentLength + childLength > textLimit) {
            truncated = true;
            break;
          }
          lines.push(childLine);
          currentLength += childLength;
        }
      }

      // Add outer scope access at end if no children showed it
      if (!symbol.children || symbol.children.length === 0) {
        if (symbol.outerReads && symbol.outerReads.length > 0) {
          const line = `├─ reads (outer): ${symbol.outerReads.join(', ')}`;
          lines.push(line);
          currentLength += line.length + 1;
        }
        if (symbol.outerWrites && symbol.outerWrites.length > 0) {
          const line = `└─ writes (outer): ${symbol.outerWrites.join(', ')}`;
          lines.push(line);
          currentLength += line.length + 1;
        }
      }

      if (truncated) break;
    }
  }

  if (truncated) {
    lines.push('');
    lines.push('[truncated - text_limit reached]');
  }

  return lines.join('\n');
}

// Alternative: Format grouped by file (original approach)
export function formatByFile(
  fileSymbols: FileSymbols[],
  options: FormatOptions = {}
): string {
  const {
    textLimit = 10000,
    basePath = process.cwd()
  } = options;

  const lines: string[] = [];
  let currentLength = 0;
  let truncated = false;

  for (const file of fileSymbols) {
    const relativePath = path.relative(basePath, file.filePath);

    // File header
    const header = relativePath;
    if (currentLength + header.length + 1 > textLimit) {
      truncated = true;
      break;
    }
    lines.push(header);
    currentLength += header.length + 1;

    // Symbols in file
    for (let i = 0; i < file.symbols.length; i++) {
      const symbol = file.symbols[i];
      const isLast = i === file.symbols.length - 1;
      const prefix = isLast ? '└─ ' : '├─ ';

      let line = `${prefix}${symbol.kind} ${symbol.name}`;
      if (symbol.signature) {
        line += symbol.signature;
      }

      if (currentLength + line.length + 1 > textLimit) {
        truncated = true;
        break;
      }
      lines.push(line);
      currentLength += line.length + 1;

      // Children
      if (symbol.children && symbol.children.length > 0) {
        const childIndent = isLast ? '   ' : '│  ';
        const childLines = formatChildren(symbol.children, childIndent, basePath, symbol.outerReads, symbol.outerWrites);

        for (const childLine of childLines) {
          if (currentLength + childLine.length + 1 > textLimit) {
            truncated = true;
            break;
          }
          lines.push(childLine);
          currentLength += childLine.length + 1;
        }

        if (truncated) break;
      }
    }

    if (truncated) break;

    // Blank line between files
    lines.push('');
    currentLength += 1;
  }

  if (truncated) {
    lines.push('[truncated - text_limit reached]');
  }

  return lines.join('\n');
}

// Adjacency list format - grouped by symbol
export function formatAdjacencyList(
  fileSymbols: FileSymbols[],
  options: FormatOptions = {}
): string {
  const {
    textLimit = 10000,
    showFiles = true,
    basePath = process.cwd(),
    entrySymbol,
    entryFile,
    depth = Infinity
  } = options;

  const flatSymbols = flattenSymbols(fileSymbols, basePath);

  if (flatSymbols.length === 0) {
    return 'No symbols found.';
  }

  // Build call graph and find reachable symbols if depth limiting
  let reachableSymbols: Set<string> | null = null;
  if (depth !== Infinity) {
    const callGraph = buildCallGraph(flatSymbols);

    // Find entry points, optionally disambiguated by file
    let entryPoints: string[];
    if (entrySymbol) {
      // If entryFile is provided, match both symbol name AND file path
      if (entryFile) {
        const normalizedEntryFile = entryFile.replace(/\\/g, '/');
        const matchingSymbols = flatSymbols.filter(s =>
          s.name === entrySymbol &&
          s.relativePath.replace(/\\/g, '/').includes(normalizedEntryFile)
        );
        entryPoints = matchingSymbols.map(s => s.name);
        if (entryPoints.length === 0) {
          // Fallback: try exact match on just symbol name
          entryPoints = [entrySymbol];
        }
      } else {
        entryPoints = [entrySymbol];
      }
    } else {
      entryPoints = flatSymbols.map(s => s.name); // All symbols as entry points if no specific one
    }
    reachableSymbols = findReachableSymbols(entryPoints, callGraph, depth);
  }

  // Filter symbols if we have a reachability constraint
  const filteredSymbols = reachableSymbols
    ? flatSymbols.filter(s => reachableSymbols!.has(s.name))
    : flatSymbols;

  const lines: string[] = [];
  let currentLength = 0;
  let truncated = false;

  // Section 1: SYMBOLS (flat list with signatures)
  lines.push('=== SYMBOLS ===');
  currentLength += 16;

  for (const symbol of filteredSymbols) {
    let line = `${symbol.kind} ${symbol.name}`;
    if (symbol.signature) {
      line += symbol.signature;
    }
    if (showFiles) {
      line += ` (${symbol.relativePath}:${symbol.line})`;
    }

    const lineLength = line.length + 1;
    if (currentLength + lineLength > textLimit) {
      truncated = true;
      break;
    }
    lines.push(line);
    currentLength += lineLength;
  }

  if (truncated) {
    lines.push('[truncated - text_limit reached]');
    return lines.join('\n');
  }

  // Section 2: DEPENDENCIES (grouped by symbol)
  lines.push('');
  lines.push('=== DEPENDENCIES ===');
  currentLength += 22;

  // Helper to format a symbol's dependencies
  const formatSymbolDeps = (name: string, symbol: SymbolInfo): string[] => {
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
  };

  for (const symbol of filteredSymbols) {
    // Format function dependencies
    if (symbol.kind === 'function') {
      const depLines = formatSymbolDeps(symbol.name, symbol);
      for (const line of depLines) {
        const lineLength = line.length + 1;
        if (currentLength + lineLength > textLimit) {
          truncated = true;
          break;
        }
        lines.push(line);
        currentLength += lineLength;
      }
    }

    // Format class method dependencies
    if (symbol.kind === 'class' && symbol.children) {
      for (const method of symbol.children) {
        if (method.kind === 'method') {
          const depLines = formatSymbolDeps(`${symbol.name}.${method.name}`, method);
          for (const line of depLines) {
            const lineLength = line.length + 1;
            if (currentLength + lineLength > textLimit) {
              truncated = true;
              break;
            }
            lines.push(line);
            currentLength += lineLength;
          }
        }
        if (truncated) break;
      }
    }

    if (truncated) break;
  }

  if (truncated) {
    lines.push('[truncated - text_limit reached]');
  }

  return lines.join('\n');
}

// Extract direct call names from a symbol's children
function extractDirectCalls(symbol: SymbolInfo): string[] {
  if (!symbol.children) return [];

  return symbol.children
    .filter(c => c.kind === 'calls' || c.kind === 'uses')
    .map(c => c.name);
}

// Format outer scope access for a symbol
function formatOuterAccess(symbol: SymbolInfo, prefix: string = ''): string | null {
  const parts: string[] = [];

  if (symbol.outerReads && symbol.outerReads.length > 0) {
    parts.push(`reads ${symbol.outerReads.join(', ')}`);
  }
  if (symbol.outerWrites && symbol.outerWrites.length > 0) {
    parts.push(`writes ${symbol.outerWrites.join(', ')}`);
  }

  if (parts.length === 0) return null;

  return `${prefix}${symbol.name}: ${parts.join('; ')}`;
}
