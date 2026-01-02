import { describe, it, expect } from 'bun:test';
import {
  toOpenAITool,
  toOpenAITools,
  toAnthropicTool,
  toAnthropicTools,
  toGoogleFunctionDeclaration,
  toGoogleFunctionDeclarations,
} from '../tool-schema';
import type { ToolSchema } from '../../tools/types';

describe('OpenAI Tool Schema Conversion', () => {
  it('should convert a simple tool schema', () => {
    const schema: ToolSchema = {
      name: 'get_weather',
      description: 'Get weather for a location',
      parameters: [
        { name: 'location', type: { type: 'string' }, description: 'City name', required: true },
      ],
    };

    const result = toOpenAITool(schema);

    expect(result).toEqual({
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City name',
            },
          },
          required: ['location'],
        },
      },
    });
  });

  it('should convert multiple parameter types', () => {
    const schema: ToolSchema = {
      name: 'search',
      parameters: [
        { name: 'query', type: { type: 'string' }, required: true },
        { name: 'limit', type: { type: 'number' }, required: false },
        { name: 'exact', type: { type: 'boolean' }, required: false },
        { name: 'filters', type: { type: 'object' }, required: false },
      ],
    };

    const result = toOpenAITool(schema);

    expect(result.function.parameters.properties).toEqual({
      query: { type: 'string' },
      limit: { type: 'number' },
      exact: { type: 'boolean' },
      filters: { type: 'object' },
    });
    expect(result.function.parameters.required).toEqual(['query']);
  });

  it('should convert multiple tools', () => {
    const schemas: ToolSchema[] = [
      { name: 'tool1', parameters: [] },
      { name: 'tool2', parameters: [] },
    ];

    const result = toOpenAITools(schemas);

    expect(result).toHaveLength(2);
    expect(result[0].function.name).toBe('tool1');
    expect(result[1].function.name).toBe('tool2');
  });
});

describe('Anthropic Tool Schema Conversion', () => {
  it('should convert a simple tool schema', () => {
    const schema: ToolSchema = {
      name: 'get_weather',
      description: 'Get weather for a location',
      parameters: [
        { name: 'location', type: { type: 'string' }, description: 'City name', required: true },
      ],
    };

    const result = toAnthropicTool(schema);

    expect(result).toEqual({
      name: 'get_weather',
      description: 'Get weather for a location',
      input_schema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City name',
          },
        },
        required: ['location'],
      },
    });
  });

  it('should convert multiple parameter types', () => {
    const schema: ToolSchema = {
      name: 'search',
      parameters: [
        { name: 'query', type: { type: 'string' }, required: true },
        { name: 'limit', type: { type: 'number' }, required: false },
        { name: 'exact', type: { type: 'boolean' }, required: false },
        { name: 'filters', type: { type: 'object' }, required: false },
      ],
    };

    const result = toAnthropicTool(schema);

    expect(result.input_schema.properties).toEqual({
      query: { type: 'string' },
      limit: { type: 'number' },
      exact: { type: 'boolean' },
      filters: { type: 'object' },
    });
    expect(result.input_schema.required).toEqual(['query']);
  });

  it('should convert multiple tools', () => {
    const schemas: ToolSchema[] = [
      { name: 'tool1', parameters: [] },
      { name: 'tool2', parameters: [] },
    ];

    const result = toAnthropicTools(schemas);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('tool1');
    expect(result[1].name).toBe('tool2');
  });
});

describe('Google Tool Schema Conversion', () => {
  it('should convert a simple tool schema', () => {
    const schema: ToolSchema = {
      name: 'get_weather',
      description: 'Get weather for a location',
      parameters: [
        { name: 'location', type: { type: 'string' }, description: 'City name', required: true },
      ],
    };

    const result = toGoogleFunctionDeclaration(schema);

    expect(result).toEqual({
      name: 'get_weather',
      description: 'Get weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City name',
          },
        },
        required: ['location'],
      },
    });
  });

  it('should convert multiple parameter types', () => {
    const schema: ToolSchema = {
      name: 'search',
      parameters: [
        { name: 'query', type: { type: 'string' }, required: true },
        { name: 'limit', type: { type: 'number' }, required: false },
        { name: 'exact', type: { type: 'boolean' }, required: false },
        { name: 'filters', type: { type: 'object' }, required: false },
      ],
    };

    const result = toGoogleFunctionDeclaration(schema);

    expect(result.parameters.properties).toEqual({
      query: { type: 'string' },
      limit: { type: 'number' },
      exact: { type: 'boolean' },
      filters: { type: 'object' },
    });
    expect(result.parameters.required).toEqual(['query']);
  });

  it('should convert multiple tools', () => {
    const schemas: ToolSchema[] = [
      { name: 'tool1', parameters: [] },
      { name: 'tool2', parameters: [] },
    ];

    const result = toGoogleFunctionDeclarations(schemas);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('tool1');
    expect(result[1].name).toBe('tool2');
  });
});

describe('Parameter Type Mapping', () => {
  it('should preserve all JSON Schema types', () => {
    const schema: ToolSchema = {
      name: 'test',
      parameters: [
        { name: 'text_param', type: { type: 'string' }, required: true },
        { name: 'number_param', type: { type: 'number' }, required: true },
        { name: 'boolean_param', type: { type: 'boolean' }, required: true },
        { name: 'json_param', type: { type: 'object' }, required: true },
        { name: 'text_array', type: { type: 'array', items: { type: 'string' } }, required: true },
        { name: 'number_array', type: { type: 'array', items: { type: 'number' } }, required: true },
        { name: 'json_array', type: { type: 'array', items: { type: 'object' } }, required: true },
      ],
    };

    const result = toOpenAITool(schema);

    expect(result.function.parameters.properties.text_param).toEqual({ type: 'string' });
    expect(result.function.parameters.properties.number_param).toEqual({ type: 'number' });
    expect(result.function.parameters.properties.boolean_param).toEqual({ type: 'boolean' });
    expect(result.function.parameters.properties.json_param).toEqual({ type: 'object' });
    expect(result.function.parameters.properties.text_array).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
    expect(result.function.parameters.properties.number_array).toEqual({
      type: 'array',
      items: { type: 'number' },
    });
    expect(result.function.parameters.properties.json_array).toEqual({
      type: 'array',
      items: { type: 'object' },
    });
  });
});
