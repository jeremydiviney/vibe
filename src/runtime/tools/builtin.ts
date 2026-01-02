import type { RegisteredTool } from './types';

/**
 * Built-in tools that are always available in the Vibe runtime.
 */
export const builtinTools: RegisteredTool[] = [
  {
    name: 'fetch',
    kind: 'builtin',
    schema: {
      name: 'fetch',
      description: 'Fetch data from a URL. Returns the response as JSON or text.',
      parameters: [
        {
          name: 'url',
          type: { type: 'string' },
          description: 'The URL to fetch',
          required: true,
        },
        {
          name: 'method',
          type: { type: 'string' },
          description: 'HTTP method (GET, POST, PUT, DELETE). Defaults to GET.',
          required: false,
        },
        {
          name: 'body',
          type: { type: 'object', additionalProperties: true },
          description: 'Request body for POST/PUT requests',
          required: false,
        },
        {
          name: 'headers',
          type: { type: 'object', additionalProperties: true },
          description: 'HTTP headers to include',
          required: false,
        },
      ],
      returns: { type: 'object', additionalProperties: true },
    },
    executor: async (args: Record<string, unknown>) => {
      const url = args.url as string;
      const method = (args.method as string) ?? 'GET';
      const body = args.body as Record<string, unknown> | undefined;
      const headers = (args.headers as Record<string, string>) ?? {};

      const fetchHeaders: Record<string, string> = { ...headers };
      if (body && !fetchHeaders['Content-Type']) {
        fetchHeaders['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        method,
        headers: fetchHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    },
  },

  {
    name: 'readFile',
    kind: 'builtin',
    schema: {
      name: 'readFile',
      description: 'Read the contents of a file as text.',
      parameters: [
        {
          name: 'path',
          type: { type: 'string' },
          description: 'The file path to read',
          required: true,
        },
      ],
      returns: { type: 'string' },
    },
    executor: async (args: Record<string, unknown>) => {
      const path = args.path as string;
      const file = Bun.file(path);
      return await file.text();
    },
  },

  {
    name: 'writeFile',
    kind: 'builtin',
    schema: {
      name: 'writeFile',
      description: 'Write content to a file.',
      parameters: [
        {
          name: 'path',
          type: { type: 'string' },
          description: 'The file path to write to',
          required: true,
        },
        {
          name: 'content',
          type: { type: 'string' },
          description: 'The content to write',
          required: true,
        },
      ],
      returns: { type: 'boolean' },
    },
    executor: async (args: Record<string, unknown>) => {
      const path = args.path as string;
      const content = args.content as string;
      await Bun.write(path, content);
      return true;
    },
  },

  {
    name: 'appendFile',
    kind: 'builtin',
    schema: {
      name: 'appendFile',
      description: 'Append content to a file.',
      parameters: [
        {
          name: 'path',
          type: { type: 'string' },
          description: 'The file path to append to',
          required: true,
        },
        {
          name: 'content',
          type: { type: 'string' },
          description: 'The content to append',
          required: true,
        },
      ],
      returns: { type: 'boolean' },
    },
    executor: async (args: Record<string, unknown>) => {
      const path = args.path as string;
      const content = args.content as string;
      const file = Bun.file(path);
      const existing = (await file.exists()) ? await file.text() : '';
      await Bun.write(path, existing + content);
      return true;
    },
  },

  {
    name: 'fileExists',
    kind: 'builtin',
    schema: {
      name: 'fileExists',
      description: 'Check if a file exists.',
      parameters: [
        {
          name: 'path',
          type: { type: 'string' },
          description: 'The file path to check',
          required: true,
        },
      ],
      returns: { type: 'boolean' },
    },
    executor: async (args: Record<string, unknown>) => {
      const path = args.path as string;
      const file = Bun.file(path);
      return await file.exists();
    },
  },

  {
    name: 'deleteFile',
    kind: 'builtin',
    schema: {
      name: 'deleteFile',
      description: 'Delete a file.',
      parameters: [
        {
          name: 'path',
          type: { type: 'string' },
          description: 'The file path to delete',
          required: true,
        },
      ],
      returns: { type: 'boolean' },
    },
    executor: async (args: Record<string, unknown>) => {
      const path = args.path as string;
      const fs = await import('fs/promises');
      await fs.unlink(path);
      return true;
    },
  },

  {
    name: 'listDir',
    kind: 'builtin',
    schema: {
      name: 'listDir',
      description: 'List files in a directory.',
      parameters: [
        {
          name: 'path',
          type: { type: 'string' },
          description: 'The directory path to list',
          required: true,
        },
      ],
      returns: { type: 'array', items: { type: 'string' } },
    },
    executor: async (args: Record<string, unknown>) => {
      const path = args.path as string;
      const fs = await import('fs/promises');
      return await fs.readdir(path);
    },
  },

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
];
