/**
 * Type Validation
 *
 * Table-driven runtime type validation using TypeDefinition registry.
 * No dependencies on runtime types (VibeValue, RuntimeState, etc.)
 */
import { TYPE_DEFINITIONS } from './definitions';
import { getArrayElementType } from './utilities';

export interface ValidationResult {
  value: unknown;
  error?: string;
}

/**
 * Validate and optionally coerce a JS value against a Vibe type.
 * Returns the (possibly coerced) value or an error message.
 *
 * Array types are validated recursively per-element.
 */
export function validateValue(
  value: unknown,
  type: string,
  varName: string
): ValidationResult {
  // Check array types first
  const elementType = getArrayElementType(type);
  if (elementType) {
    return validateArrayValue(value, type, elementType, varName);
  }

  // Look up the type definition
  const def = TYPE_DEFINITIONS.get(type);
  if (!def) {
    // Unknown type (e.g., structural types) — pass through
    return { value };
  }

  // Try coercion if value is a string and type supports it
  let coerced = value;
  if (def.coerce && typeof value === 'string') {
    try {
      coerced = def.coerce(value);
    } catch {
      return { value, error: def.coerceErrorMessage ?? `invalid ${def.name} string` };
    }
  }

  // Primary type validation
  if (!def.jsValidate(coerced)) {
    return { value, error: `expected ${def.jsTypeName}, got ${typeof value}` };
  }

  // Additional validation (e.g., json must not be array, number must be finite)
  if (def.postCoerceValidate) {
    const postError = def.postCoerceValidate(coerced);
    if (postError) {
      return { value, error: postError };
    }
  }

  return { value: coerced };
}

/**
 * Validate an array value, checking each element against the element type.
 */
function validateArrayValue(
  value: unknown,
  arrayType: string,
  elementType: string,
  varName: string
): ValidationResult {
  let arrayValue = value;

  // If string, try to parse as JSON array
  if (typeof value === 'string') {
    try {
      arrayValue = JSON.parse(value);
    } catch {
      return { value, error: `invalid JSON array string` };
    }
  }

  if (!Array.isArray(arrayValue)) {
    return { value, error: `expected ${arrayType} (array), got ${typeof value}` };
  }

  // Validate each element recursively
  const validatedElements: unknown[] = [];
  for (let i = 0; i < arrayValue.length; i++) {
    const result = validateValue(arrayValue[i], elementType, `${varName}[${i}]`);
    if (result.error) {
      return { value, error: `${varName}[${i}]: ${result.error}` };
    }
    validatedElements.push(result.value);
  }

  return { value: validatedElements };
}

/**
 * Infer a Vibe type from a JS value.
 * Used for untyped variable declarations.
 */
export function inferTypeFromValue(value: unknown): string | null {
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object' && value !== null) return 'json';
  return null;
}
