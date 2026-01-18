/**
 * TypeScript Signature Extraction Utility
 *
 * Extracts function signatures from TypeScript files at compile time
 * for use in semantic analysis of Vibe programs.
 */
import ts from 'typescript';

export interface TsFunctionSignature {
  name: string;
  params: Array<{ name: string; tsType: string; optional: boolean }>;
  returnType: string;
}

// Cache to avoid re-parsing same file
const signatureCache = new Map<string, Map<string, TsFunctionSignature>>();

/**
 * Extract a function signature from a TypeScript file.
 *
 * @param sourceFile - Path to the TypeScript source file
 * @param funcName - Name of the function to extract
 * @returns The function signature, or undefined if not found
 */
export function extractFunctionSignature(
  sourceFile: string,
  funcName: string
): TsFunctionSignature | undefined {
  // Check cache first
  const fileCache = signatureCache.get(sourceFile);
  if (fileCache?.has(funcName)) {
    return fileCache.get(funcName);
  }

  // Create TypeScript program to parse the file
  const program = ts.createProgram([sourceFile], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
  });

  const checker = program.getTypeChecker();
  const source = program.getSourceFile(sourceFile);

  if (!source) {
    return undefined;
  }

  // Walk AST to find function declaration or arrow function export
  let result: TsFunctionSignature | undefined;

  function visit(node: ts.Node) {
    if (result) return; // Already found

    // Handle: export function funcName(...) { }
    if (ts.isFunctionDeclaration(node) && node.name?.text === funcName) {
      result = extractSignatureFromFunction(node, checker, funcName);
      return;
    }

    // Handle: export const funcName = (...) => { }
    // or: export const funcName = function(...) { }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === funcName && decl.initializer) {
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            result = extractSignatureFromFunction(decl.initializer, checker, funcName);
            return;
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);

  // Cache the result
  if (result) {
    if (!signatureCache.has(sourceFile)) {
      signatureCache.set(sourceFile, new Map());
    }
    signatureCache.get(sourceFile)!.set(funcName, result);
  }

  return result;
}

/**
 * Extract signature from a function-like declaration.
 */
function extractSignatureFromFunction(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  checker: ts.TypeChecker,
  funcName: string
): TsFunctionSignature {
  const params = node.parameters.map((param) => {
    const paramType = checker.getTypeAtLocation(param);
    return {
      name: param.name.getText(),
      tsType: checker.typeToString(paramType),
      optional: !!param.questionToken || !!param.initializer,
    };
  });

  // Get return type from signature
  const sig = checker.getSignatureFromDeclaration(node);
  const returnType = sig ? checker.typeToString(sig.getReturnType()) : 'void';

  return {
    name: funcName,
    params,
    returnType,
  };
}

/**
 * Extract all exported function signatures from a TypeScript file.
 *
 * @param sourceFile - Path to the TypeScript source file
 * @returns Map of function name to signature
 */
export function extractAllFunctionSignatures(
  sourceFile: string
): Map<string, TsFunctionSignature> {
  const results = new Map<string, TsFunctionSignature>();

  const program = ts.createProgram([sourceFile], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
  });

  const checker = program.getTypeChecker();
  const source = program.getSourceFile(sourceFile);

  if (!source) {
    return results;
  }

  function visit(node: ts.Node) {
    // Handle: export function funcName(...) { }
    if (ts.isFunctionDeclaration(node) && node.name) {
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (isExported) {
        const sig = extractSignatureFromFunction(node, checker, node.name.text);
        results.set(node.name.text, sig);
      }
    }

    // Handle: export const funcName = (...) => { }
    if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (isExported) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              const sig = extractSignatureFromFunction(decl.initializer, checker, decl.name.text);
              results.set(decl.name.text, sig);
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);

  // Update cache
  if (!signatureCache.has(sourceFile)) {
    signatureCache.set(sourceFile, new Map());
  }
  for (const [name, sig] of results) {
    signatureCache.get(sourceFile)!.set(name, sig);
  }

  return results;
}

/**
 * Clear the signature cache (useful for testing or when files change).
 */
export function clearSignatureCache(): void {
  signatureCache.clear();
}
