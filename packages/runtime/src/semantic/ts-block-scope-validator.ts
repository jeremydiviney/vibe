/**
 * TypeScript Block Scope Validator
 *
 * Validates that ts() block bodies only reference:
 * 1. Parameters explicitly passed to the block
 * 2. Local declarations within the block body
 * 3. Known JavaScript globals
 */
import ts from 'typescript';
import type { SourceLocation } from '../errors';

export interface ScopeError {
  message: string;
  location: SourceLocation;
}

/**
 * Known JavaScript globals that are allowed in ts blocks.
 * These are available in all JavaScript environments.
 */
const ALLOWED_GLOBALS = new Set([
  // Core objects
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt',
  'Function', 'Date', 'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Promise', 'Proxy', 'Reflect',

  // Error types
  'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError',

  // JSON and Math
  'JSON', 'Math',

  // Console
  'console',

  // Typed arrays
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
  'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',

  // URL and encoding
  'URL', 'URLSearchParams',
  'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
  'atob', 'btoa',

  // Other globals
  'globalThis', 'undefined', 'NaN', 'Infinity',
  'isNaN', 'isFinite', 'parseInt', 'parseFloat',

  // Async
  'fetch', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'queueMicrotask',
]);

/**
 * Extract all identifier references from a TypeScript code body.
 * Returns identifiers that are actual value references (not declarations,
 * not property accesses, not type references).
 */
function extractReferencedIdentifiers(body: string): Set<string> {
  // Wrap body in a function to make it valid TypeScript
  const wrappedCode = `function __wrapper() {\n${body}\n}`;

  const sourceFile = ts.createSourceFile(
    '__ts_block_scope__.ts',
    wrappedCode,
    ts.ScriptTarget.ESNext,
    true
  );

  const referencedIdentifiers = new Set<string>();
  const localDeclarations = new Set<string>();

  function collectLocalDeclarations(node: ts.Node): void {
    // Variable declarations: const x, let y, var z
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name)) {
        localDeclarations.add(node.name.text);
      } else if (ts.isObjectBindingPattern(node.name)) {
        // Destructuring: const { a, b } = obj
        for (const element of node.name.elements) {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
            localDeclarations.add(element.name.text);
          }
        }
      } else if (ts.isArrayBindingPattern(node.name)) {
        // Array destructuring: const [a, b] = arr
        for (const element of node.name.elements) {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
            localDeclarations.add(element.name.text);
          }
        }
      }
    }

    // Function declarations: function foo() {}
    if (ts.isFunctionDeclaration(node) && node.name) {
      localDeclarations.add(node.name.text);
    }

    // Function parameters
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      for (const param of node.parameters) {
        if (ts.isIdentifier(param.name)) {
          localDeclarations.add(param.name.text);
        } else if (ts.isObjectBindingPattern(param.name)) {
          for (const element of param.name.elements) {
            if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
              localDeclarations.add(element.name.text);
            }
          }
        } else if (ts.isArrayBindingPattern(param.name)) {
          for (const element of param.name.elements) {
            if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
              localDeclarations.add(element.name.text);
            }
          }
        }
      }
    }

    // Class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      localDeclarations.add(node.name.text);
    }

    // Catch clause parameter: catch (e) {}
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      if (ts.isIdentifier(node.variableDeclaration.name)) {
        localDeclarations.add(node.variableDeclaration.name.text);
      }
    }

    ts.forEachChild(node, collectLocalDeclarations);
  }

  function collectReferences(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;

      // Skip if this is a declaration name (we collected these separately)
      if (ts.isVariableDeclaration(parent) && parent.name === node) {
        return;
      }
      if (ts.isFunctionDeclaration(parent) && parent.name === node) {
        return;
      }
      if (ts.isClassDeclaration(parent) && parent.name === node) {
        return;
      }
      if (ts.isParameter(parent) && parent.name === node) {
        return;
      }
      if (ts.isBindingElement(parent) && parent.name === node) {
        return;
      }

      // Skip if this is a property access (obj.prop - skip 'prop')
      if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
        return;
      }

      // Skip if this is a property name in an object literal
      if (ts.isPropertyAssignment(parent) && parent.name === node) {
        return;
      }

      // Skip if this is a shorthand property assignment name
      // But note: { name } references 'name', so we should NOT skip
      // isShorthandPropertyAssignment means { name } which DOES reference name
      // The identifier in shorthand is both name and value reference

      // Skip if this is a method name
      if (ts.isMethodDeclaration(parent) && parent.name === node) {
        return;
      }

      // Skip type references (in type annotations)
      if (ts.isTypeReferenceNode(parent)) {
        return;
      }

      // Skip import/export specifiers
      if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) {
        return;
      }

      // Skip qualified names (namespace.Type)
      if (ts.isQualifiedName(parent)) {
        return;
      }

      // This is a value reference - collect it
      referencedIdentifiers.add(node.text);
    }

    ts.forEachChild(node, collectReferences);
  }

  // First pass: collect all local declarations
  collectLocalDeclarations(sourceFile);

  // Second pass: collect all references
  collectReferences(sourceFile);

  // Return only references that are not local declarations
  const externalReferences = new Set<string>();
  for (const ref of referencedIdentifiers) {
    if (!localDeclarations.has(ref)) {
      externalReferences.add(ref);
    }
  }

  return externalReferences;
}

/**
 * Validate that a ts() block body only references allowed identifiers.
 *
 * @param body - The TypeScript code inside the ts() block
 * @param allowedParams - Set of parameter names that are allowed
 * @param blockLocation - Location of the ts() block in the Vibe source
 * @returns Array of scope errors found
 */
export function validateTsBlockScope(
  body: string,
  allowedParams: Set<string>,
  blockLocation: SourceLocation
): ScopeError[] {
  const errors: ScopeError[] = [];

  try {
    const referencedIdentifiers = extractReferencedIdentifiers(body);

    for (const identifier of referencedIdentifiers) {
      // Check if it's an allowed parameter
      if (allowedParams.has(identifier)) {
        continue;
      }

      // Check if it's a known global
      if (ALLOWED_GLOBALS.has(identifier)) {
        continue;
      }

      // Not allowed - report error
      errors.push({
        message: `'${identifier}' is not accessible in ts() block. Pass it as a parameter: ts(${identifier}) { ... }`,
        location: blockLocation,
      });
    }
  } catch {
    // If parsing fails, let the type checker handle it
    // Don't add scope errors for unparseable code
  }

  return errors;
}
