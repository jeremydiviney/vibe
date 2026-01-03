// Symbol extraction engine

import ts from 'typescript';
import { glob } from 'glob';
import path from 'path';
import type { SymbolInfo, FileSymbols, ExtractOptions } from './types.js';
import { getSignature, getLineRange, isExported } from './utils.js';
import { extractCallGraph, extractClassMembers, extractInterfaceMembers, extractTypeDependencies } from './scope-analysis.js';

/** Check if a file path is a test file (*.test.* or inside a test/tests/__tests__ folder) */
function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  // Check for .test. in filename (e.g., foo.test.ts, bar.test.tsx)
  if (/\.test\./.test(normalized)) return true;
  // Check for test folders at any depth (test/, tests/, __tests__/)
  // Use (^|/) to match both start of path and mid-path folders
  if (/(^|\/)(test|tests|__tests__)\//.test(normalized)) return true;
  return false;
}

function extractSymbolsFromNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  depth: number,
  exportsOnly: boolean
): SymbolInfo | null {
  // Function declarations
  if (ts.isFunctionDeclaration(node) && node.name) {
    const exported = isExported(node);
    if (exportsOnly && !exported) return null;

    return {
      name: node.name.getText(sourceFile),
      kind: 'function',
      signature: getSignature(node, sourceFile),
      exported,
      ...getLineRange(node, sourceFile)
    };
  }

  // Class declarations
  if (ts.isClassDeclaration(node) && node.name) {
    const exported = isExported(node);
    if (exportsOnly && !exported) return null;

    return {
      name: node.name.getText(sourceFile),
      kind: 'class',
      exported,
      ...getLineRange(node, sourceFile),
      children: extractClassMembers(node, sourceFile, depth - 1)
    };
  }

  // Interface declarations
  if (ts.isInterfaceDeclaration(node)) {
    const exported = isExported(node);
    if (exportsOnly && !exported) return null;

    return {
      name: node.name.getText(sourceFile),
      kind: 'interface',
      exported,
      ...getLineRange(node, sourceFile),
      children: extractInterfaceMembers(node, sourceFile, depth - 1)
    };
  }

  // Type alias declarations
  if (ts.isTypeAliasDeclaration(node)) {
    const exported = isExported(node);
    if (exportsOnly && !exported) return null;

    return {
      name: node.name.getText(sourceFile),
      kind: 'type',
      signature: getSignature(node, sourceFile),
      exported,
      ...getLineRange(node, sourceFile)
    };
  }

  // Enum declarations
  if (ts.isEnumDeclaration(node)) {
    const exported = isExported(node);
    if (exportsOnly && !exported) return null;

    return {
      name: node.name.getText(sourceFile),
      kind: 'enum',
      exported,
      ...getLineRange(node, sourceFile)
    };
  }

  // Variable declarations (const, let, var)
  if (ts.isVariableStatement(node)) {
    const exported = isExported(node);
    if (exportsOnly && !exported) return null;

    const declarations = node.declarationList.declarations;
    // Return only the first declaration for simplicity
    const decl = declarations[0];
    if (decl && ts.isIdentifier(decl.name)) {
      return {
        name: decl.name.getText(sourceFile),
        kind: 'variable',
        signature: getSignature(decl, sourceFile),
        exported,
        ...getLineRange(node, sourceFile)
      };
    }
  }

  // Namespace/module declarations
  if (ts.isModuleDeclaration(node) && node.name) {
    const exported = isExported(node);
    if (exportsOnly && !exported) return null;

    return {
      name: node.name.getText(sourceFile),
      kind: 'namespace',
      exported,
      ...getLineRange(node, sourceFile)
    };
  }

  return null;
}

