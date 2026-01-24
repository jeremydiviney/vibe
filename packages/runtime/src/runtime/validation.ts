// Type validation and coercion utilities

import type { VibeType } from '../ast';
import { RuntimeError, TypeError, type SourceLocation } from '../errors';
import { isVibeValue, resolveValue } from './types';
import { validateValue, inferTypeFromValue } from '../type-system';

/**
 * Validates a value against a type annotation and coerces if necessary.
 * Returns { value, inferredType } where inferredType is set when no explicit type was given.
 */
export function validateAndCoerce(
  value: unknown,
  type: VibeType,
  varName: string,
  location?: SourceLocation,
  source?: 'ai' | 'user'
): { value: unknown; inferredType: VibeType } {
  // If value is an error VibeValue, pass it through without validation
  // Errors should propagate unchanged regardless of type annotation
  if (isVibeValue(value) && value.err) {
    return { value, inferredType: type };
  }

  // Resolve VibeValue unless this is a direct AI result to an UNTYPED variable
  // (source === 'ai' means the value came directly from an AI call)
  // For typed variables, always resolve so type validation can work on the primitive value
  const keepVibeValueWrapper = source === 'ai' && type === null;
  if (!keepVibeValueWrapper) {
    value = resolveValue(value);
  }

  // null is valid for any typed variable
  if (value === null) {
    return { value: null, inferredType: type };
  }

  // If no type annotation, infer from JavaScript type
  if (!type) {
    const valueToInfer = resolveValue(value);
    const inferred = inferTypeFromValue(valueToInfer);
    return { value, inferredType: inferred as VibeType };
  }

  // Delegate to type-system validation (handles arrays, coercion, and type checks)
  const result = validateValue(value, type, varName);
  if (result.error) {
    throw new RuntimeError(`Variable '${varName}': ${result.error}`, location);
  }

  return { value: result.value, inferredType: type };
}

/**
 * Strict boolean check - no truthy coercion allowed.
 * Throws if value is not a boolean.
 */
export function requireBoolean(value: unknown, context: string, location?: SourceLocation): boolean {
  // Handle VibeValue with error - throw the error
  if (isVibeValue(value) && value.err && value.errDetails) {
    throw new RuntimeError(`${value.errDetails.type}: ${value.errDetails.message}`, location);
  }

  // Auto-unwrap VibeValue
  const unwrapped = resolveValue(value);

  if (typeof unwrapped !== 'boolean') {
    const valueType = unwrapped === null ? 'null' : typeof unwrapped;
    throw new TypeError(`${context} must be a boolean, got ${valueType}`, 'boolean', valueType, location);
  }
  return unwrapped;
}
