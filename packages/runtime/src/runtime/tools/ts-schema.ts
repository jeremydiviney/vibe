import ts from 'typescript';
import type { JsonSchema } from './types';

// Cache for extracted schemas to avoid re-parsing the same file
const schemaCache = new Map<string, Map<string, JsonSchema>>();

/**
 * Extract JSON Schema from a TypeScript type definition.
 *
 * @param sourceFile - Path to the TypeScript source file
 * @param typeName - Name of the type/interface to extract
 * @returns JSON Schema representation of the type
 */
export function extractTypeSchema(sourceFile: string, typeName: string): JsonSchema {
  // Check cache first
  const fileCache = schemaCache.get(sourceFile);
  if (fileCache?.has(typeName)) {
    return fileCache.get(typeName)!;
  }

  // Create TypeScript program to analyze the file
  const program = ts.createProgram([sourceFile], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    strict: true,
  });

  const checker = program.getTypeChecker();
  const source = program.getSourceFile(sourceFile);

  if (!source) {
    throw new Error(`Could not load source file: ${sourceFile}`);
  }

  // Find the type declaration
  const typeSymbol = findTypeSymbol(source, typeName, checker);
  if (!typeSymbol) {
    throw new Error(`Type '${typeName}' not found in ${sourceFile}`);
  }

  const type = checker.getDeclaredTypeOfSymbol(typeSymbol);
  const schema = typeToJsonSchema(type, checker, new Set());

  // Cache the result
  if (!schemaCache.has(sourceFile)) {
    schemaCache.set(sourceFile, new Map());
  }
  schemaCache.get(sourceFile)!.set(typeName, schema);

  return schema;
}

/**
 * Find a type symbol by name in a source file.
 */