// First pass: collect all symbol names for call graph resolution
// Returns a map of name -> list of file paths where it's defined
// Also populates typeNames set with interface/type/enum names
function collectSymbolNamesWithFiles(
  sourceFile: ts.SourceFile,
  nameToFiles: Map<string, string[]>,
  typeNames: Set<string>
): void {
  const filePath = sourceFile.fileName;

  function visit(node: ts.Node) {
    let name: string | null = null;
    let isType = false;

    if (ts.isFunctionDeclaration(node) && node.name) {
      name = node.name.getText(sourceFile);
    } else if (ts.isClassDeclaration(node) && node.name) {
      name = node.name.getText(sourceFile);
      isType = true; // Classes are also types
    } else if (ts.isInterfaceDeclaration(node)) {
      name = node.name.getText(sourceFile);
      isType = true;
    } else if (ts.isTypeAliasDeclaration(node)) {
      name = node.name.getText(sourceFile);
      isType = true;
    } else if (ts.isEnumDeclaration(node)) {
      name = node.name.getText(sourceFile);
      isType = true;
    }

    if (name) {
      const files = nameToFiles.get(name) ?? [];
      files.push(filePath);
      nameToFiles.set(name, files);

      if (isType) {
        typeNames.add(name);
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
}

// Second pass: extract symbols with call graph
function extractSymbolsWithCallGraph(
  sourceFile: ts.SourceFile,
  depth: number,
  exportsOnly: boolean,
  allSymbolNames: Set<string>,
  targetSymbol?: string
): FileSymbols | null {
  const symbols: SymbolInfo[] = [];

  function visit(node: ts.Node) {
    // Function declarations - include call graph
    if (ts.isFunctionDeclaration(node) && node.name) {
      const exported = isExported(node);
      if (exportsOnly && !exported) {
        ts.forEachChild(node, visit);
        return;
      }

      const name = node.name.getText(sourceFile);
      if (targetSymbol && name !== targetSymbol) {
        ts.forEachChild(node, visit);
        return;
      }

      const { children: callChildren, outerReads, outerWrites } = extractCallGraph(node, sourceFile, depth - 1, allSymbolNames);
      symbols.push({
        name,
        kind: 'function',
        signature: getSignature(node, sourceFile),
        exported,
        ...getLineRange(node, sourceFile),
        outerReads: outerReads.length > 0 ? outerReads : undefined,
        outerWrites: outerWrites.length > 0 ? outerWrites : undefined,
        children: callChildren.length > 0 ? callChildren : undefined
      });
    }

    // Class declarations - include methods with call graphs
    if (ts.isClassDeclaration(node) && node.name) {
      const exported = isExported(node);
      if (exportsOnly && !exported) {
        ts.forEachChild(node, visit);
        return;
      }

      const name = node.name.getText(sourceFile);
      if (targetSymbol && name !== targetSymbol) {
        ts.forEachChild(node, visit);
        return;
      }

      // Extract methods with their call graphs
      const children: SymbolInfo[] = [];
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = member.name.getText(sourceFile);
          const { children: methodChildren, outerReads: methodReads, outerWrites: methodWrites } = extractCallGraph(member, sourceFile, depth - 2, allSymbolNames);
          children.push({
            name: methodName,
            kind: 'method',
            signature: getSignature(member, sourceFile),
            exported: false,
            ...getLineRange(member, sourceFile),
            outerReads: methodReads.length > 0 ? methodReads : undefined,
            outerWrites: methodWrites.length > 0 ? methodWrites : undefined,
            children: methodChildren.length > 0 ? methodChildren : undefined
          });
        }
      }

      symbols.push({
        name,
        kind: 'class',
        exported,
        ...getLineRange(node, sourceFile),
        children: children.length > 0 ? children : undefined
      });
    }

    // Skip variables, interfaces, types, enums for now (user requested functions/classes only)

    // Recurse but not into function/class bodies (already handled above)
    if (!ts.isFunctionDeclaration(node) && !ts.isClassDeclaration(node) &&
        !ts.isArrowFunction(node) && !ts.isMethodDeclaration(node)) {
      ts.forEachChild(node, visit);
    }
  }

  ts.forEachChild(sourceFile, visit);

  if (symbols.length === 0) return null;

  return {
    filePath: sourceFile.fileName,
    symbols
  };
}

// Extract type symbols (interfaces, types, enums) with their dependencies
function extractTypeSymbols(
  sourceFile: ts.SourceFile,
  allTypeNames: Set<string>,
  exportsOnly: boolean
): FileSymbols | null {
  const symbols: SymbolInfo[] = [];

  function visit(node: ts.Node) {
    // Interface declarations
    if (ts.isInterfaceDeclaration(node)) {
      const exported = isExported(node);
      if (exportsOnly && !exported) {
        ts.forEachChild(node, visit);
        return;
      }

      const deps = extractTypeDependencies(node, sourceFile, allTypeNames);
      symbols.push({
        name: node.name.getText(sourceFile),
        kind: 'interface',
        exported,
        ...getLineRange(node, sourceFile),
        extends: deps.extends,
        typeUses: deps.uses
      });
    }

    // Type alias declarations
    if (ts.isTypeAliasDeclaration(node)) {
      const exported = isExported(node);
      if (exportsOnly && !exported) {
        ts.forEachChild(node, visit);
        return;
      }

      const deps = extractTypeDependencies(node, sourceFile, allTypeNames);
      symbols.push({
        name: node.name.getText(sourceFile),
        kind: 'type',
        signature: getSignature(node, sourceFile),
        exported,
        ...getLineRange(node, sourceFile),
        typeUses: deps.uses
      });
    }

    // Enum declarations
    if (ts.isEnumDeclaration(node)) {
      const exported = isExported(node);
      if (exportsOnly && !exported) {
        ts.forEachChild(node, visit);
        return;
      }

      symbols.push({
        name: node.name.getText(sourceFile),
        kind: 'enum',
        exported,
        ...getLineRange(node, sourceFile)
      });
    }

    // Class declarations (as types)
    if (ts.isClassDeclaration(node) && node.name) {
      const exported = isExported(node);
      if (exportsOnly && !exported) {
        ts.forEachChild(node, visit);
        return;
      }

      const deps = extractTypeDependencies(node, sourceFile, allTypeNames);
      symbols.push({
        name: node.name.getText(sourceFile),
        kind: 'class',
        exported,
        ...getLineRange(node, sourceFile),
        extends: deps.extends,
        implements: deps.implements,
        typeUses: deps.uses
      });
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);

  if (symbols.length === 0) return null;

  return {
    filePath: sourceFile.fileName,
    symbols
  };
}

export async function extractSymbols(options: ExtractOptions): Promise<FileSymbols[]> {
  const {
    path: basePath = process.cwd(),
    file,
    symbol,
    pattern = '**/*.{ts,tsx,js,jsx}',
    depth = 2,
    exportsOnly = false,
    srcDir = 'src'  // Default to 'src' folder, use '' to include all
  } = options;

  // Helper to check if file is in the source directory
  const isInSrcDir = (filePath: string): boolean => {
    if (srcDir === '') return true;  // Empty string means include all
    const normalized = filePath.replace(/\\/g, '/');
    // Match srcDir at start or after a slash (e.g., /src/ or ^src/)
    const srcDirPattern = new RegExp(`(^|/)${srcDir}/`);
    return srcDirPattern.test(normalized);
  };

  const results: FileSymbols[] = [];

  // Collect all files to analyze
  let files: string[];
  if (file) {
    const absolutePath = path.isAbsolute(file) ? file : path.join(basePath, file);
    files = [absolutePath];
  } else {
    files = await glob(pattern, {
      cwd: basePath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/test/**', '**/tests/**', '**/__tests__/**', '**/*.test.*'],
      absolute: true
    });
  }

  if (files.length === 0) return results;

  // Create ONE program for all files - let TypeScript resolve imports
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    allowJs: true,
    skipLibCheck: true,
    // noResolve: false - let TS follow imports to build complete dependency graph
  });

  // Get ALL source files from program (includes resolved imports)
  // Exclude node_modules, declaration files, test files, and files outside srcDir
  const allSourceFiles = program.getSourceFiles()
    .filter(sf => !sf.fileName.includes('node_modules') && !sf.isDeclarationFile && !isTestFile(sf.fileName) && isInSrcDir(sf.fileName));

  // First pass: collect ALL symbol names across all files, tracking which files they appear in
  const nameToFiles = new Map<string, string[]>();
  const allTypeNames = new Set<string>(); // Track type symbols (interfaces, types, enums, classes)
  for (const sourceFile of allSourceFiles) {
    collectSymbolNamesWithFiles(sourceFile, nameToFiles, allTypeNames);
  }

  // Build set of all symbol names and detect ambiguous names (defined in multiple files)
  const allSymbolNames = new Set<string>(nameToFiles.keys());
  const ambiguousNames = new Set<string>(
    [...nameToFiles.entries()]
      .filter(([_, fileList]) => fileList.length > 1)
      .map(([name]) => name)
  );

  // Extract type symbols (interfaces, types, enums) with their dependencies
  const typeSymbols: FileSymbols[] = [];
  for (const sourceFile of allSourceFiles) {
    const typeFileSymbols = extractTypeSymbols(sourceFile, allTypeNames, exportsOnly);
    if (typeFileSymbols) {
      typeSymbols.push(typeFileSymbols);
    }
  }

  // Second pass: extract symbols with DIRECT call graphs from ALL files (for complete call map)
  const allFileSymbols: FileSymbols[] = [];
  for (const sourceFile of allSourceFiles) {
    const fileSymbols = extractSymbolsWithCallGraph(sourceFile, depth, exportsOnly, allSymbolNames);
    if (fileSymbols) {
      allFileSymbols.push(fileSymbols);
    }
  }

  // Determine which files are "target" files for output
  const targetFilePaths = new Set(files.map(f => path.resolve(f)));

  // Filter results to only target files (but keep all for call map)
  for (const fileSymbols of allFileSymbols) {
    const normalizedPath = path.resolve(fileSymbols.filePath);
    if (targetFilePaths.has(normalizedPath)) {
      // If searching for specific symbol, filter to just that symbol
      if (symbol) {
        const filtered = fileSymbols.symbols.filter(s => s.name === symbol);
        if (filtered.length > 0) {
          results.push({ ...fileSymbols, symbols: filtered });
        }
      } else {
        results.push(fileSymbols);
      }
    }
  }

  // Build a map of function/method names to their call children for recursive expansion
  // For ambiguous names, use filePath:name as key; for unique names, just use name
  const callMap = new Map<string, { children: SymbolInfo[], filePath: string }>();
  for (const file of allFileSymbols) {
    for (const sym of file.symbols) {
      if (sym.kind === 'function' && sym.children) {
        const key = ambiguousNames.has(sym.name) ? `${file.filePath}:${sym.name}` : sym.name;
        callMap.set(key, { children: sym.children, filePath: file.filePath });
        // Also store by simple name for fallback lookup
        if (ambiguousNames.has(sym.name) && !callMap.has(sym.name)) {
          callMap.set(sym.name, { children: sym.children, filePath: file.filePath });
        }
      }
      if (sym.kind === 'class' && sym.children) {
        for (const method of sym.children) {
          if (method.kind === 'method' && method.children) {
            callMap.set(`${sym.name}.${method.name}`, { children: method.children, filePath: file.filePath });
          }
        }
      }
    }
  }

  // Third pass: recursively expand call trees
  function expandCalls(children: SymbolInfo[], currentDepth: number, visited: Set<string>, currentFilePath: string): void {
    if (currentDepth <= 0) return;

    for (const child of children) {
      if (child.kind === 'calls') {
        const callName = child.name;
        // Avoid cycles
        if (visited.has(callName)) continue;

        // For ambiguous names, try same-file first, then fall back to any match
        let lookupResult: { children: SymbolInfo[], filePath: string } | undefined;
        if (ambiguousNames.has(callName)) {
          // Try same-file first
          lookupResult = callMap.get(`${currentFilePath}:${callName}`);
          if (!lookupResult) {
            // Fall back to any match
            lookupResult = callMap.get(callName);
          }
          // Add sourceFile info for ambiguous calls
          if (lookupResult) {
            child.sourceFile = lookupResult.filePath;
          }
        } else {
          lookupResult = callMap.get(callName);
        }

        if (lookupResult && lookupResult.children.length > 0) {
          visited.add(callName);
          // Clone the children to avoid shared references
          child.children = lookupResult.children.map(c => ({ ...c }));
          expandCalls(child.children, currentDepth - 1, visited, lookupResult.filePath);
          visited.delete(callName);
        }
      }
    }
  }

  // Expand calls for all symbols
  for (const file of results) {
    for (const sym of file.symbols) {
      if (sym.children) {
        expandCalls(sym.children, depth - 1, new Set([sym.name]), file.filePath);
        // Also expand method children
        for (const child of sym.children) {
          if (child.kind === 'method' && child.children) {
            expandCalls(child.children, depth - 2, new Set([`${sym.name}.${child.name}`]), file.filePath);
          }
        }
      }
    }
  }

  // Collect all reachable symbol names from the call graph
  const reachableNames = new Set<string>();
  function collectReachable(children: SymbolInfo[] | undefined) {
    if (!children) return;
    for (const child of children) {
      if (child.kind === 'calls' || child.kind === 'uses') {
        reachableNames.add(child.name);
        collectReachable(child.children);
      }
    }
  }
  for (const file of results) {
    for (const sym of file.symbols) {
      collectReachable(sym.children);
    }
  }

  // Add reachable symbols from other files to results
  const includedSymbols = new Set<string>(
    results.flatMap(f => f.symbols.map(s => s.name))
  );

  for (const fileSymbols of allFileSymbols) {
    const normalizedPath = path.resolve(fileSymbols.filePath);
    // Skip target files (already included)
    if (targetFilePaths.has(normalizedPath)) continue;

    const reachableSymbols = fileSymbols.symbols.filter(s =>
      reachableNames.has(s.name) && !includedSymbols.has(s.name)
    );

    if (reachableSymbols.length > 0) {
      results.push({ ...fileSymbols, symbols: reachableSymbols });
      for (const s of reachableSymbols) {
        includedSymbols.add(s.name);
      }
    }
  }

  // Merge type symbols into results
  // For each type symbol file, merge type symbols into corresponding results entry
  const resultsByPath = new Map<string, FileSymbols>();
  for (const result of results) {
    resultsByPath.set(path.resolve(result.filePath), result);
  }

  for (const typeFile of typeSymbols) {
    const normalizedPath = path.resolve(typeFile.filePath);

    // Only add type symbols from target files
    if (!targetFilePaths.has(normalizedPath)) continue;

    const existingFile = resultsByPath.get(normalizedPath);

    if (existingFile) {
      // Merge type symbols into existing file
      const existingNames = new Set(existingFile.symbols.map(s => s.name));

      for (const typeSym of typeFile.symbols) {
        const existing = existingFile.symbols.find(s => s.name === typeSym.name);
        if (existing) {
          // Merge type dependency info into existing symbol (e.g., class)
          existing.extends = typeSym.extends;
          existing.implements = typeSym.implements;
          existing.typeUses = typeSym.typeUses;
        } else {
          // Add new type symbol (interface, type alias, enum)
          existingFile.symbols.push(typeSym);
        }
      }
    } else {
      // Add new file entry for type-only file
      results.push(typeFile);
    }
  }

  return results;
}

// Search for a specific symbol across all files
export async function findSymbol(symbolName: string, basePath: string = process.cwd()): Promise<FileSymbols[]> {
  return extractSymbols({
    path: basePath,
    symbol: symbolName,
    depth: 3 // Show more depth when searching for specific symbol
  });
}
