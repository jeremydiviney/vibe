// Return Tools for Tool-Based Type Assignment
// These tools are always available and used for typed AI returns (number, boolean)

import type { VibeToolValue } from '../tools/types';
import type { TargetType } from './types';

// Tool names
export const RETURN_NUMBER_TOOL = '__vibe_return_number';
export const RETURN_BOOLEAN_TOOL = '__vibe_return_boolean';
export const RETURN_NUMBER_ARRAY_TOOL = '__vibe_return_number_array';
export const RETURN_BOOLEAN_ARRAY_TOOL = '__vibe_return_boolean_array';
export const RETURN_TEXT_ARRAY_TOOL = '__vibe_return_text_array';
export const RETURN_JSON_TOOL = '__vibe_return_json';
export const RETURN_JSON_ARRAY_TOOL = '__vibe_return_json_array';

/**
 * Map target types to their return tool names.
 * Returns null if the type doesn't use tool-based return.
 */
export function getReturnToolName(targetType: TargetType): string | null {
  switch (targetType) {
    case 'number':
      return RETURN_NUMBER_TOOL;
    case 'boolean':
      return RETURN_BOOLEAN_TOOL;
    case 'number[]':
      return RETURN_NUMBER_ARRAY_TOOL;
    case 'boolean[]':
      return RETURN_BOOLEAN_ARRAY_TOOL;
    case 'text[]':
      return RETURN_TEXT_ARRAY_TOOL;
    case 'json':
      return RETURN_JSON_TOOL;
    case 'json[]':
      return RETURN_JSON_ARRAY_TOOL;
    default:
      return null;
  }
}

/**
 * Check if a tool call is a return tool.
 */
export function isReturnToolCall(toolName: string): boolean {
  return (
    toolName === RETURN_NUMBER_TOOL ||
    toolName === RETURN_BOOLEAN_TOOL ||
    toolName === RETURN_NUMBER_ARRAY_TOOL ||
    toolName === RETURN_BOOLEAN_ARRAY_TOOL ||
    toolName === RETURN_TEXT_ARRAY_TOOL ||
    toolName === RETURN_JSON_TOOL ||
    toolName === RETURN_JSON_ARRAY_TOOL
  );
}

/**
 * Check if we should use tool-based return for this type.
 */
export function shouldUseReturnTool(targetType: TargetType): boolean {
  return (
    targetType === 'number' ||
    targetType === 'boolean' ||
    targetType === 'number[]' ||
    targetType === 'boolean[]' ||
    targetType === 'text[]' ||
    targetType === 'json' ||
    targetType === 'json[]'
  );
}

/**
 * Create the __vibe_return_number tool.
 * Validates that the value is a finite number.
 */
function createReturnNumberTool(): VibeToolValue {
  return {
    __vibeTool: true,
    name: RETURN_NUMBER_TOOL,
    schema: {
      name: RETURN_NUMBER_TOOL,
      description: 'Return a number result to the program.',
      parameters: [
        {
          name: 'value',
          type: { type: 'number' },
          description: 'The number value to return',
          required: true,
        },
      ],
    },
    executor: async (args) => {
      const value = args.value;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(
          `Expected a number, got ${typeof value}: ${JSON.stringify(value)}`
        );
      }
      return value;
    },
  };
}

/**
 * Create the __vibe_return_boolean tool.
 * Validates that the value is a boolean.
 */
function createReturnBooleanTool(): VibeToolValue {
  return {
    __vibeTool: true,
    name: RETURN_BOOLEAN_TOOL,
    schema: {
      name: RETURN_BOOLEAN_TOOL,
      description: 'Return a boolean result to the program.',
      parameters: [
        {
          name: 'value',
          type: { type: 'boolean' },
          description: 'The boolean value to return (true or false)',
          required: true,
        },
      ],
    },
    executor: async (args) => {
      const value = args.value;
      if (typeof value !== 'boolean') {
        throw new Error(
          `Expected a boolean (true/false), got ${typeof value}: ${JSON.stringify(value)}`
        );
      }
      return value;
    },
  };
}

/**
 * Create the __vibe_return_number_array tool.
 * Validates that the value is an array of finite numbers.
 */
function createReturnNumberArrayTool(): VibeToolValue {
  return {
    __vibeTool: true,
    name: RETURN_NUMBER_ARRAY_TOOL,
    schema: {
      name: RETURN_NUMBER_ARRAY_TOOL,
      description: 'Return an array of numbers to the program.',
      parameters: [
        {
          name: 'value',
          type: { type: 'array', items: { type: 'number' } },
          description: 'The array of numbers to return',
          required: true,
        },
      ],
    },
    executor: async (args) => {
      const value = args.value;
      if (!Array.isArray(value)) {
        throw new Error(
          `Expected an array of numbers, got ${typeof value}: ${JSON.stringify(value)}`
        );
      }
      // Validate each element is a finite number
      for (let i = 0; i < value.length; i++) {
        const elem = value[i];
        if (typeof elem !== 'number' || !Number.isFinite(elem)) {
          throw new Error(
            `Expected number at index ${i}, got ${typeof elem}: ${JSON.stringify(elem)}`
          );
        }
      }
      return value;
    },
  };
}

