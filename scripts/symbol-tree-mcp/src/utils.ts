// Node inspection utilities for symbol extraction

import ts from 'typescript';

// JavaScript/TypeScript built-ins to exclude from outer scope tracking
export const JS_BUILTINS = new Set([
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

function inferType(node: ts.Expression): string {
  if (ts.isStringLiteral(node)) return 'string';
  if (ts.isNumericLiteral(node)) return 'number';
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return 'boolean';
  if (ts.isArrayLiteralExpression(node)) return 'array';
  if (ts.isObjectLiteralExpression(node)) return 'object';
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return 'function';
  return 'unknown';
}

export function getSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
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

export function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

// Get line and endLine for a node
export function getLineRange(node: ts.Node, sourceFile: ts.SourceFile): { line: number; endLine: number } {
  return {
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1
  };
}
