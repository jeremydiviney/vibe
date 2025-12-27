import ts from 'typescript';
import { glob } from 'glob';
import path from 'path';

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method' | 'property' | 'enum' | 'namespace' | 'calls' | 'uses' | 'reads' | 'writes';
  signature?: string;
  exported: boolean;
  line: number;
  sourceFile?: string;  // For calls/uses - shows which file the called function is from (only when ambiguous)
  outerReads?: string[];   // Variables read from outer scope
  outerWrites?: string[];  // Variables written to outer scope
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

function getSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) {
    const params = (node.parameters || [])
      .map(p => {
        const name = p.name.getText(sourceFile);
        const type = p.type ? p.type.getText(sourceFile) : 'any';
        const optional = p.questionToken ? '?' : '';
        return `${name}${optional}: ${type}`;
      })
      .join(', ');

    let returnType = 'void';
    if (node.type) {
      returnType = node.type.getText(sourceFile);
    }

    return `(${params}): ${returnType}`;
  }

  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
    const type = node.type ? node.type.getText(sourceFile) : 'any';
    const optional = node.questionToken ? '?' : '';
    return `${optional}: ${type}`;
  }

  if (ts.isVariableDeclaration(node)) {
    const type = node.type ? node.type.getText(sourceFile) :
                 node.initializer ? inferType(node.initializer) : 'any';
    return `: ${type}`;
  }

  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    if (ts.isTypeAliasDeclaration(node)) {
      const typeText = node.type.getText(sourceFile);
      // Truncate long type definitions
      return typeText.length > 50 ? `= ${typeText.substring(0, 47)}...` : `= ${typeText}`;
    }
  }

  return '';
}

function inferType(node: ts.Expression): string {
  if (ts.isStringLiteral(node)) return 'string';
  if (ts.isNumericLiteral(node)) return 'number';
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return 'boolean';
  if (ts.isArrayLiteralExpression(node)) return 'array';
  if (ts.isObjectLiteralExpression(node)) return 'object';
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return 'function';
  return 'unknown';
}

function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

// JavaScript/TypeScript built-ins to exclude from outer scope tracking
const JS_BUILTINS = new Set([
  // Global objects
  'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Promise', 'Error', 'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Symbol', 'BigInt', 'Proxy', 'Reflect', 'Intl', 'ArrayBuffer', 'DataView',
  'Int8Array', 'Uint8Array', 'Float32Array', 'Float64Array',
  // Global functions and constructors
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI',
  'encodeURIComponent', 'decodeURIComponent', 'eval', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'fetch', 'atob', 'btoa',
  'Function', 'AsyncFunction', 'GeneratorFunction', 'AsyncGeneratorFunction',
  // Special values and runtime globals
  'undefined', 'null', 'NaN', 'Infinity', 'globalThis', 'window', 'document',
  'process', 'global', 'module', 'exports', 'require', '__dirname', '__filename',
  'Bun', 'Deno', 'self', 'navigator',
  // Keywords that might slip through
  'const', 'let', 'var', 'function', 'class', 'return', 'if', 'else', 'for',
  'while', 'do', 'switch', 'case', 'break', 'continue', 'throw', 'try', 'catch',
  'finally', 'new', 'delete', 'typeof', 'instanceof', 'void', 'in', 'of',
  'async', 'await', 'yield', 'import', 'export', 'default', 'from', 'as',
  // Common method names that aren't outer variables
  'slice', 'splice', 'push', 'pop', 'shift', 'unshift', 'map', 'filter',
  'reduce', 'forEach', 'find', 'findIndex', 'indexOf', 'includes', 'join',
  'split', 'replace', 'match', 'test', 'exec', 'toString', 'valueOf',
  'hasOwnProperty', 'keys', 'values', 'entries', 'assign', 'freeze',
  'sort', 'reverse', 'concat', 'flat', 'flatMap', 'every', 'some', 'fill',
  'length', 'size', 'get', 'set', 'has', 'delete', 'clear', 'add',
  'next', 'done', 'value', 'then', 'catch', 'finally', 'resolve', 'reject',
  'all', 'race', 'allSettled', 'any',
  // Type-related
  'type', 'interface', 'enum', 'namespace', 'declare', 'readonly', 'abstract',
  'public', 'private', 'protected', 'static', 'extends', 'implements',
  // Common TypeScript utilities
  'Partial', 'Required', 'Readonly', 'Record', 'Pick', 'Omit', 'Exclude',
  'Extract', 'NonNullable', 'ReturnType', 'Parameters', 'ConstructorParameters',
  // Misc
  'arguments', 'this', 'super', 'true', 'false'
]);

