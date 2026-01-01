// Type-to-Schema conversion for structured outputs

import type { TargetType } from './types';

/** JSON Schema type for structured output enforcement */
export interface JsonSchema {
  type: string;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
}

/**
 * Convert a Vibe target type to a JSON Schema.
 * Used for OpenAI and Google structured output enforcement.
 */
export function typeToSchema(targetType: TargetType): JsonSchema | null {
  if (!targetType) return null;

  // Handle array types
  if (targetType.endsWith('[]')) {
    const elementType = targetType.slice(0, -2) as TargetType;
    const elementSchema = typeToSchema(elementType);
    if (!elementSchema) return null;
    return {
      type: 'array',
      items: elementSchema,
    };
  }

  switch (targetType) {
    case 'text':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'json':
      return { type: 'object', additionalProperties: true };
    default:
      return null;
  }
}

/**
 * Get a type instruction for providers that don't support structured output.
 * Returns a string to append to the prompt.
 */
export function getTypeInstruction(targetType: TargetType): string | null {
  if (!targetType) return null;

  // Handle array types
  if (targetType.endsWith('[]')) {
    const elementType = targetType.slice(0, -2);
    if (elementType === 'json') {
      // json[] uses same instruction as json - raw JSON without code fences
      return 'Respond with raw JSON only. No markdown, no code fences, no explanation. Just the JSON starting with { or [.';
    }
    return `Respond with a JSON array of ${elementType} values only. No additional text.`;
  }

  switch (targetType) {
    case 'text':
      return null; // Text is the default, no special instruction needed
    case 'number':
      return 'Respond with a number only. No units, no text, just the numeric value.';
    case 'boolean':
      return 'Respond with exactly "true" or "false". Nothing else.';
    case 'json':
      return 'Respond with raw JSON only. No markdown, no code fences, no explanation. Just the JSON starting with { or [.';
    default:
      return null;
  }
}

/**
 * Strip markdown code fences from content if present.
 * Handles: ```json ... ```, ``` ... ```, etc.
 */
function stripCodeFences(content: string): string {
  const trimmed = content.trim();

  // Match ```lang or ``` at start, and ``` at end
  const fencePattern = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/;
  const match = trimmed.match(fencePattern);

  if (match) {
    return match[1].trim();
  }

  return trimmed;
}

/**
 * Parse a string response according to the target type.
 * Returns the parsed value or throws on parse failure.
 */
export function parseResponse(content: string, targetType: TargetType): unknown {
  if (!targetType || targetType === 'text') {
    return content;
  }

  const trimmed = content.trim();

  switch (targetType) {
    case 'number': {
      const num = parseFloat(trimmed);
      if (isNaN(num)) {
        throw new Error(`Failed to parse response as number: "${trimmed}"`);
      }
      return num;
    }
    case 'boolean': {
      const lower = trimmed.toLowerCase();
      if (lower === 'true') return true;
      if (lower === 'false') return false;
      throw new Error(`Failed to parse response as boolean: "${trimmed}"`);
    }
    case 'json': {
      // Strip markdown code fences if present (LLMs sometimes add them despite instructions)
      const jsonContent = stripCodeFences(trimmed);
      try {
        return JSON.parse(jsonContent);
      } catch {
        throw new Error(`Failed to parse response as JSON: "${jsonContent}"`);
      }
    }
    default:
      // Handle array types
      if (targetType.endsWith('[]')) {
        // Strip markdown code fences if present (LLMs sometimes add them despite instructions)
        const arrayContent = stripCodeFences(trimmed);
        try {
          const arr = JSON.parse(arrayContent);
          if (!Array.isArray(arr)) {
            throw new Error(`Expected array, got ${typeof arr}`);
          }
          return arr;
        } catch (e) {
          throw new Error(`Failed to parse response as array: "${arrayContent}"`);
        }
      }
      return content;
  }
}

/**
 * Validate that a parsed response matches the expected type.
 */
export function validateResponseType(value: unknown, targetType: TargetType): boolean {
  if (!targetType) return true;

  if (targetType.endsWith('[]')) {
    if (!Array.isArray(value)) return false;
    const elementType = targetType.slice(0, -2) as TargetType;
    return value.every((item) => validateResponseType(item, elementType));
  }

  switch (targetType) {
    case 'text':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'json':
      return typeof value === 'object' && value !== null;
    default:
      return true;
  }
}
