// Return Tools for Tool-Based Type Assignment
// Single generic tool for ALL typed AI returns (number, boolean, text[], json, destructuring fields)

import type { VibeToolValue } from '../tools/types';
import type { TargetType } from './types';
import type { ExpectedField } from '../types';

// Single tool name for all return operations
export const RETURN_FIELD_TOOL = '__vibe_return_field';

/**
 * Check if we should use tool-based return for this type.
 * Returns true for all typed returns (including text) for consistent behavior.
 * Only returns false for untyped (null) returns.
 */
export function shouldUseReturnTool(targetType: TargetType): boolean {
  return targetType !== null;
}

/**
 * Check if a tool call is the return field tool.
 */
export function isReturnToolCall(toolName: string): boolean {
  return toolName === RETURN_FIELD_TOOL;
}


/**
 * Create the single generic __vibe_return_field tool.
 * Works for both single-value returns (const x: number = do "...")
 * and multi-value destructuring (const {a: text, b: number} = do "...").
 *
 * The field name and type expectations are specified in the prompt.
 * Validation happens post-collection via collectAndValidateFieldResults().
 */
function createReturnFieldTool(): VibeToolValue {
  return {
    __vibeTool: true,
    name: RETURN_FIELD_TOOL,
    schema: {
      name: RETURN_FIELD_TOOL,
      description: 'Return a typed value for a specific field. Call once per field.',
      parameters: [
        {
          name: 'field',
          type: { type: 'string' },
          description: 'The field name to return (e.g., "value", "name", "age")',
          required: true,
        },
        {
          name: 'value',
          // Use 'object' as a permissive type - actual validation happens post-collection
          // This allows numbers, strings, booleans, arrays, and objects to pass through
          type: { type: 'object', additionalProperties: true },
          description: 'The value to return for this field (any JSON-compatible type)',
          required: true,
        },
      ],
    },
    executor: async (args) => {
      // No validation here - just pass through
      // Validation happens in collectAndValidateFieldResults()
      return { __fieldReturn: true, field: args.field, value: args.value };
    },
  };
}

/**
 * Get the return tool. Returns array for backwards compatibility.
 */
export function getReturnTools(): VibeToolValue[] {
  return [createReturnFieldTool()];
}

/**
 * Result from a __vibe_return_field tool call.
 */
export interface FieldReturnResult {
  __fieldReturn: true;
  field: string;
  value: unknown;
}

/**
 * Type guard for field return results.
 */
export function isFieldReturnResult(val: unknown): val is FieldReturnResult {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as FieldReturnResult).__fieldReturn === true
  );
}

/**
 * Collect field results from tool call results and validate types.
 * Called after AI execution completes.
 * Handles both flat fields and nested field paths (e.g., "metadata.timestamp").
 *
 * @param toolResults - Array of results from __vibe_return_field calls
 * @param expectedFields - Expected fields and their types (may include nested)
 * @returns Object with nested structure matching field paths
 * @throws Error if validation fails or expected fields are missing
 */
export function collectAndValidateFieldResults(
  toolResults: FieldReturnResult[],
  expectedFields: ExpectedField[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Build expected map with flattened paths for validation
  const flattenedExpected = flattenExpectedFields(expectedFields);
  const expectedMap = new Map(flattenedExpected.map((f) => [f.path, f.type]));

  for (const { field, value } of toolResults) {
    const expectedType = expectedMap.get(field);
    if (!expectedType) {
      const validFields = flattenedExpected.map((f) => f.path).join(', ');
      throw new Error(
        `Unexpected field '${field}'. Expected: ${validFields || '(none)'}`
      );
    }

    // Validate and coerce type (handles stringified values from some providers)
    const coercedValue = validateValueForType(value, expectedType, field);

    // Set value at the correct nested path
    setNestedValue(result, field, coercedValue);
  }

  // Check all expected fields were returned
  for (const { path, type } of flattenedExpected) {
    if (!hasNestedValue(result, path)) {
      throw new Error(`Missing field '${path}' (${type})`);
    }
  }

  return result;
}

/**
 * Set a value at a nested path in an object.
 * Creates intermediate objects as needed.
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Check if a nested path exists in an object.
 */
function hasNestedValue(obj: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !(part in (current as Record<string, unknown>))) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return true;
}

/**
 * Coerce a value to the expected type.
 * Some providers (e.g., Anthropic) may return stringified values for tool parameters.
 * This function attempts to parse strings into their expected types.
 */
