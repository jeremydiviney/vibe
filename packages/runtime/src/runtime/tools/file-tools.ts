import type { RegisteredTool, ToolContext } from './types';
import { validatePathInSandbox } from './security';

/**
 * File operation tools: read, write, append, exists, list, edit
 */
export const fileTools = [
  {
    name: 'readFile',
    kind: 'builtin',
    schema: {
      name: 'readFile',
      description: 'Read the contents of a file as text. Optionally read a range of lines.',
      parameters: [
        {
          name: 'path',
          type: { type: 'string' },
          description: 'The file path to read',
          required: true,
        },
        {
          name: 'startLine',
          type: { type: 'number' },
          description: 'First line to read (1-based, inclusive). If omitted, starts from beginning.',
          required: false,
        },
        {
          name: 'endLine',
          type: { type: 'number' },
          description: 'Last line to read (1-based, inclusive). If omitted, reads to end of file.',
          required: false,
        },
      ],
      returns: { type: 'string' },
    },
    executor: async (args: Record<string, unknown>, context?: ToolContext) => {
      const inputPath = args.path as string;
      const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;
      const startLine = args.startLine as number | undefined;
      const endLine = args.endLine as number | undefined;

      const file = Bun.file(safePath);
      const content = await file.text();

      // If no line range specified, return entire file
      if (startLine === undefined && endLine === undefined) {
        return content;
      }

      // Split into lines and extract the requested range
      const lines = content.split('\n');
      const start = startLine !== undefined ? Math.max(1, startLine) - 1 : 0;  // Convert to 0-based
      const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;

      return lines.slice(start, end).join('\n');
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
    executor: async (args: Record<string, unknown>, context?: ToolContext) => {
      const inputPath = args.path as string;
      const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;
      const content = args.content as string;
      await Bun.write(safePath, content);
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
    executor: async (args: Record<string, unknown>, context?: ToolContext) => {
      const inputPath = args.path as string;
      const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;
      const content = args.content as string;
      const file = Bun.file(safePath);
      const existing = (await file.exists()) ? await file.text() : '';
      await Bun.write(safePath, existing + content);
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
    executor: async (args: Record<string, unknown>, context?: ToolContext) => {
      const inputPath = args.path as string;
      const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;
      const file = Bun.file(safePath);
      return await file.exists();
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
    executor: async (args: Record<string, unknown>, context?: ToolContext) => {
      const inputPath = args.path as string;
      const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;
      const fs = await import('fs/promises');
      return await fs.readdir(safePath);
    },
  },

  {
    name: 'edit',
    kind: 'builtin',
    schema: {
      name: 'edit',
      description:
        'Find and replace text in a file. The oldText must match exactly once in the file.',
      parameters: [
        {
          name: 'path',
          type: { type: 'string' },
          description: 'The file path to edit',
          required: true,
        },
        {
          name: 'oldText',
          type: { type: 'string' },
          description: 'The text to find (must match exactly once)',
          required: true,
        },
        {
          name: 'newText',
          type: { type: 'string' },
          description: 'The text to replace with',
          required: true,
        },
      ],
      returns: { type: 'boolean' },
    },
    executor: async (args: Record<string, unknown>, context?: ToolContext) => {
      const inputPath = args.path as string;
      const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;
      const oldText = args.oldText as string;
      const newText = args.newText as string;

      const file = Bun.file(safePath);
      const content = await file.text();

      // Count occurrences of oldText
      const matches = content.split(oldText).length - 1;

      if (matches === 0) {
        throw new Error(`edit failed: oldText not found in file`);
      }

      if (matches > 1) {
        throw new Error(
          `edit failed: oldText matches ${matches} times, must match exactly once. Provide more context to make the match unique.`
        );
      }

      // Exactly one match - safe to replace
      const newContent = content.replace(oldText, newText);
      await Bun.write(safePath, newContent);
      return true;
    },
  },
] satisfies RegisteredTool[];