/**
 * Create the __vibe_return_boolean_array tool.
 * Validates that the value is an array of booleans.
 */
function createReturnBooleanArrayTool(): VibeToolValue {
  return {
    __vibeTool: true,
    name: RETURN_BOOLEAN_ARRAY_TOOL,
    schema: {
      name: RETURN_BOOLEAN_ARRAY_TOOL,
      description: 'Return an array of booleans to the program.',
      parameters: [
        {
          name: 'value',
          type: { type: 'array', items: { type: 'boolean' } },
          description: 'The array of booleans to return',
          required: true,
        },
      ],
    },
    executor: async (args) => {
      const value = args.value;
      if (!Array.isArray(value)) {
        throw new Error(
          `Expected an array of booleans, got ${typeof value}: ${JSON.stringify(value)}`
        );
      }
      // Validate each element is a boolean
      for (let i = 0; i < value.length; i++) {
        const elem = value[i];
        if (typeof elem !== 'boolean') {
          throw new Error(
            `Expected boolean at index ${i}, got ${typeof elem}: ${JSON.stringify(elem)}`
          );
        }
      }
      return value;
    },
  };
}

/**
 * Create the __vibe_return_text_array tool.
 * Validates that the value is an array of strings.
 */
function createReturnTextArrayTool(): VibeToolValue {
  return {
    __vibeTool: true,
    name: RETURN_TEXT_ARRAY_TOOL,
    schema: {
      name: RETURN_TEXT_ARRAY_TOOL,
      description: 'Return an array of text strings to the program.',
      parameters: [
        {
          name: 'value',
          type: { type: 'array', items: { type: 'string' } },
          description: 'The array of text strings to return',
          required: true,
        },
      ],
    },
    executor: async (args) => {
      const value = args.value;
      if (!Array.isArray(value)) {
        throw new Error(
          `Expected an array of strings, got ${typeof value}: ${JSON.stringify(value)}`
        );
      }
      // Validate each element is a string
      for (let i = 0; i < value.length; i++) {
        const elem = value[i];
        if (typeof elem !== 'string') {
          throw new Error(
            `Expected string at index ${i}, got ${typeof elem}: ${JSON.stringify(elem)}`
          );
        }
      }
      return value;
    },
  };
}

/**
 * Create the __vibe_return_json tool.
 * Validates that the value is a valid JSON value (object or array).
 */
function createReturnJsonTool(): VibeToolValue {
  return {
    __vibeTool: true,
    name: RETURN_JSON_TOOL,
    schema: {
      name: RETURN_JSON_TOOL,
      description: 'Return a JSON object or array to the program.',
      parameters: [
        {
          name: 'value',
          type: { type: 'object' },
          description: 'The JSON object or array to return',
          required: true,
        },
      ],
    },
    executor: async (args) => {
      const value = args.value;
      if (value === undefined) {
        throw new Error('Expected a JSON value, got undefined');
      }
      if (typeof value !== 'object' || value === null) {
        throw new Error(
          `Expected a JSON object or array, got ${typeof value}: ${JSON.stringify(value)}`
        );
      }
      return value;
    },
  };
}

/**
 * Create the __vibe_return_json_array tool.
 * Validates that the value is an array of JSON objects.
 */
function createReturnJsonArrayTool(): VibeToolValue {
  return {
    __vibeTool: true,
    name: RETURN_JSON_ARRAY_TOOL,
    schema: {
      name: RETURN_JSON_ARRAY_TOOL,
      description: 'Return an array of JSON objects to the program.',
      parameters: [
        {
          name: 'value',
          type: { type: 'array', items: { type: 'object' } },
          description: 'The array of JSON objects to return',
          required: true,
        },
      ],
    },
    executor: async (args) => {
      const value = args.value;
      if (!Array.isArray(value)) {
        throw new Error(
          `Expected an array of JSON objects, got ${typeof value}: ${JSON.stringify(value)}`
        );
      }
      // Validate each element is an object (not null, not primitive)
      for (let i = 0; i < value.length; i++) {
        const elem = value[i];
        if (typeof elem !== 'object' || elem === null) {
          throw new Error(
            `Expected object at index ${i}, got ${typeof elem}: ${JSON.stringify(elem)}`
          );
        }
      }
      return value;
    },
  };
}

/**
 * Get all return tools. These are always available as root-level tools.
 */
export function getReturnTools(): VibeToolValue[] {
  return [
    createReturnNumberTool(),
    createReturnBooleanTool(),
    createReturnNumberArrayTool(),
    createReturnBooleanArrayTool(),
    createReturnTextArrayTool(),
    createReturnJsonTool(),
    createReturnJsonArrayTool(),
  ];
}
