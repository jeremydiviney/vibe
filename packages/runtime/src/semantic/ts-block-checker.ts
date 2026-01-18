/**
 * TypeScript Block Type Checker
 *
 * Type-checks ts() block bodies by compiling virtual TypeScript in memory.
 * This catches type errors at compile time before the Vibe program runs.
 */
import ts from 'typescript';
import type { SourceLocation } from '../errors';
import { vibeTypeToTs, tsTypeToVibe } from './ts-types';

export interface TsBlockError {
  message: string;
  location: SourceLocation;
}

/**
 * Parameter info for ts() block type checking.
 */
export interface TsBlockParam {
  name: string;
  vibeType: string | null;
}

/**
 * Create compiler options for virtual TypeScript compilation.
 */
function createCompilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    strict: false,  // Less strict to avoid spurious errors
    skipLibCheck: true,
    noImplicitAny: false,  // Allow implicit any for external references
  };
}

/**
 * Create a virtual compiler host that serves in-memory TypeScript code.
 */
function createVirtualCompilerHost(
  fileName: string,
  code: string,
  options: ts.CompilerOptions
): { host: ts.CompilerHost; sourceFile: ts.SourceFile } {
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.ESNext,
    true
  );

  const defaultHost = ts.createCompilerHost(options);
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile: (name, languageVersion) => {
      if (name === fileName) {
        return sourceFile;
      }
      return defaultHost.getSourceFile(name, languageVersion);
    },
    fileExists: (name) => {
      if (name === fileName) return true;
      return defaultHost.fileExists(name);
    },
    readFile: (name) => {
      if (name === fileName) return code;
      return defaultHost.readFile(name);
    },
  };

  return { host, sourceFile };
}

/**
 * Generate virtual TypeScript function code from ts() block params and body.
 */
function generateVirtualCode(params: TsBlockParam[], body: string): string {
  const paramList = params
    .map((p) => `${p.name}: ${vibeTypeToTs(p.vibeType)}`)
    .join(', ');
  return `function __tsBlock(${paramList}) {\n${body}\n}`;
}

/**
 * Type-check a ts() block body with the given parameters.
 *
 * Only checks for type errors related to the provided parameters.
 * External function calls and variables are not checked since we don't
 * have context about what's available in the runtime environment.
 *
 * @param params - Array of parameter names and their Vibe types
 * @param body - The TypeScript code inside the ts() block
 * @param blockLocation - Location of the ts() block in the Vibe source
 * @returns Array of type errors found
 */
export function checkTsBlockTypes(
  params: TsBlockParam[],
  body: string,
  blockLocation: SourceLocation
): TsBlockError[] {
  // Skip type checking if there are no typed parameters
  // We can only meaningfully check types when we have parameter type info
  const typedParams = params.filter(p => p.vibeType !== null);
  if (typedParams.length === 0) {
    return [];
  }

  const virtualFileName = '__virtual_ts_block__.ts';
  const virtualCode = generateVirtualCode(params, body);
  const compilerOptions = createCompilerOptions();
  const { host } = createVirtualCompilerHost(virtualFileName, virtualCode, compilerOptions);

  // Create program and get diagnostics
  const program = ts.createProgram([virtualFileName], compilerOptions, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  // Filter diagnostics to only include type errors related to our parameters
  // Error code 2304 is "Cannot find name" - we ignore these for external refs
  const paramNames = new Set(params.map(p => p.name));
  const relevantErrors: TsBlockError[] = [];

  for (const d of diagnostics) {
    if (d.category !== ts.DiagnosticCategory.Error) continue;

    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');

    // Skip "Cannot find name" errors for external functions/variables
    // These are expected since ts() blocks can call external code
    if (d.code === 2304) {
      // Only report if it's about one of our parameters (shouldn't happen
      // since we define them, but just in case)
      const match = message.match(/Cannot find name '(\w+)'/);
      if (match && !paramNames.has(match[1])) {
        continue;
      }
    }

    // Map location back to original block
    let errorLocation = blockLocation;
    if (d.file && d.start !== undefined) {
      const { line } = d.file.getLineAndCharacterOfPosition(d.start);
      const originalLine = line - 1;
      if (originalLine >= 0) {
        errorLocation = {
          ...blockLocation,
          line: blockLocation.line + originalLine,
        };
      }
    }

    relevantErrors.push({
      message: `TypeScript error in ts() block: ${message}`,
      location: errorLocation,
    });
  }

  return relevantErrors;
}

/**
 * Infer the return type of a ts() block by compiling it and extracting the return type.
 *
 * @param params - Array of parameter names and their Vibe types
 * @param body - The TypeScript code inside the ts() block
 * @returns The inferred Vibe type, or null if it cannot be determined
 */
export function inferTsBlockReturnType(
  params: TsBlockParam[],
  body: string
): string | null {
  const virtualFileName = '__virtual_ts_block_infer__.ts';
  const virtualCode = generateVirtualCode(params, body);
  const compilerOptions = createCompilerOptions();
  const { host } = createVirtualCompilerHost(virtualFileName, virtualCode, compilerOptions);

  const program = ts.createProgram([virtualFileName], compilerOptions, host);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(virtualFileName);

  if (!source) return null;

  // Find the function declaration and get its return type
  let returnType: string | null = null;

  function visit(node: ts.Node) {
    if (returnType !== null) return;

    if (ts.isFunctionDeclaration(node) && node.name?.text === '__tsBlock') {
      const signature = checker.getSignatureFromDeclaration(node);
      if (signature) {
        const tsReturnType = checker.getReturnTypeOfSignature(signature);
        const tsTypeString = checker.typeToString(tsReturnType);
        returnType = tsTypeToVibe(tsTypeString);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);

  return returnType;
}
