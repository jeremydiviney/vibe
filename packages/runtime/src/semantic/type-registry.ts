/**
 * Type Registry
 *
 * Manages structural type definitions and provides type resolution for member access chains.
 * Used by the semantic analyzer to track named types and resolve field types.
 */
import type { StructuralType, StructuralTypeField } from '../ast';

/**
 * Registry for structural type definitions.
 * Tracks named types and resolves member access chains to their declared types.
 */
export class TypeRegistry {
  private types = new Map<string, StructuralType>();

  /**
   * Register a named structural type.
   */
  register(name: string, structure: StructuralType): void {
    this.types.set(name, structure);
  }

  /**
   * Look up a structural type by name.
   */
  lookup(name: string): StructuralType | undefined {
    return this.types.get(name);
  }

  /**
   * Check if a type name is registered.
   */
  has(name: string): boolean {
    return this.types.has(name);
  }

  /**
   * Get all registered type names.
   */
  getTypeNames(): string[] {
    return [...this.types.keys()];
  }

  /**
   * Resolve member type from a base type and member path.
   * Returns the resolved type or null if resolution fails.
   *
   * @param baseType - The starting type (e.g., 'MyType' or 'MyType[]')
   * @param memberPath - Array of property names to traverse (e.g., ['metadata', 'timestamp'])
   * @returns The resolved type string or null if not found
   *
   * @example
   * // Given: type Result { metadata: { timestamp: number } }
   * resolveMemberType('Result', ['metadata', 'timestamp']) // returns 'number'
   */
  resolveMemberType(baseType: string, memberPath: string[]): string | null {
    if (memberPath.length === 0) return baseType;

    // Handle array types - unwrap for member access
    let currentType = baseType;
    if (currentType.endsWith('[]')) {
      // Can't access members on arrays directly (except built-in methods like .len)
      // This will be handled elsewhere
      return null;
    }

    // Look up the structural type
    const structType = this.types.get(currentType);
    if (!structType) return null;

    // Traverse the member path
    let currentFields = structType.fields;
    for (let i = 0; i < memberPath.length; i++) {
      const memberName = memberPath[i];
      const field = currentFields.find(f => f.name === memberName);

      if (!field) return null;

      // Last member in path - return its type
      if (i === memberPath.length - 1) {
        return field.type;
      }

      // More path to traverse - need to go deeper
      if (field.nestedType) {
        // Inline nested type
        currentFields = field.nestedType.fields;
      } else {
        // Named type reference - look it up
        const nestedType = this.types.get(field.type);
        if (!nestedType) return null;
        currentFields = nestedType.fields;
      }
    }

    return null;
  }

  /**
   * Resolve a single member access (one level deep).
   * Used for step-by-step member chain resolution.
   *
   * @param baseType - The type to access member on
   * @param memberName - The member name
   * @returns The field type, or null if not found
   */
  resolveSingleMember(baseType: string, memberName: string): string | null {
    // Handle array types
    if (baseType.endsWith('[]')) {
      if (memberName === 'len') return 'number';
      return null;
    }

    // Handle string/prompt types
    if (baseType === 'text' || baseType === 'prompt') {
      if (memberName === 'len') return 'number';
      return null;
    }

    // Look up the structural type
    const structType = this.types.get(baseType);
    if (!structType) return null;

    const field = structType.fields.find(f => f.name === memberName);
    if (!field) return null;

    // For nested types, return 'object' (they don't have a named type)
    if (field.nestedType) return 'object';

    return field.type;
  }

  /**
   * Resolve the return type of a method call on a given base type.
   *
   * @param baseType - The type the method is called on
   * @param methodName - The method being called
   * @returns The return type of the method, or null if unknown
   */
  resolveMethodReturnType(baseType: string, methodName: string): string | null {
    // Array methods
    if (baseType.endsWith('[]')) {
      if (methodName === 'len') return 'number';
      if (methodName === 'pop') return baseType.slice(0, -2);  // element type
      if (methodName === 'push') return baseType;  // returns the array
      return null;
    }

    // String/prompt methods
    if (baseType === 'text' || baseType === 'prompt') {
      if (methodName === 'len') return 'number';
      return null;
    }

    return null;
  }

  /**
   * Flatten a type into an array of field paths with their types.
   * Used for building AI prompts with expected field structure.
   *
   * @param typeName - The type to flatten
   * @returns Array of {path, type} objects
   *
   * @example
   * // Given: type Result { success: boolean, metadata: { timestamp: number } }
   * flattenType('Result')
   * // returns:
   * // [
   * //   { path: 'success', type: 'boolean' },
   * //   { path: 'metadata.timestamp', type: 'number' }
   * // ]
   */
  flattenType(typeName: string): Array<{ path: string; type: string }> {
    const structType = this.types.get(typeName);
    if (!structType) return [];

    return this.flattenFields(structType.fields, '');
  }

  /**
   * Helper to recursively flatten fields.
   */
  private flattenFields(
    fields: StructuralTypeField[],
    prefix: string
  ): Array<{ path: string; type: string }> {
    const result: Array<{ path: string; type: string }> = [];

    for (const field of fields) {
      const path = prefix ? `${prefix}.${field.name}` : field.name;

      if (field.nestedType) {
        // Recurse into nested type
        result.push(...this.flattenFields(field.nestedType.fields, path));
      } else if (this.types.has(field.type)) {
        // Named type reference - recurse
        const nestedStruct = this.types.get(field.type)!;
        result.push(...this.flattenFields(nestedStruct.fields, path));
      } else {
        // Leaf field
        result.push({ path, type: field.type });
      }
    }

    return result;
  }
}
