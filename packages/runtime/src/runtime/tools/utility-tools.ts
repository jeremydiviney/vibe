import type { RegisteredTool } from './types';
import { resolveValue } from '../types';

/**
 * Utility tools: env, sleep, now, jsonParse, jsonStringify, print, random, uuid
 */
export const utilityTools = [
  {
    name: 'env',
    kind: 'builtin',
    schema: {
      name: 'env',
      description: 'Get an environment variable.',
      parameters: [
        {
          name: 'name',
          type: { type: 'string' },
          description: 'The environment variable name',
          required: true,
        },
        {
          name: 'defaultValue',
          type: { type: 'string' },
          description: 'Default value if not set',
          required: false,
        },
      ],
      returns: { type: 'string' },
    },
    executor: async (args: Record<string, unknown>) => {
      const name = args.name as string;
      const defaultValue = args.defaultValue as string | undefined;
      return process.env[name] ?? defaultValue ?? '';
    },
  },

  {
    name: 'sleep',
    kind: 'builtin',
    schema: {
      name: 'sleep',
      description: 'Pause execution for a specified number of milliseconds.',
      parameters: [
        {
          name: 'ms',
          type: { type: 'number' },
          description: 'Milliseconds to sleep',
          required: true,
        },
      ],
      returns: { type: 'boolean' },
    },
    executor: async (args: Record<string, unknown>) => {
      const ms = args.ms as number;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return true;
    },
  },

  {
    name: 'now',
    kind: 'builtin',
    schema: {
      name: 'now',
      description: 'Get the current timestamp in milliseconds.',
      parameters: [],
      returns: { type: 'number' },
    },
    executor: async () => {
      return Date.now();
    },
  },

  {
    name: 'jsonParse',
    kind: 'builtin',
    schema: {
      name: 'jsonParse',
      description: 'Parse a JSON string into an object.',
      parameters: [
        {
          name: 'text',
          type: { type: 'string' },
          description: 'The JSON string to parse',
          required: true,
        },
      ],
      returns: { type: 'object', additionalProperties: true },
    },
    executor: async (args: Record<string, unknown>) => {
      const text = args.text as string;
      return JSON.parse(text);
    },
  },

  {
    name: 'jsonStringify',
    kind: 'builtin',
    schema: {
      name: 'jsonStringify',
      description: 'Convert an object to a JSON string.',
      parameters: [
        {
          name: 'value',
          type: { type: 'object', additionalProperties: true },
          description: 'The value to stringify',
          required: true,
        },
        {
          name: 'pretty',
          type: { type: 'boolean' },
          description: 'Whether to format with indentation',
          required: false,
        },
      ],
      returns: { type: 'string' },
    },
    executor: async (args: Record<string, unknown>) => {
      const value = args.value;
      const pretty = args.pretty as boolean | undefined;
      return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
    },
  },

  {
    name: 'print',
    kind: 'builtin',
    schema: {
      name: 'print',
      description: 'Output a message to the console.',
      parameters: [
        {
          name: 'message',
          type: { type: 'string' },
          description: 'The message to print',
          required: true,
        },
      ],
      returns: { type: 'boolean' },
    },
    executor: async (args: Record<string, unknown>) => {
      // Resolve AIResultObject to its value before printing
      const message = resolveValue(args.message);
      if (typeof message === 'object' && message !== null) {
        const compact = JSON.stringify(message);
        console.log(compact.length > 80 ? JSON.stringify(message, null, 2) : compact);
      } else {
        console.log(message);
      }
      return true;
    },
  },

  {
    name: 'random',
    kind: 'builtin',
    schema: {
      name: 'random',
      description: 'Generate a random number. Without arguments, returns 0-1. With min/max, returns integer in range.',
      parameters: [
        {
          name: 'min',
          type: { type: 'number' },
          description: 'Minimum value (inclusive)',
          required: false,
        },
        {
          name: 'max',
          type: { type: 'number' },
          description: 'Maximum value (inclusive)',
          required: false,
        },
      ],
      returns: { type: 'number' },
    },
    executor: async (args: Record<string, unknown>) => {
      const min = args.min as number | undefined;
      const max = args.max as number | undefined;

      if (min !== undefined && max !== undefined) {
        // Return random integer in range [min, max]
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      // Return random float [0, 1)
      return Math.random();
    },
  },

  {
    name: 'uuid',
    kind: 'builtin',
    schema: {
      name: 'uuid',
      description: 'Generate a UUID v4.',
      parameters: [],
      returns: { type: 'string' },
    },
    executor: async () => {
      return crypto.randomUUID();
    },
  },
] satisfies RegisteredTool[];
