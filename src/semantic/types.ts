// Type validation and compatibility utilities

/**
 * Valid base types in the Vibe language.
 */
export const VALID_BASE_TYPES = ['text', 'json', 'prompt', 'boolean', 'number'] as const;

/**
 * Get the base type from a type annotation (strips array brackets).
 * e.g., "text[][]" -> "text", "number" -> "number"
 */
export function getBaseType(type: string): string {
  return type.replace(/\[\]/g, '');
}

/**
 * Check if a type annotation string is a valid Vibe type.
 */
export function isValidType(type: string): boolean {
  const baseType = getBaseType(type);
  return VALID_BASE_TYPES.includes(baseType as typeof VALID_BASE_TYPES[number]);
}

/**
 * Check if sourceType can be assigned to targetType.
 */
export function typesCompatible(sourceType: string, targetType: string): boolean {
  // Exact match
  if (sourceType === targetType) return true;

  // text and prompt are compatible
  if ((sourceType === 'text' || sourceType === 'prompt') &&
      (targetType === 'text' || targetType === 'prompt')) {
    return true;
  }

  // json accepts text (will be parsed at runtime)
  if (targetType === 'json' && sourceType === 'text') {
    return true;
  }

  return false;
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
