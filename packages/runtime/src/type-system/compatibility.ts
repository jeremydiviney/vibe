/**
 * Type Compatibility
 *
 * Rules for when one type can be assigned to another.
 */

/**
 * Check if sourceType can be assigned to targetType.
 */
export function typesCompatible(sourceType: string, targetType: string): boolean {
  // Exact match
  if (sourceType === targetType) return true;

  // null is compatible with most types, but NOT boolean (booleans must be true or false)
  if (sourceType === 'null' && targetType !== 'boolean') return true;

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
