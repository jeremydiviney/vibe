/**
 * Import Declaration Visitors
 *
 * Handles semantic analysis of import statements (TS and Vibe imports).
 */
import * as AST from '../../ast';
import type { SymbolTable } from '../symbol-table';
import { extractFunctionSignature } from '../ts-signatures';
import { resolve, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { parse } from '../../parser/parse';
import type { VisitorContext } from './types';

export function visitImportDeclaration(vc: VisitorContext, node: AST.ImportDeclaration): void {
  const { ctx, state } = vc;

  if (!state.atTopLevel) {
    ctx.error('Imports can only be at global scope', node.location);
    return;
  }

  // Check for system module imports
  const isSystemModule = node.source === 'system/utils' || node.source === 'system/tools';
  const isToolImport = node.source === 'system/tools';

  // Extract TypeScript signatures for non-system TS imports
  // Also track import info for ts block type inference
  if (node.sourceType === 'ts' && ctx.basePath && !isSystemModule) {
    const sourcePath = resolve(dirname(ctx.basePath), node.source);

    // Track import info for ts block type resolution
    const specifierNames = node.specifiers.map(s => s.imported);
    ctx.tsImports.push({ sourcePath, specifiers: specifierNames });

    for (const spec of node.specifiers) {
      try {
        const sig = extractFunctionSignature(sourcePath, spec.imported);
        if (sig) {
          ctx.tsImportSignatures.set(spec.local, sig);
        }
      } catch {
        // Skip if can't extract signature
      }
    }
  }

  // Validate Vibe imports - check that imported symbols exist and extract types
  let vibeExportResult: { exportedNames: Set<string>, symbols: SymbolTable } | null = null;
  if (node.sourceType === 'vibe' && ctx.basePath) {
    vibeExportResult = getVibeExports(ctx.basePath, node.source);
  }

  for (const spec of node.specifiers) {
    const existing = ctx.symbols.lookup(spec.local);
    if (existing) {
      if (existing.kind === 'import' || existing.kind === 'tool') {
        ctx.error(
          `'${spec.local}' is already imported from another module`,
          node.location
        );
      } else {
        ctx.error(
          `Import '${spec.local}' conflicts with existing ${existing.kind}`,
          node.location
        );
      }
    } else {
      // Validate that imported name exists in source file (for Vibe imports)
      if (vibeExportResult && !vibeExportResult.exportedNames.has(spec.imported)) {
        ctx.error(
          `'${spec.imported}' is not exported from '${node.source}'`,
          node.location
        );
      }

      // Tool bundles (allTools, readonlyTools, safeTools) are imports, individual tools are 'tool' kind
      const toolBundles = ['allTools', 'readonlyTools', 'safeTools'];
      const importKind = isToolImport && !toolBundles.includes(spec.local) ? 'tool' : 'import';

      // Look up the symbol from the imported file's analyzer - types flow naturally
      const sym = vibeExportResult?.symbols.lookup(spec.imported);
      if (sym?.kind === 'function') {
        ctx.declare(spec.local, 'function', node.location, {
          paramCount: sym.paramCount,
          paramTypes: sym.paramTypes,
          returnType: sym.returnType,
        });
      } else if (sym?.kind === 'model') {
        ctx.declare(spec.local, importKind, node.location, { vibeType: 'model' });
      } else {
        ctx.declare(spec.local, importKind, node.location, { vibeType: sym?.vibeType });
      }
    }
  }
}

/**
 * Analyze a Vibe source file and return its exported names + symbol table.
 * Types flow naturally from the full semantic analysis.
 */
export function getVibeExports(basePath: string, importSource: string): { exportedNames: Set<string>, symbols: SymbolTable } | null {
  try {
    const sourcePath = resolve(dirname(basePath), importSource);
    if (!existsSync(sourcePath)) {
      return null;
    }

    const sourceContent = readFileSync(sourcePath, 'utf-8');
    const sourceAst = parse(sourceContent, { file: sourcePath });

    // Run full semantic analysis so types flow naturally
    // Lazy import to break circular dependency (analyzer.ts imports this file)
    const { SemanticAnalyzer: Analyzer } = require('../analyzer');
    const importAnalyzer = new Analyzer();
    importAnalyzer.analyze(sourceAst, sourceContent, sourcePath);

    const exportedNames = new Set<string>();
    for (const stmt of sourceAst.body) {
      if (stmt.type === 'ExportDeclaration') {
        exportedNames.add(stmt.declaration.name);
      }
    }

    return { exportedNames, symbols: importAnalyzer.getSymbols() };
  } catch {
    return null;
  }
}