// Extract variables accessed from outer scope (not params, not local declarations)
function extractOuterScopeAccess(
  node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  allSymbolNames: Set<string>
): { reads: string[], writes: string[] } {
  // Collect parameter names
  const params = new Set<string>();
  for (const param of node.parameters) {
    if (ts.isIdentifier(param.name)) {
      params.add(param.name.text);
    }
  }

  // Collect local variable declarations (including destructuring)
  const locals = new Set<string>();
  function collectBindingNames(pattern: ts.BindingName) {
    if (ts.isIdentifier(pattern)) {
      locals.add(pattern.text);
    } else if (ts.isObjectBindingPattern(pattern)) {
      for (const element of pattern.elements) {
        collectBindingNames(element.name);
      }
    } else if (ts.isArrayBindingPattern(pattern)) {
      for (const element of pattern.elements) {
        if (ts.isBindingElement(element)) {
          collectBindingNames(element.name);
        }
      }
    }
  }
  function collectLocals(n: ts.Node) {
    if (ts.isVariableDeclaration(n)) {
      collectBindingNames(n.name);
    }
    // Don't descend into nested functions
    if (!ts.isFunctionDeclaration(n) && !ts.isFunctionExpression(n) && !ts.isArrowFunction(n)) {
      ts.forEachChild(n, collectLocals);
    }
  }
  if (node.body) {
    ts.forEachChild(node.body, collectLocals);
  }

  // Track reads and writes
  const reads = new Set<string>();
  const writes = new Set<string>();

  function visit(n: ts.Node, isWriteContext: boolean = false) {
    // Check for assignment expressions
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      // LHS is a write
      visit(n.left, true);
      // RHS is a read
      visit(n.right, false);
      return;
    }

    // Property access: track base object, but skip property names
    if (ts.isPropertyAccessExpression(n)) {
      const base = n.expression;
      if (ts.isIdentifier(base)) {
        const name = base.text;
        // Skip if it's a param, local, 'this', known function/class, or JS built-in
        if (!params.has(name) && !locals.has(name) && name !== 'this' &&
            !allSymbolNames.has(name) && !JS_BUILTINS.has(name)) {
          if (isWriteContext) {
            writes.add(name);
          } else {
            reads.add(name);
          }
        }
      } else {
        // For chained access like a.b.c, visit the expression but not the property name
        visit(n.expression, false);
      }
      // Don't call forEachChild - n.name is just a property name, not a variable
      return;
    }

    // Standalone identifier
    if (ts.isIdentifier(n)) {
      const name = n.text;
      // Skip params, locals, known symbols, and JS built-ins
      if (!params.has(name) && !locals.has(name) && !allSymbolNames.has(name) && !JS_BUILTINS.has(name)) {
        if (isWriteContext) {
          writes.add(name);
        } else {
          reads.add(name);
        }
      }
      return;
    }

    // Don't descend into nested functions
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
      return;
    }

    // Skip type nodes entirely - they're not runtime code
    if (ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) {
      return;
    }

    // For type assertions (x as Type), only visit the expression, not the type
    if (ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) {
      visit(n.expression, isWriteContext);
      return;
    }

    // Property assignment in object literal: skip the key name, visit the value
    if (ts.isPropertyAssignment(n)) {
      // Don't visit n.name - it's just a property key, not a variable
      if (n.initializer) {
        visit(n.initializer, false);
      }
      return;
    }

    // Shorthand property assignment like { foo } means { foo: foo }
    if (ts.isShorthandPropertyAssignment(n)) {
      // The name IS a variable reference in shorthand
      const name = n.name.text;
      if (!params.has(name) && !locals.has(name) && !allSymbolNames.has(name) && !JS_BUILTINS.has(name)) {
        reads.add(name);
      }
      return;
    }

    ts.forEachChild(n, c => visit(c, false));
  }

  if (node.body) {
    ts.forEachChild(node.body, n => visit(n, false));
  }

  return {
    reads: Array.from(reads).sort(),
    writes: Array.from(writes).sort()
  };
}