function findTypeSymbol(
  source: ts.SourceFile,
  typeName: string,
  checker: ts.TypeChecker
): ts.Symbol | undefined {
  let result: ts.Symbol | undefined;

  function visit(node: ts.Node) {
    if (result) return;

    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      if (node.name.text === typeName) {
        result = checker.getSymbolAtLocation(node.name);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return result;
}

/**
 * Convert a TypeScript type to JSON Schema.
 *
 * @param type - The TypeScript type to convert
 * @param checker - TypeScript type checker
 * @param visited - Set of visited type IDs to prevent infinite recursion
 */
function typeToJsonSchema(
  type: ts.Type,
  checker: ts.TypeChecker,
  visited: Set<number>
): JsonSchema {
  // Prevent infinite recursion for recursive types
  const typeId = (type as { id?: number }).id;
  if (typeId !== undefined && visited.has(typeId)) {
    return { type: 'object', additionalProperties: true };
  }
  if (typeId !== undefined) {
    visited.add(typeId);
  }

  // Handle primitive types
  if (type.flags & ts.TypeFlags.String) {
    return { type: 'string' };
  }
  if (type.flags & ts.TypeFlags.Number) {
    return { type: 'number' };
  }
  if (type.flags & ts.TypeFlags.Boolean) {
    return { type: 'boolean' };
  }
  if (type.flags & ts.TypeFlags.Null || type.flags & ts.TypeFlags.Undefined) {
    return { type: 'object' }; // JSON doesn't have null type, use object
  }

  // Handle string literal types
  if (type.flags & ts.TypeFlags.StringLiteral) {
    return { type: 'string' };
  }

  // Handle number literal types
  if (type.flags & ts.TypeFlags.NumberLiteral) {
    return { type: 'number' };
  }

  // Handle boolean literal types
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return { type: 'boolean' };
  }

  // Handle union types (e.g., string | number, or T | undefined for optional)
  if (type.flags & ts.TypeFlags.Union) {
    const unionType = type as ts.UnionType;

    // Filter out undefined and null from the union (common for optional types)
    const nonNullTypes = unionType.types.filter(
      (t) => !(t.flags & ts.TypeFlags.Undefined) && !(t.flags & ts.TypeFlags.Null)
    );

    // If only one type remains after filtering, use that
    if (nonNullTypes.length === 1) {
      return typeToJsonSchema(nonNullTypes[0], checker, new Set(visited));
    }

    // For remaining types, try to find a common type
    const types = nonNullTypes.map((t) => typeToJsonSchema(t, checker, new Set(visited)));

    // If all types are the same, return that type
    const typeSet = new Set(types.map((t) => t.type));
    if (typeSet.size === 1) {
      return types[0];
    }

    // Otherwise, return a generic object
    return { type: 'object', additionalProperties: true };
  }

  // Handle arrays
  if (checker.isArrayType(type)) {
    const typeRef = type as ts.TypeReference;
    const elementType = typeRef.typeArguments?.[0];
    if (elementType) {
      return {
        type: 'array',
        items: typeToJsonSchema(elementType, checker, new Set(visited)),
      };
    }
    return { type: 'array' };
  }

  // Handle tuples as arrays
  if (checker.isTupleType(type)) {
    const tupleType = type as ts.TupleType;
    // Use the first element type or object for mixed tuples
    if (tupleType.typeArguments && tupleType.typeArguments.length > 0) {
      return {
        type: 'array',
        items: typeToJsonSchema(tupleType.typeArguments[0], checker, new Set(visited)),
      };
    }
    return { type: 'array' };
  }

  // Handle objects/interfaces
  if (type.flags & ts.TypeFlags.Object) {
    const objectType = type as ts.ObjectType;

    // Check if it's a function type
    const callSignatures = type.getCallSignatures();
    if (callSignatures.length > 0) {
      return { type: 'object', additionalProperties: true };
    }

    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    const typeProperties = objectType.getProperties();
    for (const prop of typeProperties) {
      const propType = checker.getTypeOfSymbol(prop);
      const propSchema = typeToJsonSchema(propType, checker, new Set(visited));

      // Get JSDoc comment if available
      const jsDocComment = prop.getDocumentationComment(checker);
      if (jsDocComment.length > 0) {
        propSchema.description = jsDocComment.map((c) => c.text).join('\n');
      }

      properties[prop.name] = propSchema;

      // Check if property is required (not optional)
      if (!(prop.flags & ts.SymbolFlags.Optional)) {
        required.push(prop.name);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  // Default fallback
  return { type: 'object', additionalProperties: true };
}

/**
 * Convert a Vibe type annotation to JSON Schema.
 * Handles both built-in types and imported TS type names.
 *
 * @param vibeType - The Vibe type annotation (e.g., "text", "CustomerInfo", "Order[]")
 * @param importedTypes - Map of type name to source file for resolving imported types
 */
export function vibeTypeToJsonSchema(
  vibeType: string,
  importedTypes?: Map<string, string>
): JsonSchema {
  // Handle array types
  if (vibeType.endsWith('[]')) {
    const elementType = vibeType.slice(0, -2);
    return {
      type: 'array',
      items: vibeTypeToJsonSchema(elementType, importedTypes),
    };
  }

  // Handle built-in Vibe types
  switch (vibeType) {
    case 'text':
    case 'prompt':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'json':
      return { type: 'object', additionalProperties: true };
  }

  // Handle imported TS type
  if (importedTypes?.has(vibeType)) {
    const sourceFile = importedTypes.get(vibeType)!;
    return extractTypeSchema(sourceFile, vibeType);
  }

  // Unknown type - return generic object
  return { type: 'object', additionalProperties: true };
}

/**
 * Clear the schema cache (useful for testing or when files change).
 */
export function clearSchemaCache(): void {
  schemaCache.clear();
}

/**
 * A type extractor that has already compiled a TypeScript program.
 * Use this when you need to extract multiple types from the same file(s)
 * to avoid recompiling for each extraction.
 */
export interface TypeExtractor {
  /**
   * Extract a type by name from any of the compiled source files.
   */
  extract(typeName: string): JsonSchema;

  /**
   * Get the type checker for advanced use cases.
   */
  getChecker(): ts.TypeChecker;
}

/**
 * Create a type extractor by compiling TypeScript files once.
 * Much more efficient than calling extractTypeSchema multiple times.
 *
 * @param sourceFiles - Array of TypeScript file paths to compile
 * @returns A TypeExtractor that can extract types without recompiling
 */
export function createTypeExtractor(sourceFiles: string[]): TypeExtractor {
  const program = ts.createProgram(sourceFiles, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    strict: true,
  });

  const checker = program.getTypeChecker();
  const sources = sourceFiles.map((f) => program.getSourceFile(f)).filter(Boolean) as ts.SourceFile[];

  // Build a map of all exported types across all source files
  const typeSymbols = new Map<string, ts.Symbol>();

  for (const source of sources) {
    function visit(node: ts.Node) {
      if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
        const symbol = checker.getSymbolAtLocation(node.name);
        if (symbol) {
          typeSymbols.set(node.name.text, symbol);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }

  return {
    extract(typeName: string): JsonSchema {
      const symbol = typeSymbols.get(typeName);
      if (!symbol) {
        throw new Error(`Type '${typeName}' not found in compiled sources`);
      }

      const type = checker.getDeclaredTypeOfSymbol(symbol);
      return typeToJsonSchema(type, checker, new Set());
    },

    getChecker(): ts.TypeChecker {
      return checker;
    },
  };
}
