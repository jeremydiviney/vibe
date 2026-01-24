/**
 * Type System
 *
 * Centralized type knowledge for the Vibe language. Both the semantic
 * analyzer and runtime import from this module.
 */

// Type definitions registry
export { TYPE_DEFINITIONS, VALID_BASE_TYPES } from './definitions';
export type { TypeDefinition } from './definitions';

// Type string utilities
export { getBaseType, isArrayType, isValidType, getArrayElementType, isValidJson } from './utilities';

// Type compatibility
export { typesCompatible } from './compatibility';

// TypeScript bridging
export { vibeTypeToTs, tsTypeToVibe, isVibeTypeCompatibleWithTs, isTsTypeObjectLike } from './ts-bridge';

// Built-in member/method types
export { getMemberType, getMethodReturnType } from './members';

// Runtime validation
export { validateValue, inferTypeFromValue } from './validation';
export type { ValidationResult } from './validation';
