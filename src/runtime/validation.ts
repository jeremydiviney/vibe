// Type validation and coercion utilities

/**
 * Validates a value against a type annotation and coerces if necessary.
 * Returns { value, inferredType } where inferredType is set when no explicit type was given.
 */
export function validateAndCoerce(
  value: unknown,
  type: string | null,
  varName: string
): { value: unknown; inferredType: string | null } {
  // If no type annotation, infer from JavaScript type
  if (!type) {
    if (typeof value === 'string') {
      return { value, inferredType: 'text' };
    }
    if (typeof value === 'boolean') {
      return { value, inferredType: 'boolean' };
    }
    if (typeof value === 'number') {
      return { value, inferredType: 'number' };
    }
    if (typeof value === 'object' && value !== null) {
      return { value, inferredType: 'json' };
    }
    // For other types (null, undefined), no type inference
    return { value, inferredType: null };
  }

  // Validate array types (text[], json[], boolean[], text[][], etc.)
  if (type.endsWith('[]')) {
    const elementType = type.slice(0, -2);  // "text[]" -> "text", "text[][]" -> "text[]"

    if (!Array.isArray(value)) {
      throw new Error(`TypeError: Variable '${varName}': expected ${type} (array), got ${typeof value}`);
    }

    // Validate each element recursively
    const validatedElements = value.map((elem, i) => {
      const { value: validated } = validateAndCoerce(elem, elementType, `${varName}[${i}]`);
      return validated;
    });

    return { value: validatedElements, inferredType: type };
  }

  // Validate text type - must be a string
  if (type === 'text') {
    if (typeof value !== 'string') {
      throw new Error(`TypeError: Variable '${varName}': expected text (string), got ${typeof value}`);
    }
    return { value, inferredType: 'text' };
  }

  // Validate json type - must be object or array
  if (type === 'json') {
    let result = value;

    // If string, try to parse as JSON
    if (typeof value === 'string') {
      try {
        result = JSON.parse(value);
      } catch {
        throw new Error(`TypeError: Variable '${varName}': invalid JSON string`);
      }
    }

    // Validate the result is an object or array (not a primitive)
    if (typeof result !== 'object' || result === null) {
      throw new Error(`TypeError: Variable '${varName}': expected JSON (object or array), got ${typeof value}`);
    }
    return { value: result, inferredType: 'json' };
  }

  // Validate boolean type - must be a boolean
  if (type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new Error(`TypeError: Variable '${varName}': expected boolean, got ${typeof value}`);
    }
    return { value, inferredType: 'boolean' };
  }

  // Validate number type - must be a finite number
  if (type === 'number') {
    if (typeof value !== 'number') {
      throw new Error(`TypeError: Variable '${varName}': expected number, got ${typeof value}`);
    }
    if (!Number.isFinite(value)) {
      throw new Error(`TypeError: Variable '${varName}': number must be finite, got ${value}`);
    }
    return { value, inferredType: 'number' };
  }

  // For other types (prompt, etc.), accept as-is
  return { value, inferredType: type };
}

/**
 * Strict boolean check - no truthy coercion allowed.
 * Throws if value is not a boolean.
 */
export function requireBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    const valueType = value === null ? 'null' : typeof value;
    throw new Error(`TypeError: ${context} must be a boolean, got ${valueType}`);
  }
  return value;
}