function coerceValue(value: unknown, type: string): unknown {
  // If value is already the right type, return as-is
  if (typeof value !== 'string') {
    return value;
  }

  // Try to coerce string values based on expected type
  switch (type) {
    case 'text':
      return value; // Already a string

    case 'number': {
      const num = parseFloat(value);
      if (Number.isFinite(num)) {
        return num;
      }
      return value; // Return original, validation will fail
    }

    case 'boolean':
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value; // Return original, validation will fail

    case 'json':
    case 'text[]':
    case 'number[]':
    case 'boolean[]':
    case 'json[]':
      // Try JSON parse for complex types
      try {
        return JSON.parse(value);
      } catch {
        return value; // Return original, validation will fail
      }

    default:
      return value;
  }
}

/**
 * Validate a value against an expected type.
 * Throws an error if validation fails.
 */
function validateValueForType(
  value: unknown,
  type: string,
  fieldName: string
): unknown {
  // First coerce the value
  const coerced = coerceValue(value, type);

  switch (type) {
    case 'text':
      if (typeof coerced !== 'string') {
        throw new Error(
          `Field '${fieldName}' expected text, got ${typeof coerced}`
        );
      }
      return coerced;

    case 'number':
      if (typeof coerced !== 'number' || !Number.isFinite(coerced)) {
        throw new Error(
          `Field '${fieldName}' expected number, got ${typeof coerced}`
        );
      }
      return coerced;

    case 'boolean':
      if (typeof coerced !== 'boolean') {
        throw new Error(
          `Field '${fieldName}' expected boolean, got ${typeof coerced}`
        );
      }
      return coerced;

    case 'json':
      if (typeof coerced !== 'object' || coerced === null) {
        throw new Error(
          `Field '${fieldName}' expected json object, got ${typeof coerced}`
        );
      }
      return coerced;

    case 'text[]':
      if (!Array.isArray(coerced)) {
        throw new Error(`Field '${fieldName}' expected text[], got ${typeof coerced}`);
      }
      for (let i = 0; i < coerced.length; i++) {
        if (typeof coerced[i] !== 'string') {
          throw new Error(
            `Field '${fieldName}' expected text[] but element ${i} is ${typeof coerced[i]}`
          );
        }
      }
      return coerced;

    case 'number[]':
      if (!Array.isArray(coerced)) {
        throw new Error(`Field '${fieldName}' expected number[], got ${typeof coerced}`);
      }
      for (let i = 0; i < coerced.length; i++) {
        if (typeof coerced[i] !== 'number' || !Number.isFinite(coerced[i])) {
          throw new Error(
            `Field '${fieldName}' expected number[] but element ${i} is ${typeof coerced[i]}`
          );
        }
      }
      return coerced;

    case 'boolean[]':
      if (!Array.isArray(coerced)) {
        throw new Error(`Field '${fieldName}' expected boolean[], got ${typeof coerced}`);
      }
      for (let i = 0; i < coerced.length; i++) {
        if (typeof coerced[i] !== 'boolean') {
          throw new Error(
            `Field '${fieldName}' expected boolean[] but element ${i} is ${typeof coerced[i]}`
          );
        }
      }
      return coerced;

    case 'json[]':
      if (!Array.isArray(coerced)) {
        throw new Error(`Field '${fieldName}' expected json[], got ${typeof coerced}`);
      }
      for (let i = 0; i < coerced.length; i++) {
        if (typeof coerced[i] !== 'object' || coerced[i] === null) {
          throw new Error(
            `Field '${fieldName}' expected json[] but element ${i} is ${typeof coerced[i]}`
          );
        }
      }
      return coerced;

    default:
      // Unknown type - return as-is
      return coerced;
  }
}

/**
 * Build the return instruction to append to the prompt.
 * This tells the AI which fields to return and their types.
 * Handles nested structures by flattening them with dot notation.
 */
export function buildReturnInstruction(expectedFields: ExpectedField[]): string {
  if (expectedFields.length === 0) return '';

  const flattenedFields = flattenExpectedFields(expectedFields);
  const callList = flattenedFields
    .map((f) => `- Call __vibe_return_field for "${f.path}" (${f.type})`)
    .join('\n');

  return `

IMPORTANT: You MUST call __vibe_return_field for EACH of the following fields:
${callList}

You must make exactly ${flattenedFields.length} tool call${flattenedFields.length > 1 ? 's' : ''}. Do not respond with plain text.`;
}

/**
 * Flatten nested ExpectedFields into a flat list with dot-notation paths.
 */
function flattenExpectedFields(
  fields: ExpectedField[],
  prefix: string = ''
): Array<{ path: string; type: string }> {
  const result: Array<{ path: string; type: string }> = [];

  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.name}` : field.name;

    if (field.nestedFields && field.nestedFields.length > 0) {
      // Recurse into nested structure
      result.push(...flattenExpectedFields(field.nestedFields, path));
    } else {
      // Leaf field
      result.push({ path, type: field.type });
    }
  }

  return result;
}
