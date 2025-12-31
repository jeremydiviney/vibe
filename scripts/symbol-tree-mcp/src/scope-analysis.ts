// Scope and call graph analysis

import ts from 'typescript';
import type { SymbolInfo } from './types.js';
import { getSignature, getLineRange, JS_BUILTINS } from './utils.js';

// Extract variables accessed from outer scope (not params, not local declarations)
export function extractOuterScopeAccess(
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
export function extractCallGraph(
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
      line: 0,
      endLine: 0
    });
  }

  for (const use of Array.from(uses).sort()) {
    if (!calls.has(use)) {
      children.push({
        name: use,
        kind: 'uses',
        exported: false,
        line: 0,
        endLine: 0
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

export function extractClassMembers(node: ts.ClassDeclaration, sourceFile: ts.SourceFile, depth: number): SymbolInfo[] {
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
        ...getLineRange(member, sourceFile)
      } as SymbolInfo;
    });
}

export function extractInterfaceMembers(node: ts.InterfaceDeclaration, sourceFile: ts.SourceFile, depth: number): SymbolInfo[] {
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
        ...getLineRange(member, sourceFile)
      };
    });
}

// Extract type dependencies from a type node (interfaces, type aliases, classes)
// Returns arrays of: extends, implements, and uses (type references)
export function extractTypeDependencies(
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.ClassDeclaration | ts.EnumDeclaration,
  sourceFile: ts.SourceFile,
  allTypeNames: Set<string>
): { extends?: string[], implements?: string[], uses?: string[] } {
  const extendsTypes: string[] = [];
  const implementsTypes: string[] = [];
  const usesTypes = new Set<string>();

  // Extract heritage clauses (extends/implements)
  if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        for (const type of clause.types) {
          const typeName = type.expression.getText(sourceFile);
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            extendsTypes.push(typeName);
          } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
            implementsTypes.push(typeName);
          }
        }
      }
    }
  }

  // Collect type references from within the type definition
  function collectTypeReferences(typeNode: ts.Node) {
    // Type reference like `SomeType` or `SomeType<T>`
    if (ts.isTypeReferenceNode(typeNode)) {
      const typeName = typeNode.typeName.getText(sourceFile);
      // Only include if it's a known type in our codebase
      if (allTypeNames.has(typeName)) {
        usesTypes.add(typeName);
      }
      // Also check type arguments
      if (typeNode.typeArguments) {
        for (const arg of typeNode.typeArguments) {
          collectTypeReferences(arg);
        }
      }
      return;
    }

    // Recurse into child nodes
    ts.forEachChild(typeNode, collectTypeReferences);
  }

  // For type aliases, collect from the type definition
  if (ts.isTypeAliasDeclaration(node)) {
    collectTypeReferences(node.type);
  }

  // For interfaces, collect from members
  if (ts.isInterfaceDeclaration(node)) {
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.type) {
        collectTypeReferences(member.type);
      }
      if (ts.isMethodSignature(member)) {
        // Check return type
        if (member.type) {
          collectTypeReferences(member.type);
        }
        // Check parameter types
        for (const param of member.parameters) {
          if (param.type) {
            collectTypeReferences(param.type);
          }
        }
      }
    }
  }

  // For classes, collect from members and constructor
  if (ts.isClassDeclaration(node)) {
    for (const member of node.members) {
      if (ts.isPropertyDeclaration(member) && member.type) {
        collectTypeReferences(member.type);
      }
      if (ts.isMethodDeclaration(member)) {
        if (member.type) {
          collectTypeReferences(member.type);
        }
        for (const param of member.parameters) {
          if (param.type) {
            collectTypeReferences(param.type);
          }
        }
      }
    }
  }

  // Remove extends/implements from uses (they're already tracked separately)
  for (const ext of extendsTypes) {
    usesTypes.delete(ext);
  }
  for (const impl of implementsTypes) {
    usesTypes.delete(impl);
  }

  return {
    extends: extendsTypes.length > 0 ? extendsTypes : undefined,
    implements: implementsTypes.length > 0 ? implementsTypes : undefined,
    uses: usesTypes.size > 0 ? Array.from(usesTypes).sort() : undefined
  };
}