// Extract function calls and class usages from a function/method body
// Also tracks outer scope variable access
function extractCallGraph(
  node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  depth: number,
  allSymbolNames: Set<string>
): { children: SymbolInfo[], outerReads: string[], outerWrites: string[] } {
  if (depth <= 0) return { children: [], outerReads: [], outerWrites: [] };

  const calls = new Set<string>();
  const uses = new Set<string>();

  function visit(n: ts.Node) {
    // Function calls: foo(), this.bar(), obj.method()
    if (ts.isCallExpression(n)) {
      const expr = n.expression;
      let callName: string | null = null;

      if (ts.isIdentifier(expr)) {
        // Direct call: foo()
        callName = expr.text;
      } else if (ts.isPropertyAccessExpression(expr)) {
        // Method call: this.foo() or obj.foo()
        const propName = expr.name.text;
        if (ts.isIdentifier(expr.expression) && expr.expression.text === 'this') {
          callName = `this.${propName}`;
        } else if (ts.isIdentifier(expr.expression)) {
          const objName = expr.expression.text;
          if (allSymbolNames.has(objName)) {
            uses.add(objName);
          }
          callName = `${objName}.${propName}`;
        } else {
          callName = propName;
        }
      }

      if (callName && !callName.startsWith('console.') && !callName.startsWith('Math.')) {
        const baseName = callName.split('.')[0];
        if (allSymbolNames.has(baseName) || callName.startsWith('this.')) {
          calls.add(callName);
        }
      }
    }

    // New expressions: new Foo()
    if (ts.isNewExpression(n)) {
      const expr = n.expression;
      if (ts.isIdentifier(expr)) {
        const className = expr.text;
        if (allSymbolNames.has(className)) {
          uses.add(className);
        }
      }
    }

    ts.forEachChild(n, visit);
  }

  if (node.body) {
    ts.forEachChild(node.body, visit);
  }

  const children: SymbolInfo[] = [];

  for (const call of Array.from(calls).sort()) {
    children.push({
      name: call,
      kind: 'calls',
      exported: false,
      line: 0
    });
  }

  for (const use of Array.from(uses).sort()) {
    if (!calls.has(use)) {
      children.push({
        name: use,
        kind: 'uses',
        exported: false,
        line: 0
      });
    }
  }

  // Extract outer scope access
  const outerAccess = extractOuterScopeAccess(node, sourceFile, allSymbolNames);

  return {
    children,
    outerReads: outerAccess.reads,
    outerWrites: outerAccess.writes
  };
}

function extractClassMembers(node: ts.ClassDeclaration, sourceFile: ts.SourceFile, depth: number): SymbolInfo[] {
  if (depth <= 0) return [];

  return node.members
    .filter(member => ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member))
    .map(member => {
      const name = member.name?.getText(sourceFile) ?? '<anonymous>';
      const kind = ts.isMethodDeclaration(member) ? 'method' : 'property';
      return {
        name,
        kind,
        signature: getSignature(member, sourceFile),
        exported: false,
        line: sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line + 1
      } as SymbolInfo;
    });
}

function extractInterfaceMembers(node: ts.InterfaceDeclaration, sourceFile: ts.SourceFile, depth: number): SymbolInfo[] {
  if (depth <= 0) return [];

  return node.members
    .filter(ts.isPropertySignature)
    .map(member => {
      const name = member.name?.getText(sourceFile) ?? '<anonymous>';
      return {
        name,
        kind: 'property' as const,
        signature: getSignature(member, sourceFile),
        exported: false,
        line: sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line + 1
      };
    });
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
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
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
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
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
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
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
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
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
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
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
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
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
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
    };
  }

  return null;
}

// First pass: collect all symbol names for call graph resolution
// Returns a map of name -> list of file paths where it's defined
function collectSymbolNamesWithFiles(sourceFile: ts.SourceFile, nameToFiles: Map<string, string[]>): void {
  const filePath = sourceFile.fileName;

  function visit(node: ts.Node) {
    let name: string | null = null;

    if (ts.isFunctionDeclaration(node) && node.name) {
      name = node.name.getText(sourceFile);
    } else if (ts.isClassDeclaration(node) && node.name) {
      name = node.name.getText(sourceFile);
    } else if (ts.isInterfaceDeclaration(node)) {
      name = node.name.getText(sourceFile);
    } else if (ts.isTypeAliasDeclaration(node)) {
      name = node.name.getText(sourceFile);
    }

    if (name) {
      const files = nameToFiles.get(name) ?? [];
      files.push(filePath);
      nameToFiles.set(name, files);
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
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
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
            line: sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line + 1,
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
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
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

export async function extractSymbols(options: ExtractOptions): Promise<FileSymbols[]> {
  const {
    path: basePath = process.cwd(),
    file,
    symbol,
    pattern = '**/*.{ts,tsx,js,jsx}',
    depth = 2,
    exportsOnly = false
  } = options;

  const results: FileSymbols[] = [];

  // Collect all files to analyze
  let files: string[];
  if (file) {
    const absolutePath = path.isAbsolute(file) ? file : path.join(basePath, file);
    files = [absolutePath];
  } else {
    files = await glob(pattern, {
      cwd: basePath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/test/**', '**/*.test.ts'],
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
  const allSourceFiles = program.getSourceFiles()
    .filter(sf => !sf.fileName.includes('node_modules') && !sf.isDeclarationFile);

  // First pass: collect ALL symbol names across all files, tracking which files they appear in
  const nameToFiles = new Map<string, string[]>();
  for (const sourceFile of allSourceFiles) {
    collectSymbolNamesWithFiles(sourceFile, nameToFiles);
  }

  // Build set of all symbol names and detect ambiguous names (defined in multiple files)
  const allSymbolNames = new Set<string>(nameToFiles.keys());
  const ambiguousNames = new Set<string>(
    [...nameToFiles.entries()]
      .filter(([_, fileList]) => fileList.length > 1)
      .map(([name]) => name)
  );

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
