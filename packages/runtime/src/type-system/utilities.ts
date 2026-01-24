/**
 * Type Utilities
 *
 * Basic type string manipulation and validation utilities.
 */
import { TYPE_DEFINITIONS } from './definitions';

/**
 * Get the base type from a type annotation (strips array brackets).
 * e.g., "text[][]" -> "text", "number" -> "number"
 */
export function getBaseType(type: string): string {
  return type.replace(/\[\]/g, '');
}

/**
 * Check if a type string represents an array type.
 */
export function isArrayType(type: string): boolean {
  return type.endsWith('[]');
}

/**
 * Check if a type annotation string is a valid built-in Vibe type.
 */
export function isValidType(type: string): boolean {
  const baseType = getBaseType(type);
  return TYPE_DEFINITIONS.has(baseType);
}

/**
 * Get the element type from an array type.
 * e.g., "model[]" -> "model", "number[][]" -> "number[]"
 * Returns null if the type is not an array.
 */
export function getArrayElementType(type: string): string | null {
  return type.endsWith('[]') ? type.slice(0, -2) : null;
}

/**
 * Validate that a string is valid JSON.
 */
export function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
