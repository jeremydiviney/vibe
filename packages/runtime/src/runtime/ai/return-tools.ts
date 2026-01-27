// Return Tools for Tool-Based Type Assignment
// Type-specific tools for AI returns, ensuring correct schemas for all providers (including Google).

import type { VibeToolValue, JsonSchema } from '../tools/types';
import type { TargetType } from './types';
import type { ExpectedField } from '../types';

// Tool name prefix for all return operations
export const RETURN_TOOL_PREFIX = '__vibe_return_';

// Fixed set of type-specific return tools
const RETURN_TOOL_NAMES = {
  text: '__vibe_return_text',
  number: '__vibe_return_number',
  boolean: '__vibe_return_boolean',
  json: '__vibe_return_json',
  text_array: '__vibe_return_text_array',
  number_array: '__vibe_return_number_array',
  boolean_array: '__vibe_return_boolean_array',
  json_array: '__vibe_return_json_array',
} as const;

/**
 * Check if we should use tool-based return for this type.
 * Returns true for all typed returns (including text) for consistent behavior.
 * Only returns false for untyped (null) returns.
 */
export function shouldUseReturnTool(targetType: TargetType): boolean {
  return targetType !== null;
}

/**
 * Check if a tool call is a return tool (any of the type-specific tools).
 */
export function isReturnToolCall(toolName: string): boolean {
  return toolName.startsWith(RETURN_TOOL_PREFIX);
}

/**
 * Get the tool name for a given Vibe type.
 */
export function getReturnToolName(vibeType: string): string {
  switch (vibeType) {
    case 'text': return RETURN_TOOL_NAMES.text;
    case 'number': return RETURN_TOOL_NAMES.number;
    case 'boolean': return RETURN_TOOL_NAMES.boolean;
    case 'text[]': return RETURN_TOOL_NAMES.text_array;
    case 'number[]': return RETURN_TOOL_NAMES.number_array;
    case 'boolean[]': return RETURN_TOOL_NAMES.boolean_array;
    case 'json[]': return RETURN_TOOL_NAMES.json_array;
    default: return RETURN_TOOL_NAMES.json;
  }
}

/**
 * Create a type-specific return tool.
 */
function createTypedReturnTool(
  name: string,
  description: string,
  valueSchema: JsonSchema
): VibeToolValue {
  return {
    __vibeTool: true,
    name,
    schema: {
      name,
      description,
      parameters: [
        {
          name: 'value',
          type: valueSchema,
          required: true,
        },
        {
          name: 'field',
          type: { type: 'string' },
          description: 'The field name to return (only needed for multi-field returns)',
          required: false,
        },
      ],
    },
    executor: async (args) => {
      // Default field to 'value' for single-value returns
      const field = args.field ?? 'value';
      return { __fieldReturn: true, field, value: args.value };
    },
  };
}

/**
 * Get the fixed set of type-specific return tools.
 * These are always included in the system context for caching.
 */
export function getReturnTools(): VibeToolValue[] {
  return [
    createTypedReturnTool(
      RETURN_TOOL_NAMES.text,
      'Return a text (string) value. The field parameter is only required when returning multiple fields.',
      { type: 'string' }
    ),
    createTypedReturnTool(
      RETURN_TOOL_NAMES.number,
      'Return a number value. The field parameter is only required when returning multiple fields.',
      { type: 'number' }
    ),
    createTypedReturnTool(
      RETURN_TOOL_NAMES.boolean,
      'Return a boolean value. The field parameter is only required when returning multiple fields.',
      { type: 'boolean' }
    ),
    createTypedReturnTool(
      RETURN_TOOL_NAMES.json,
      'Return a JSON object value. The field parameter is only required when returning multiple fields.',
      { type: 'object' }
    ),
    createTypedReturnTool(
      RETURN_TOOL_NAMES.text_array,
      'Return an array of text (string) values. The field parameter is only required when returning multiple fields.',
      { type: 'array', items: { type: 'string' } }
    ),
    createTypedReturnTool(
      RETURN_TOOL_NAMES.number_array,
      'Return an array of number values. The field parameter is only required when returning multiple fields.',
      { type: 'array', items: { type: 'number' } }
    ),
    createTypedReturnTool(
      RETURN_TOOL_NAMES.boolean_array,
      'Return an array of boolean values. The field parameter is only required when returning multiple fields.',
      { type: 'array', items: { type: 'boolean' } }
    ),
    createTypedReturnTool(
      RETURN_TOOL_NAMES.json_array,
      'Return an array of JSON object values. The field parameter is only required when returning multiple fields.',
      { type: 'array', items: { type: 'object' } }
    ),
  ];
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

  // Check if this is a single-value return (one field named 'value')
  // In this case, don't include the field parameter in the instruction
  const isSingleValueReturn = flattenedFields.length === 1 && flattenedFields[0].path === 'value';

  const callList = flattenedFields
    .map((f) => {
      if (isSingleValueReturn) {
        // For single-value returns, just show value parameter
        return `- Call ${getReturnToolName(f.type)}(value: <${f.type}>)`;
      } else {
        // For multi-field returns, include field parameter
        return `- Call ${getReturnToolName(f.type)}(value: <${f.type}>, field: "${f.path}")`;
      }
    })
    .join('\n');

  // Add explicit instruction about field parameter for single-value returns
  const fieldNote = isSingleValueReturn
    ? ' Do NOT include a "field" parameter.'
    : '';

  return `

IMPORTANT: You MUST use the return tools to provide your answer. Call the appropriate typed tool for EACH field:
${callList}

You must make exactly ${flattenedFields.length} tool call${flattenedFields.length > 1 ? 's' : ''}.${fieldNote} Do not respond with plain text.`;
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
