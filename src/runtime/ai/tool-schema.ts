// Tool Schema Converters for AI Providers
// Converts internal ToolSchema to provider-specific formats

import type { ToolSchema, ToolParameterSchema, JsonSchema } from '../tools/types';

// ============================================================================
// Provider-specific tool types
// ============================================================================

/** OpenAI tool format */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: 'object';
      properties: Record<string, JsonSchema>;
      required?: string[];
    };
  };
}

/** Anthropic tool format */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties: Record<string, JsonSchema>;
    required?: string[];
  };
}

/** Google function declaration format */
export interface GoogleFunctionDeclaration {
  name: string;
  description?: string;
  parameters: {
    type: 'object';
    properties: Record<string, JsonSchema>;
    required?: string[];
  };
}

// ============================================================================
// Conversion helpers
// ============================================================================

/**
 * Convert tool parameters to JSON Schema properties object.
 */
function parametersToProperties(
  params: ToolParameterSchema[]
): { properties: Record<string, JsonSchema>; required: string[] } {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const param of params) {
    const schema: JsonSchema = { ...param.type };
    if (param.description) {
      schema.description = param.description;
    }
    properties[param.name] = schema;

    if (param.required) {
      required.push(param.name);
    }
  }

  return { properties, required };
}

// ============================================================================
// Provider converters
// ============================================================================

/**
 * Convert internal ToolSchema to OpenAI tool format.
 */
export function toOpenAITool(schema: ToolSchema): OpenAITool {
  const { properties, required } = parametersToProperties(schema.parameters);

  return {
    type: 'function',
    function: {
      name: schema.name,
      description: schema.description,
      parameters: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      },
    },
  };
}

/**
 * Convert array of ToolSchema to OpenAI tools array.
 */
export function toOpenAITools(schemas: ToolSchema[]): OpenAITool[] {
  return schemas.map(toOpenAITool);
}

/**
 * Convert internal ToolSchema to Anthropic tool format.
 */
export function toAnthropicTool(schema: ToolSchema): AnthropicTool {
  const { properties, required } = parametersToProperties(schema.parameters);

  return {
    name: schema.name,
    description: schema.description,
    input_schema: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
  };
}

/**
 * Convert array of ToolSchema to Anthropic tools array.
 */
export function toAnthropicTools(schemas: ToolSchema[]): AnthropicTool[] {
  return schemas.map(toAnthropicTool);
}

/**
 * Convert internal ToolSchema to Google function declaration format.
 */
export function toGoogleFunctionDeclaration(schema: ToolSchema): GoogleFunctionDeclaration {
  const { properties, required } = parametersToProperties(schema.parameters);

  return {
    name: schema.name,
    description: schema.description,
    parameters: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
  };
}

/**
 * Convert array of ToolSchema to Google function declarations.
 */
export function toGoogleFunctionDeclarations(schemas: ToolSchema[]): GoogleFunctionDeclaration[] {
  return schemas.map(toGoogleFunctionDeclaration);
}
