import type { RegisteredTool, ToolContext } from './types';
import { validatePathInSandbox } from './security';

/**
 * File search tools: glob, grep
 */
export const searchTools = [
  {
    name: 'glob',
    kind: 'builtin',
    schema: {
      name: 'glob',
      description: 'Find files matching a glob pattern.',
      parameters: [
        {
          name: 'pattern',
          type: { type: 'string' },
          description: 'The glob pattern (e.g., "**/*.ts", "src/*.js")',
          required: true,
        },
        {
          name: 'cwd',
          type: { type: 'string' },
          description: 'Working directory for the search (default: root directory)',
          required: false,
        },
      ],
      returns: { type: 'array', items: { type: 'string' } },
    },
    executor: async (args: Record<string, unknown>, context?: ToolContext) => {
      const pattern = args.pattern as string;
      const inputCwd = args.cwd as string | undefined;
      const rootDir = context?.rootDir ?? process.cwd();
      const cwd = inputCwd ? validatePathInSandbox(inputCwd, rootDir) : rootDir;

      const glob = new Bun.Glob(pattern);
      const matches: string[] = [];

      for await (const file of glob.scan({ cwd })) {
        matches.push(file);
      }

      return matches;
    },
  },

  {
    name: 'grep',
    kind: 'builtin',
    schema: {
      name: 'grep',
      description: 'Search file contents for a pattern.',
      parameters: [
        {
          name: 'pattern',
          type: { type: 'string' },
          description: 'The search pattern (regex)',
          required: true,
        },
        {
          name: 'path',
          type: { type: 'string' },
          description: 'File or directory path to search',
          required: true,
        },
        {
          name: 'ignoreCase',
          type: { type: 'boolean' },
          description: 'Ignore case in pattern matching',
          required: false,
        },
      ],
      returns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            line: { type: 'number' },
            match: { type: 'string' },
          },
        },
      },
    },
    executor: async (args: Record<string, unknown>, context?: ToolContext) => {
      const pattern = args.pattern as string;
      const inputPath = args.path as string;
      const ignoreCase = args.ignoreCase as boolean | undefined;
      const rootDir = context?.rootDir ?? process.cwd();
      const safePath = validatePathInSandbox(inputPath, rootDir);

      const fs = await import('fs/promises');
      const pathModule = await import('path');
      const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');

      const results: Array<{ file: string; line: number; match: string }> = [];

      async function searchFile(filePath: string) {
        const content = await Bun.file(filePath).text();
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const matches = lines[i].match(regex);
          if (matches) {
            for (const match of matches) {
              results.push({
                file: pathModule.relative(rootDir, filePath),
                line: i + 1,
                match,
              });
            }
          }
        }
      }

      const stats = await fs.stat(safePath);
      if (stats.isDirectory()) {
        // Search all files in directory recursively
        const glob = new Bun.Glob('**/*');
        for await (const file of glob.scan({ cwd: safePath })) {
          const fullPath = pathModule.join(safePath, file);
          const fileStats = await fs.stat(fullPath);
          if (fileStats.isFile()) {
            await searchFile(fullPath);
          }
        }
      } else {
        await searchFile(safePath);
      }

      return results;
    },
  },
] satisfies RegisteredTool[];
