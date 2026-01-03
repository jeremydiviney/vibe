// Standard tools for Vibe - exported as VibeToolValue objects
// Import with: import { standardTools, readFile, writeFile, ... } from "system/tools"

import type { VibeToolValue, ToolContext } from '../tools/types';
import { validatePathInSandbox } from '../tools/security';

// Helper to escape regex special characters
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// File Tools
// =============================================================================

export const readFile: VibeToolValue = {
  __vibeTool: true,
  name: 'readFile',
  schema: {
    name: 'readFile',
    description: 'Read the contents of a file as text. Optionally read a range of lines.',
    parameters: [
      { name: 'path', type: { type: 'string' }, description: 'The file path to read', required: true },
      { name: 'startLine', type: { type: 'number' }, description: 'First line to read (1-based, inclusive)', required: false },
      { name: 'endLine', type: { type: 'number' }, description: 'Last line to read (1-based, inclusive)', required: false },
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

    if (startLine === undefined && endLine === undefined) {
      return content;
    }

    const lines = content.split('\n');
    const start = startLine !== undefined ? Math.max(1, startLine) - 1 : 0;
    const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;

    return lines.slice(start, end).join('\n');
  },
};

export const writeFile: VibeToolValue = {
  __vibeTool: true,
  name: 'writeFile',
  schema: {
    name: 'writeFile',
    description: 'Write content to a file.',
    parameters: [
      { name: 'path', type: { type: 'string' }, description: 'The file path to write to', required: true },
      { name: 'content', type: { type: 'string' }, description: 'The content to write', required: true },
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
};

export const appendFile: VibeToolValue = {
  __vibeTool: true,
  name: 'appendFile',
  schema: {
    name: 'appendFile',
    description: 'Append content to a file.',
    parameters: [
      { name: 'path', type: { type: 'string' }, description: 'The file path to append to', required: true },
      { name: 'content', type: { type: 'string' }, description: 'The content to append', required: true },
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
};

export const fileExists: VibeToolValue = {
  __vibeTool: true,
  name: 'fileExists',
  schema: {
    name: 'fileExists',
    description: 'Check if a file exists.',
    parameters: [
      { name: 'path', type: { type: 'string' }, description: 'The file path to check', required: true },
    ],
    returns: { type: 'boolean' },
  },
  executor: async (args: Record<string, unknown>, context?: ToolContext) => {
    const inputPath = args.path as string;
    const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;
    const file = Bun.file(safePath);
    return await file.exists();
  },
};

export const listDir: VibeToolValue = {
  __vibeTool: true,
  name: 'listDir',
  schema: {
    name: 'listDir',
    description: 'List files in a directory.',
    parameters: [
      { name: 'path', type: { type: 'string' }, description: 'The directory path to list', required: true },
    ],
    returns: { type: 'array', items: { type: 'string' } },
  },
  executor: async (args: Record<string, unknown>, context?: ToolContext) => {
    const inputPath = args.path as string;
    const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;
    const fs = await import('fs/promises');
    return await fs.readdir(safePath);
  },
};

export const edit: VibeToolValue = {
  __vibeTool: true,
  name: 'edit',
  schema: {
    name: 'edit',
    description: 'Find and replace text in a file. The oldText must match exactly once in the file.',
    parameters: [
      { name: 'path', type: { type: 'string' }, description: 'The file path to edit', required: true },
      { name: 'oldText', type: { type: 'string' }, description: 'The text to find (must match exactly once)', required: true },
      { name: 'newText', type: { type: 'string' }, description: 'The text to replace with', required: true },
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

    const matches = content.split(oldText).length - 1;

    if (matches === 0) {
      throw new Error(`edit failed: oldText not found in file`);
    }

    if (matches > 1) {
      throw new Error(`edit failed: oldText matches ${matches} times, must match exactly once`);
    }

    const newContent = content.replace(oldText, newText);
    await Bun.write(safePath, newContent);
    return true;
  },
};

export const fastEdit: VibeToolValue = {
  __vibeTool: true,
  name: 'fastEdit',
  schema: {
    name: 'fastEdit',
    description:
      'Replace a region identified by prefix and suffix anchors. Use this instead of edit when replacing large blocks where specifying prefix/suffix anchors saves significant tokens vs the full oldText. For small edits, prefer the simpler edit tool. If this tool fails, fall back to using the edit tool.',
    parameters: [
      { name: 'path', type: { type: 'string' }, description: 'The file path to edit', required: true },
      {
        name: 'prefix',
        type: { type: 'string' },
        description: 'Start anchor (beginning of region to replace)',
        required: true,
      },
      {
        name: 'suffix',
        type: { type: 'string' },
        description: 'End anchor (end of region to replace)',
        required: true,
      },
      {
        name: 'newText',
        type: { type: 'string' },
        description: 'Replacement text (replaces entire region including anchors)',
        required: true,
      },
    ],
    returns: { type: 'boolean' },
  },
  executor: async (args: Record<string, unknown>, context?: ToolContext) => {
    const inputPath = args.path as string;
    const safePath = context ? validatePathInSandbox(inputPath, context.rootDir) : inputPath;
    const prefix = args.prefix as string;
    const suffix = args.suffix as string;
    const newText = args.newText as string;

    const file = Bun.file(safePath);
    const content = await file.text();

    // Build regex with escaped anchors, non-greedy match
    const pattern = escapeRegex(prefix) + '[\\s\\S]*?' + escapeRegex(suffix);
    const regex = new RegExp(pattern, 'g');
    const matches = content.match(regex);

    if (!matches || matches.length === 0) {
      throw new Error(`fastEdit failed: no region found matching prefix...suffix`);
    }

    if (matches.length > 1) {
      throw new Error(`fastEdit failed: ${matches.length} regions match, must match exactly once`);
    }

    const newContent = content.replace(regex, newText);
    await Bun.write(safePath, newContent);
    return true;
  },
};

// =============================================================================
// Search Tools
// =============================================================================

export const glob: VibeToolValue = {
  __vibeTool: true,
  name: 'glob',
  schema: {
    name: 'glob',
    description: 'Find files matching a glob pattern.',
    parameters: [
      { name: 'pattern', type: { type: 'string' }, description: 'The glob pattern (e.g., "**/*.ts")', required: true },
      { name: 'cwd', type: { type: 'string' }, description: 'Working directory for the search', required: false },
    ],
    returns: { type: 'array', items: { type: 'string' } },
  },
  executor: async (args: Record<string, unknown>, context?: ToolContext) => {
    const pattern = args.pattern as string;
    const inputCwd = args.cwd as string | undefined;
    const rootDir = context?.rootDir ?? process.cwd();
    const cwd = inputCwd ? validatePathInSandbox(inputCwd, rootDir) : rootDir;

    const globber = new Bun.Glob(pattern);
    const matches: string[] = [];

    for await (const file of globber.scan({ cwd })) {
      matches.push(file);
    }

    return matches;
  },
};

export const grep: VibeToolValue = {
  __vibeTool: true,
  name: 'grep',
  schema: {
    name: 'grep',
    description: 'Search file contents for a pattern.',
    parameters: [
      { name: 'pattern', type: { type: 'string' }, description: 'The search pattern (regex)', required: true },
      { name: 'path', type: { type: 'string' }, description: 'File or directory path to search', required: true },
      { name: 'ignoreCase', type: { type: 'boolean' }, description: 'Ignore case in pattern matching', required: false },
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
      const globber = new Bun.Glob('**/*');
      for await (const file of globber.scan({ cwd: safePath })) {
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
};

// =============================================================================
// Directory Tools
// =============================================================================

export const mkdir: VibeToolValue = {
  __vibeTool: true,
  name: 'mkdir',
  schema: {
    name: 'mkdir',
    description: 'Create a directory.',
    parameters: [
      { name: 'path', type: { type: 'string' }, description: 'The directory path to create', required: true },
      { name: 'recursive', type: { type: 'boolean' }, description: 'Create parent directories as needed', required: false },
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
};

export const dirExists: VibeToolValue = {
  __vibeTool: true,
  name: 'dirExists',
  schema: {
    name: 'dirExists',
    description: 'Check if a directory exists.',
    parameters: [
      { name: 'path', type: { type: 'string' }, description: 'The directory path to check', required: true },
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
};

// =============================================================================
// Utility Tools
// =============================================================================

export const env: VibeToolValue = {
  __vibeTool: true,
  name: 'env',
  schema: {
    name: 'env',
    description: 'Get an environment variable.',
    parameters: [
      { name: 'name', type: { type: 'string' }, description: 'The environment variable name', required: true },
      { name: 'defaultValue', type: { type: 'string' }, description: 'Default value if not set', required: false },
    ],
    returns: { type: 'string' },
  },
  executor: async (args: Record<string, unknown>) => {
    const name = args.name as string;
    const defaultValue = args.defaultValue as string | undefined;
    return process.env[name] ?? defaultValue ?? '';
  },
};

export const sleep: VibeToolValue = {
  __vibeTool: true,
  name: 'sleep',
  schema: {
    name: 'sleep',
    description: 'Pause execution for a specified number of milliseconds.',
    parameters: [
      { name: 'ms', type: { type: 'number' }, description: 'Milliseconds to sleep', required: true },
    ],
    returns: { type: 'boolean' },
  },
  executor: async (args: Record<string, unknown>) => {
    const ms = args.ms as number;
    await new Promise((resolve) => setTimeout(resolve, ms));
    return true;
  },
};

export const now: VibeToolValue = {
  __vibeTool: true,
  name: 'now',
  schema: {
    name: 'now',
    description: 'Get the current timestamp in milliseconds.',
    parameters: [],
    returns: { type: 'number' },
  },
  executor: async () => {
    return Date.now();
  },
};

export const jsonParse: VibeToolValue = {
  __vibeTool: true,
  name: 'jsonParse',
  schema: {
    name: 'jsonParse',
    description: 'Parse a JSON string into an object.',
    parameters: [
      { name: 'text', type: { type: 'string' }, description: 'The JSON string to parse', required: true },
    ],
    returns: { type: 'object', additionalProperties: true },
  },
  executor: async (args: Record<string, unknown>) => {
    const text = args.text as string;
    return JSON.parse(text);
  },
};

export const jsonStringify: VibeToolValue = {
  __vibeTool: true,
  name: 'jsonStringify',
  schema: {
    name: 'jsonStringify',
    description: 'Convert an object to a JSON string.',
    parameters: [
      { name: 'value', type: { type: 'object', additionalProperties: true }, description: 'The value to stringify', required: true },
      { name: 'pretty', type: { type: 'boolean' }, description: 'Whether to format with indentation', required: false },
    ],
    returns: { type: 'string' },
  },
  executor: async (args: Record<string, unknown>) => {
    const value = args.value;
    const pretty = args.pretty as boolean | undefined;
    return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  },
};

export const print: VibeToolValue = {
  __vibeTool: true,
  name: 'print',
  schema: {
    name: 'print',
    description: 'Output a message to the console.',
    parameters: [
      { name: 'message', type: { type: 'string' }, description: 'The message to print', required: true },
    ],
    returns: { type: 'boolean' },
  },
  executor: async (args: Record<string, unknown>) => {
    const message = args.message as string;
    console.log(message);
    return true;
  },
};

export const random: VibeToolValue = {
  __vibeTool: true,
  name: 'random',
  schema: {
    name: 'random',
    description: 'Generate a random number. Without arguments, returns 0-1. With min/max, returns integer in range.',
    parameters: [
      { name: 'min', type: { type: 'number' }, description: 'Minimum value (inclusive)', required: false },
      { name: 'max', type: { type: 'number' }, description: 'Maximum value (inclusive)', required: false },
    ],
    returns: { type: 'number' },
  },
  executor: async (args: Record<string, unknown>) => {
    const min = args.min as number | undefined;
    const max = args.max as number | undefined;

    if (min !== undefined && max !== undefined) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    return Math.random();
  },
};

export const uuid: VibeToolValue = {
  __vibeTool: true,
  name: 'uuid',
  schema: {
    name: 'uuid',
    description: 'Generate a UUID v4.',
    parameters: [],
    returns: { type: 'string' },
  },
  executor: async () => {
    return crypto.randomUUID();
  },
};

// =============================================================================
// All Standard Tools
// =============================================================================

export const standardTools: VibeToolValue[] = [
  // File tools
  readFile,
  writeFile,
  appendFile,
  fileExists,
  listDir,
  edit,
  fastEdit,
  // Search tools
  glob,
  grep,
  // Directory tools
  mkdir,
  dirExists,
  // Utility tools
  env,
  sleep,
  now,
  jsonParse,
  jsonStringify,
  print,
  random,
  uuid,
];
