/**
 * TypeScript Type Mapping Utilities
 *
 * Shared utilities for converting between Vibe types and TypeScript types.
 * Used by both the ts-block-checker and semantic analyzer.
 */

/**
 * Map Vibe type to TypeScript type string.
 */
export function vibeTypeToTs(vibeType: string | null): string {
  if (!vibeType) return 'any';

  // Handle array types first
  if (vibeType.endsWith('[]')) {
    const base = vibeType.slice(0, -2);
    return vibeTypeToTs(base) + '[]';
  }

  const map: Record<string, string> = {
    'text': 'string',
    'prompt': 'string',
    'number': 'number',
    'boolean': 'boolean',
    'json': 'Record<string, unknown>',
    'null': 'null | undefined',
  };

  return map[vibeType] ?? 'any';
}

/**
 * Map TypeScript type string back to Vibe type.
 */
export function tsTypeToVibe(tsType: string): string | null {
  // Handle array types
  if (tsType.endsWith('[]')) {
    const base = tsType.slice(0, -2);
    const vibeBase = tsTypeToVibe(base);
    return vibeBase ? `${vibeBase}[]` : null;
  }

  // Handle Array<T> syntax
  if (tsType.startsWith('Array<') && tsType.endsWith('>')) {
    const base = tsType.slice(6, -1);
    const vibeBase = tsTypeToVibe(base);
    return vibeBase ? `${vibeBase}[]` : null;
  }

  // Direct mappings
  const map: Record<string, string> = {
    'string': 'text',
    'number': 'number',
    'boolean': 'boolean',
    'void': 'null',
    'undefined': 'null',
    'null': 'null',
    'any': 'json',
    'unknown': 'json',
    'object': 'json',
  };

  if (map[tsType]) {
    return map[tsType];
  }

  // Handle Record types and other object-like types as json
  if (tsType.startsWith('Record<') || tsType.startsWith('{')) {
    return 'json';
  }

  // Handle union types - try to find a common type
  if (tsType.includes(' | ')) {
    const types = tsType.split(' | ').map(t => t.trim());
    // Filter out null/undefined
    const nonNullTypes = types.filter(t => t !== 'null' && t !== 'undefined');
    if (nonNullTypes.length === 1) {
      return tsTypeToVibe(nonNullTypes[0]);
    }
    // Mixed types become json
    return 'json';
  }

  // Unknown types become json (safest)
  return 'json';
}

/**
 * Check if a Vibe type is compatible with a TypeScript type.
 */
export function isVibeTypeCompatibleWithTs(vibeType: string, tsType: string): boolean {
  // Map Vibe types to their TS equivalents
  const vibeToTs: Record<string, string> = {
    'text': 'string',
    'prompt': 'string',
    'number': 'number',
    'boolean': 'boolean',
    'null': 'null',
  };

  // Handle array types
  if (vibeType.endsWith('[]')) {
    const vibeBase = vibeType.slice(0, -2);
    // TS array types can be T[] or Array<T>
    if (tsType.endsWith('[]')) {
      const tsBase = tsType.slice(0, -2);
      return isVibeTypeCompatibleWithTs(vibeBase, tsBase);
    }
    if (tsType.startsWith('Array<') && tsType.endsWith('>')) {
      const tsBase = tsType.slice(6, -1);
      return isVibeTypeCompatibleWithTs(vibeBase, tsBase);
    }
    // Check against any[]
    if (tsType === 'any[]' || tsType === 'Array<any>') return true;
    return false;
  }

  // json is compatible with object-like types
  if (vibeType === 'json') {
    return isTsTypeObjectLike(tsType);
  }

  // Get the mapped TS type for the Vibe type
  const mappedTsType = vibeToTs[vibeType];
  if (!mappedTsType) {
    // Unknown Vibe type - skip checking
    return true;
  }

  // Direct match
  if (mappedTsType === tsType) return true;

  // 'any' accepts everything
  if (tsType === 'any') return true;

  // 'unknown' accepts everything at assignment
  if (tsType === 'unknown') return true;

  // Handle union types (e.g., "string | null")
  if (tsType.includes(' | ')) {
    const unionTypes = tsType.split(' | ').map(t => t.trim());
    return unionTypes.some(ut => isVibeTypeCompatibleWithTs(vibeType, ut));
  }

  return false;
}

/**
 * Check if a TypeScript type is object-like (accepts json).
 */
export function isTsTypeObjectLike(tsType: string): boolean {
  // Direct object-like types
  if (tsType === 'object') return true;
  if (tsType === 'any') return true;
  if (tsType === 'unknown') return true;

  // Record types
  if (tsType.startsWith('Record<')) return true;

  // Index signature types like { [key: string]: any }
  if (tsType.startsWith('{') && tsType.includes('[')) return true;

  // Generic object types (interfaces, type aliases)
  // If it starts with uppercase and isn't a known primitive, assume it's object-like
  if (/^[A-Z]/.test(tsType) && !['String', 'Number', 'Boolean'].includes(tsType)) {
    return true;
  }

  return false;
}
