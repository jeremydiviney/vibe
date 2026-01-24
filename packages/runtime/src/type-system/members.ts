/**
 * Built-in Member Types
 *
 * Centralized knowledge of what properties and methods each type has.
 */

/** Built-in property types per base type */
const BUILT_IN_MEMBERS: Record<string, Record<string, string>> = {
  'text': { len: 'number' },
  'prompt': { len: 'number' },
  'model': { usage: 'ModelUsageRecord[]', name: 'text' },
};

/** Built-in method return types per base type */
const BUILT_IN_METHODS: Record<string, Record<string, string>> = {
  'text': { len: 'number' },
  'prompt': { len: 'number' },
};

/**
 * Get the type of a built-in member property.
 * Handles array types (all arrays have .len → number).
 */
export function getMemberType(baseType: string, member: string): string | null {
  // Array types have .len
  if (baseType.endsWith('[]')) {
    if (member === 'len') return 'number';
    return null;
  }

  const members = BUILT_IN_MEMBERS[baseType];
  return members?.[member] ?? null;
}

/**
 * Get the return type of a built-in method call.
 * Handles array methods (pop → element type, push → array type, len → number).
 */
export function getMethodReturnType(baseType: string, method: string): string | null {
  // Array methods
  if (baseType.endsWith('[]')) {
    const elementType = baseType.slice(0, -2);
    if (method === 'len') return 'number';
    if (method === 'pop') return elementType;
    if (method === 'push') return baseType;
    return null;
  }

  const methods = BUILT_IN_METHODS[baseType];
  return methods?.[method] ?? null;
}
