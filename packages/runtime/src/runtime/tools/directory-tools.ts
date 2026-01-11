import type { RegisteredTool, ToolContext } from './types';
import { validatePathInSandbox } from './security';

/**
 * Directory operation tools: mkdir, dirExists
 */
export const directoryTools = [
  {
    name: 'mkdir',
    kind: 'builtin',
    schema: {
      name: 'mkdir',
      description: 'Create a directory.',
      parameters: [
        {
          name: 'path',
          type: { type: 'string' },
          description: 'The directory path to create',
          required: true,
        },
        {
          name: 'recursive',
          type: { type: 'boolean' },
          description: 'Create parent directories as needed (default: false)',
          required: false,
        },
      ],
      returns: { type: 'boolean' },
    },
    executor: async (args: Record<string, unknown>, context?: ToolContext) => {
      const inputPath = args.path as string;
      const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;
      const recursive = args.recursive as boolean | undefined;

      const fs = await import('fs/promises');
      await fs.mkdir(safePath, { recursive: recursive ?? false });
      return true;
    },
  },

  {
    name: 'dirExists',
    kind: 'builtin',
    schema: {
      name: 'dirExists',
      description: 'Check if a directory exists.',
      parameters: [
        {
          name: 'path',
          type: { type: 'string' },
          description: 'The directory path to check',
          required: true,
        },
      ],
      returns: { type: 'boolean' },
    },
    executor: async (args: Record<string, unknown>, context?: ToolContext) => {
      const inputPath = args.path as string;
      const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;

      const fs = await import('fs/promises');
      try {
        const stats = await fs.stat(safePath);
        return stats.isDirectory();
      } catch {
        return false;
      }
    },
  },
] satisfies RegisteredTool[];
