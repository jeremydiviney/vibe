// Type validation and coercion utilities

import type { VibeType, VibeTypeRequired } from '../ast';
import { RuntimeError, TypeError, type SourceLocation } from '../errors';
import { isVibeValue, resolveValue } from './types';

// Map array types to their element types (type-safe alternative to string slicing)
const ARRAY_ELEMENT_TYPES: Record<string, VibeTypeRequired> = {
  'text[]': 'text',
  'json[]': 'json',
  'boolean[]': 'boolean',
  'number[]': 'number',
  'prompt[]': 'prompt',
};

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
    // For VibeValue, infer type from the underlying value, not the wrapper
    const valueToInfer = resolveValue(value);

    if (typeof valueToInfer === 'string') {
      return { value, inferredType: 'text' };
    }
    if (typeof valueToInfer === 'boolean') {
      return { value, inferredType: 'boolean' };
    }
    if (typeof valueToInfer === 'number') {
      return { value, inferredType: 'number' };
    }
    if (typeof valueToInfer === 'object' && valueToInfer !== null) {
      return { value, inferredType: 'json' };
    }
    // For other types (null, undefined), no type inference
    return { value, inferredType: null };
  }

  // Validate array types (text[], json[], boolean[], number[], prompt[])
  const elementType = ARRAY_ELEMENT_TYPES[type];
  if (elementType) {
    let arrayValue = value;

    // If string, try to parse as JSON array
    if (typeof value === 'string') {
      try {
        arrayValue = JSON.parse(value);
      } catch {
        throw new RuntimeError(`Variable '${varName}': invalid JSON array string`, location);
      }
    }

    if (!Array.isArray(arrayValue)) {
      throw new RuntimeError(`Variable '${varName}': expected ${type} (array), got ${typeof value}`, location);
    }

    // Validate each element recursively
    const validatedElements = arrayValue.map((elem, i) => {
      const { value: validated } = validateAndCoerce(elem, elementType, `${varName}[${i}]`, location);
      return validated;
    });

    return { value: validatedElements, inferredType: type };
  }

  // Validate text type - must be a string
  if (type === 'text') {
    if (typeof value !== 'string') {
      throw new RuntimeError(`Variable '${varName}': expected text (string), got ${typeof value}`, location);
    }
    return { value, inferredType: 'text' };
  }

  // Validate json type - must be object (not array)
  if (type === 'json') {
    let result = value;

    // If string, try to parse as JSON
    if (typeof value === 'string') {
      try {
        result = JSON.parse(value);
      } catch {
        throw new RuntimeError(`Variable '${varName}': invalid JSON string`, location);
      }
    }

    // Validate the result is an object (not array, not primitive)
    if (typeof result !== 'object' || result === null) {
      throw new RuntimeError(`Variable '${varName}': expected json (object), got ${typeof value}`, location);
    }
    if (Array.isArray(result)) {
      throw new RuntimeError(`Variable '${varName}': json type expects an object, not an array. Use json[] for arrays.`, location);
    }
    return { value: result, inferredType: 'json' };
  }

  // Validate boolean type - must be a boolean
  if (type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new RuntimeError(`Variable '${varName}': expected boolean, got ${typeof value}`, location);
    }
    return { value, inferredType: 'boolean' };
  }

  // Validate number type - must be a finite number
  if (type === 'number') {
    if (typeof value !== 'number') {
      throw new RuntimeError(`Variable '${varName}': expected number, got ${typeof value}`, location);
    }
    if (!Number.isFinite(value)) {
      throw new RuntimeError(`Variable '${varName}': number must be finite, got ${value}`, location);
    }
    return { value, inferredType: 'number' };
  }

  // For prompt type, accept string values as-is
  return { value, inferredType: type };
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
