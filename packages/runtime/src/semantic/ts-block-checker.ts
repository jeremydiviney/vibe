/**
 * TypeScript Block Type Checker
 *
 * Type-checks ts() block bodies by compiling virtual TypeScript in memory.
 * This catches type errors at compile time before the Vibe program runs.
 */
import ts from 'typescript';
import type { SourceLocation } from '../errors';
import { vibeTypeToTs, tsTypeToVibe } from '../type-system';

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
 * Import info for ts() block type inference.
 * Used to include imports in the virtual code so TypeScript can resolve types.
 */
export interface TsImportInfo {
  /** Absolute path to the TypeScript file */
  sourcePath: string;
  /** Names imported from this file (e.g., ['API_KEYS', 'PROVIDER_URLS']) */
  specifiers: string[];
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
 * Optionally includes import statements for type resolution.
 *
 * When a parameter name matches an imported specifier, the import provides
 * the type instead of the parameter (to preserve TypeScript type info).
 */
function generateVirtualCode(
  params: TsBlockParam[],
  body: string,
  imports?: TsImportInfo[]
): string {
  // Collect all imported specifier names
  const importedNames = new Set<string>();
  for (const imp of imports ?? []) {
    for (const spec of imp.specifiers) {
      importedNames.add(spec);
    }
  }

  // Only include params that are NOT imports (imports provide their own types)
  const nonImportParams = params.filter(p => !importedNames.has(p.name));
  const paramList = nonImportParams
    .map((p) => `${p.name}: ${vibeTypeToTs(p.vibeType)}`)
    .join(', ');

  // Generate import statements
  const importStatements = (imports ?? [])
    .map(imp => `import { ${imp.specifiers.join(', ')} } from "${imp.sourcePath.replace(/\\/g, '/')}";`)
    .join('\n');

  const importSection = importStatements ? importStatements + '\n\n' : '';
  return `${importSection}function __tsBlock(${paramList}) {\n${body}\n}`;
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
  // Error codes for "Cannot find name":
  // - 2304: "Cannot find name '{0}'"
  // - 2552: "Cannot find name '{0}'. Did you mean '{1}'?"
  const paramNames = new Set(params.map(p => p.name));
  const relevantErrors: TsBlockError[] = [];

  for (const d of diagnostics) {
    if (d.category !== ts.DiagnosticCategory.Error) continue;

    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');

    // Skip "Cannot find name" errors for external functions/variables
    // These are expected since ts() blocks can call external code
    if (d.code === 2304 || d.code === 2552) {
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
 * @param imports - Optional import info for resolving external types
 * @returns The inferred Vibe type, or null if it cannot be determined
 */
export function inferTsBlockReturnType(
  params: TsBlockParam[],
  body: string,
  imports?: TsImportInfo[]
): string | null {
  const virtualFileName = '__virtual_ts_block_infer__.ts';
  const virtualCode = generateVirtualCode(params, body, imports);

  // Use enhanced compiler options when we have imports to resolve
  const compilerOptions: ts.CompilerOptions = {
    ...createCompilerOptions(),
    // Enable module resolution for imports
    moduleResolution: imports?.length ? ts.ModuleResolutionKind.NodeNext : undefined,
  };

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
