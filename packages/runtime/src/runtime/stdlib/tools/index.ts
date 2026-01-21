// Standard tools for AI models in Vibe
// Import with: import { allTools, readFile, writeFile, ... } from "system/tools"
//
// These are tools that AI models can use via the tools parameter.
// For utility functions (uuid, random, now, etc.), use: import { ... } from "system/utils"

import type { VibeToolValue, ToolContext } from '../../tools/types';
import { validatePathInSandbox } from '../../tools/security';

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
// System Tools
// =============================================================================

export const bash: VibeToolValue = {
  __vibeTool: true,
  name: 'bash',
  schema: {
    name: 'bash',
    description:
      'Execute a shell command and return stdout, stderr, and exit code. ' +
      'Works cross-platform (Windows/Mac/Linux). ' +
      'Supports pipes (cmd1 | cmd2), file redirection (> file, >> file), and standard shell features. ' +
      'Commands run from the project root directory by default.',
    parameters: [
      { name: 'command', type: { type: 'string' }, description: 'The shell command to execute', required: true },
      { name: 'cwd', type: { type: 'string' }, description: 'Working directory for the command', required: false },
      { name: 'timeout', type: { type: 'number' }, description: 'Timeout in milliseconds (default: 30000)', required: false },
    ],
    returns: {
      type: 'object',
      properties: {
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        exitCode: { type: 'number' },
      },
    },
  },
  executor: async (args: Record<string, unknown>, context?: ToolContext) => {
    const command = args.command as string;
    const cwd = (args.cwd as string) || context?.rootDir || process.cwd();
    const timeout = (args.timeout as number) || 30000;

    const { writeFile: fsWriteFile, rm } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const scriptPath = join(tmpdir(), `vibe-bash-${process.pid}-${Date.now()}.ts`);
    const escapedCommand = command.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

    const scriptContent = `import { $ } from 'bun';
const result = await $\`${escapedCommand}\`.cwd(${JSON.stringify(cwd)}).nothrow().quiet();
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.exitCode);
`;

    try {
      await fsWriteFile(scriptPath, scriptContent);
      const proc = Bun.spawn(['bun', 'run', scriptPath], { stdout: 'pipe', stderr: 'pipe' });
      const timeoutId = setTimeout(() => proc.kill(), timeout);
      const exitCode = await proc.exited;
      clearTimeout(timeoutId);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      return { stdout, stderr, exitCode };
    } finally {
      try { await rm(scriptPath); } catch { /* ignore */ }
    }
  },
};

export const runCode: VibeToolValue = {
  __vibeTool: true,
  name: 'runCode',
  schema: {
    name: 'runCode',
    description:
      'Execute TypeScript code in a sandboxed subprocess. IMPORTANT: Only write TypeScript code, never Python or other languages. ' +
      'All scope variables are automatically available as local variables. ' +
      'Use `return value` to pass results back. Bun APIs are available. ' +
      'Each execution creates a unique folder in .vibe-cache/ for intermediate files.',
    parameters: [
      { name: 'code', type: { type: 'string' }, description: 'TypeScript code to execute (not Python or other languages)', required: true },
      { name: 'scope', type: { type: 'object', additionalProperties: true }, description: 'Variables to make available in the code', required: false },
      { name: 'timeout', type: { type: 'number' }, description: 'Timeout in milliseconds (default: 30000)', required: false },
    ],
    returns: {
      type: 'object',
      properties: {
        result: { type: 'string' },
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        exitCode: { type: 'number' },
        runFolder: { type: 'string' },
        error: { type: 'string' },
      },
    },
  },
  executor: async (args: Record<string, unknown>, context?: ToolContext) => {
    const code = args.code as string;
    const scope = (args.scope as Record<string, unknown>) || {};
    const timeout = (args.timeout as number) || 30000;

    const { mkdir: fsMkdir, writeFile: fsWriteFile, readdir } = await import('fs/promises');
    const { join } = await import('path');

    const projectDir = context?.rootDir || process.cwd();
    const cacheDir = join(projectDir, '.vibe-cache');

    // Get unique run folder
    let runName = 'r1';
    try {
      await fsMkdir(cacheDir, { recursive: true });
      const entries = await readdir(cacheDir);
      const runNums = entries.filter(e => e.startsWith('r')).map(e => parseInt(e.slice(1), 10)).filter(n => !isNaN(n));
      runName = runNums.length > 0 ? `r${Math.max(...runNums) + 1}` : 'r1';
    } catch { /* start at r1 */ }

    const runDir = join(cacheDir, runName);
    const runPath = `.vibe-cache/${runName}`;

    try {
      await fsMkdir(runDir, { recursive: true });
      await fsWriteFile(join(runDir, 'scope.json'), JSON.stringify(scope, null, 2));

      const scopeKeys = Object.keys(scope);
      const destructure = scopeKeys.length > 0 ? `const { ${scopeKeys.join(', ')} } = __scope;` : '';

      const wrappedCode = `const __scope = JSON.parse(await Bun.file('${runPath}/scope.json').text());
${destructure}
const __result = await (async () => {
${code}
})();
console.log('__VIBE_RESULT__' + JSON.stringify(__result));
`;

      await fsWriteFile(join(runDir, 'script.ts'), wrappedCode);

      const proc = Bun.spawn(['bun', 'run', `${runPath}/script.ts`], {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: projectDir,
      });

      const timeoutId = setTimeout(() => proc.kill(), timeout);
      const exitCode = await proc.exited;
      clearTimeout(timeoutId);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      let result: unknown;
      const resultMatch = stdout.match(/__VIBE_RESULT__(.+)/);
      if (resultMatch) {
        try { result = JSON.parse(resultMatch[1]); } catch { result = resultMatch[1]; }
      }

      return { result, stdout: stdout.replace(/__VIBE_RESULT__.+\n?/, ''), stderr, exitCode, runFolder: runPath };
    } catch (err) {
      return { stdout: '', stderr: '', exitCode: 1, runFolder: runPath, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

// =============================================================================
// Tool Bundles
// =============================================================================

/**
 * All tools - the complete set of standard AI tools.
 * Includes file, search, directory, and system tools.
 */
export const allTools: VibeToolValue[] = [
  // File tools
  readFile, writeFile, appendFile, fileExists, listDir, edit, fastEdit,
  // Search tools
  glob, grep,
  // Directory tools
  mkdir, dirExists,
  // System tools
  bash, runCode,
];

/**
 * Read-only tools - safe tools that cannot modify the filesystem or execute commands.
 * Excludes: writeFile, appendFile, edit, fastEdit, mkdir, bash, runCode
 */
export const readonlyTools: VibeToolValue[] = [
  // File tools (read-only)
  readFile, fileExists, listDir,
  // Search tools
  glob, grep,
  // Directory tools (read-only)
  dirExists,
];

/**
 * Safe tools - all tools except code execution and shell commands.
 * Excludes: bash, runCode
 */
export const safeTools: VibeToolValue[] = [
  // File tools
  readFile, writeFile, appendFile, fileExists, listDir, edit, fastEdit,
  // Search tools
  glob, grep,
  // Directory tools
  mkdir, dirExists,
];

