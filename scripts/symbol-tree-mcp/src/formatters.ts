// Main formatter exports

import path from 'path';
import type { FileSymbols, FormatOptions } from './types.js';
import { createOutputContext, addLine, addLines, finalizeOutput } from './output.js';
import { buildTypeDependencyGraph } from './graph.js';
import { prepareSymbols } from './symbols.js';
import { formatChildren, formatTypeDependencyTree, formatSymbolDeps } from './tree-format.js';

export function formatSymbolTree(
  fileSymbols: FileSymbols[],
  options: FormatOptions = {}
): string {
  const { textLimit = 10000, showFiles = true, basePath = process.cwd() } = options;

  const prepared = prepareSymbols(fileSymbols, options);
  if (!prepared) return 'No symbols found.';

  const { typeSymbols, filteredFunctionSymbols } = prepared;
  const ctx = createOutputContext(textLimit);

  // Section 1: TYPE SYMBOLS (interfaces, types, enums)
  if (typeSymbols.length > 0) {
    if (!addLine(ctx, '=== TYPE SYMBOLS ===')) return finalizeOutput(ctx);

    for (const symbol of typeSymbols) {
      let line = `${symbol.kind} ${symbol.name}`;
      if (showFiles) {
        line += ` (${symbol.relativePath}:${symbol.line}-${symbol.endLine})`;
      }
      if (!addLine(ctx, line)) return finalizeOutput(ctx);
    }

    // Section 2: TYPE DEPENDENCIES (recursive trees)
    const typesWithDeps = typeSymbols.filter(s =>
      s.extends || s.implements || s.typeUses
    );

    if (typesWithDeps.length > 0) {
      if (!addLines(ctx, ['', '=== TYPE DEPENDENCIES ==='])) return finalizeOutput(ctx);

      const typeGraph = buildTypeDependencyGraph(typeSymbols);

      for (const symbol of typesWithDeps) {
        // Type header
        let header = `\n${symbol.kind} ${symbol.name}`;
        if (showFiles) {
          header += ` (${symbol.relativePath}:${symbol.line}-${symbol.endLine})`;
        }
        if (!addLine(ctx, header)) return finalizeOutput(ctx);

        // Format type dependencies as tree
        const visited = new Set<string>([symbol.name]);
        const depLines = formatTypeDependencyTree(symbol, typeGraph, '', visited, 5);
        if (!addLines(ctx, depLines)) return finalizeOutput(ctx);
      }
    }

    if (!addLine(ctx, '')) return finalizeOutput(ctx);
  }

  // Section 3: SYMBOLS OVERVIEW (functions, classes)
  if (!addLine(ctx, '=== SYMBOLS OVERVIEW ===')) return finalizeOutput(ctx);

  for (const symbol of filteredFunctionSymbols) {
    let line = `${symbol.kind} ${symbol.name}`;
    if (symbol.signature) {
      line += symbol.signature;
    }
    if (showFiles) {
      line += ` (${symbol.relativePath}:${symbol.line}-${symbol.endLine})`;
    }
    if (!addLine(ctx, line)) return finalizeOutput(ctx);
  }

  // Section 4: DETAILED MEMBERS (full trees for functions with children)
  const symbolsWithDetails = filteredFunctionSymbols.filter(s =>
    (s.children && s.children.length > 0) ||
    (s.outerReads && s.outerReads.length > 0) ||
    (s.outerWrites && s.outerWrites.length > 0)
  );

  if (symbolsWithDetails.length > 0) {
    if (!addLines(ctx, ['', '=== DETAILED MEMBERS ==='])) return finalizeOutput(ctx);

    for (const symbol of symbolsWithDetails) {
      // Symbol header
      let header = `\n${symbol.kind} ${symbol.name}`;
      if (showFiles) {
        header += ` (${symbol.relativePath}:${symbol.line}-${symbol.endLine})`;
      }
      if (!addLine(ctx, header)) return finalizeOutput(ctx);

      // Children as tree (calls, uses, methods)
      if (symbol.children && symbol.children.length > 0) {
        const childLines = formatChildren(symbol.children!, '', basePath, symbol.outerReads, symbol.outerWrites);
        if (!addLines(ctx, childLines)) return finalizeOutput(ctx);
      }

      // Add outer scope access at end if no children showed it
      if (!symbol.children || symbol.children.length === 0) {
        if (symbol.outerReads && symbol.outerReads.length > 0) {
          if (!addLine(ctx, `├─ reads (outer): ${symbol.outerReads.join(', ')}`)) return finalizeOutput(ctx);
        }
        if (symbol.outerWrites && symbol.outerWrites.length > 0) {
          if (!addLine(ctx, `└─ writes (outer): ${symbol.outerWrites.join(', ')}`)) return finalizeOutput(ctx);
        }
      }
    }
  }

  return finalizeOutput(ctx);
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
  const { textLimit = 10000, showFiles = true } = options;

  const prepared = prepareSymbols(fileSymbols, options);
  if (!prepared) return 'No symbols found.';

  const { typeSymbols, filteredFunctionSymbols } = prepared;
  const ctx = createOutputContext(textLimit);

  // Section 1: TYPE SYMBOLS (interfaces, types, enums)
  if (typeSymbols.length > 0) {
    if (!addLine(ctx, '=== TYPE SYMBOLS ===')) return finalizeOutput(ctx);

    for (const symbol of typeSymbols) {
      let line = `${symbol.kind} ${symbol.name}`;
      if (showFiles) {
        line += ` (${symbol.relativePath}:${symbol.line}-${symbol.endLine})`;
      }
      if (!addLine(ctx, line)) return finalizeOutput(ctx);
    }

    // Section 2: TYPE DEPENDENCIES
    const typesWithDeps = typeSymbols.filter(s =>
      s.extends || s.implements || s.typeUses
    );

    if (typesWithDeps.length > 0) {
      if (!addLines(ctx, ['', '=== TYPE DEPENDENCIES ==='])) return finalizeOutput(ctx);

      for (const symbol of typesWithDeps) {
        const depLines: string[] = [`${symbol.name}:`];

        if (symbol.extends && symbol.extends.length > 0) {
          depLines.push(`  extends: ${symbol.extends.join(', ')}`);
        }
        if (symbol.implements && symbol.implements.length > 0) {
          depLines.push(`  implements: ${symbol.implements.join(', ')}`);
        }
        if (symbol.typeUses && symbol.typeUses.length > 0) {
          depLines.push(`  uses: ${symbol.typeUses.join(', ')}`);
        }

        if (!addLines(ctx, depLines)) return finalizeOutput(ctx);
      }
    }

    if (!addLine(ctx, '')) return finalizeOutput(ctx);
  }

  // Section 3: SYMBOLS (functions, classes - flat list with signatures)
  if (!addLine(ctx, '=== SYMBOLS ===')) return finalizeOutput(ctx);

  for (const symbol of filteredFunctionSymbols) {
    let line = `${symbol.kind} ${symbol.name}`;
    if (symbol.signature) {
      line += symbol.signature;
    }
    if (showFiles) {
      line += ` (${symbol.relativePath}:${symbol.line}-${symbol.endLine})`;
    }
    if (!addLine(ctx, line)) return finalizeOutput(ctx);
  }

  // Section 4: DEPENDENCIES (grouped by symbol)
  if (!addLines(ctx, ['', '=== DEPENDENCIES ==='])) return finalizeOutput(ctx);

  for (const symbol of filteredFunctionSymbols) {
    // Format function dependencies
    if (symbol.kind === 'function') {
      if (!addLines(ctx, formatSymbolDeps(symbol.name, symbol))) return finalizeOutput(ctx);
    }

    // Format class method dependencies
    if (symbol.kind === 'class' && symbol.children) {
      for (const method of symbol.children) {
        if (method.kind === 'method') {
          if (!addLines(ctx, formatSymbolDeps(`${symbol.name}.${method.name}`, method))) {
            return finalizeOutput(ctx);
          }
        }
      }
    }
  }

  return finalizeOutput(ctx);
}
