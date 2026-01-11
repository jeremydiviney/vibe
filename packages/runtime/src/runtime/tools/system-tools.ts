import { mkdir, writeFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ToolContext, RegisteredTool } from './types';

/**
 * System tools: bash, runCode
 *
 * These tools provide shell command execution and sandboxed code execution.
 */

// Counter for unique bash script filenames
let bashScriptCounter = 0;

// Mutex for run folder creation to prevent race conditions
let runFolderLock: Promise<void> = Promise.resolve();

/**
 * Bash tool - Execute shell commands using Bun's cross-platform shell.
 *
 * Uses a temp script file executed with `bun run` to run commands through
 * Bun's shell, which works cross-platform (Windows/Mac/Linux) without
 * requiring Git Bash or WSL on Windows.
 */
const bashTool: RegisteredTool = {
  name: 'bash',
  kind: 'builtin',
  schema: {
    name: 'bash',
    description:
      'Execute a shell command and return stdout, stderr, and exit code. ' +
      'Works cross-platform (Windows/Mac/Linux) without requiring Git Bash. ' +
      'Supports pipes (cmd1 | cmd2), file redirection (> file, >> file), and standard shell features. ' +
      'Commands run from the project root directory by default.',
    parameters: [
      {
        name: 'command',
        type: { type: 'string' },
        description: 'The shell command to execute (supports pipes, redirection, etc.)',
        required: true,
      },
      {
        name: 'cwd',
        type: { type: 'string' },
        description: 'Working directory for the command (defaults to project root)',
        required: false,
      },
      {
        name: 'timeout',
        type: { type: 'number' },
        description: 'Timeout in milliseconds (default: 30000). Process is killed if exceeded.',
        required: false,
      },
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
  executor: async (
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    const command = args.command as string;
    const cwd = (args.cwd as string) || context?.rootDir || process.cwd();
    const timeout = (args.timeout as number) || 30000;

    // Create a temp script file that uses Bun's shell
    // This avoids escaping issues with inline code
    const scriptId = ++bashScriptCounter;
    const scriptPath = join(tmpdir(), `vibe-bash-${process.pid}-${scriptId}.ts`);

    // Escape the command for embedding in a template literal
    const escapedCommand = command
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');

    const scriptContent = `import { $ } from 'bun';
const result = await $\`${escapedCommand}\`.cwd(${JSON.stringify(cwd)}).nothrow().quiet();
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.exitCode);
`;

    try {
      await writeFile(scriptPath, scriptContent);

      const proc = Bun.spawn(['bun', 'run', scriptPath], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Set up timeout to kill runaway processes
      const timeoutId = setTimeout(() => proc.kill(), timeout);

      // Wait for completion
      const exitCode = await proc.exited;
      clearTimeout(timeoutId);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      return {
        stdout,
        stderr,
        exitCode,
      };
    } finally {
      // Clean up temp script
      try {
        await rm(scriptPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  },
};

/**
 * Get the next run folder name (r1, r2, r3, etc.) and create it atomically.
 * Uses a mutex to prevent race conditions when multiple runCode calls happen simultaneously.
 */
async function getNextRunFolderAndCreate(cacheDir: string): Promise<string> {
  // Use mutex to ensure only one folder creation at a time
  let runName: string = '';

  const operation = runFolderLock.then(async () => {
    try {
      await mkdir(cacheDir, { recursive: true });
      const entries = await readdir(cacheDir);
      const runNums = entries
        .filter((e) => e.startsWith('r'))
        .map((e) => parseInt(e.slice(1), 10))
        .filter((n) => !isNaN(n));
      const nextNum = runNums.length > 0 ? Math.max(...runNums) + 1 : 1;
      runName = `r${nextNum}`;

      // Create the directory while still holding the lock
      await mkdir(join(cacheDir, runName), { recursive: true });
    } catch {
      // No cache dir yet, start at r1
      runName = 'r1';
      await mkdir(join(cacheDir, runName), { recursive: true });
    }
  });

  // Update the lock to include this operation
  runFolderLock = operation.catch(() => {});

  await operation;
  return runName;
}

/**
 * Code execution tool - Run AI-generated TypeScript in a sandboxed subprocess.
 *
 * Each execution gets a unique folder in .vibe-cache/ (r1, r2, r3...)
 * so the AI can reference files from previous runs.
 *
 * Working directory is set to the project root so relative paths work naturally.
 */
const runCodeTool: RegisteredTool = {
  name: 'runCode',
  kind: 'builtin',
  schema: {
    name: 'runCode',
    description:
      'Execute TypeScript/JavaScript code in a sandboxed subprocess. ' +
      'IMPORTANT: All scope variables are automatically available as local variables in your code - ' +
      'just use them directly (e.g., if scope has {items: [...], name: "test"}, you can write ' +
      '`items.map(...)` or `name.toUpperCase()` without any setup). ' +
      'Working directory is the project root, so relative paths like "data/file.json" work naturally. ' +
      'Use `return value` to pass results back. Bun APIs (Bun.file, Bun.write, etc.) are available. ' +
      'Each execution creates a unique folder in .vibe-cache/ (r1, r2, r3...) for intermediate files.',
    parameters: [
      {
        name: 'code',
        type: { type: 'string' },
        description:
          'TypeScript/JavaScript code to execute. Scope variables are already available as local ' +
          'variables - just use them directly. Use `return` to pass a result back.',
        required: true,
      },
      {
        name: 'scope',
        type: { type: 'object', additionalProperties: true },
        description:
          'Variables to make available in the code. Each key becomes a local variable. ' +
          'Example: {items: [1,2,3], name: "test"} makes `items` and `name` directly usable in code.',
        required: false,
      },
      {
        name: 'timeout',
        type: { type: 'number' },
        description: 'Timeout in milliseconds (default: 30000). Process is killed if exceeded.',
        required: false,
      },
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
  executor: async (
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<{
    result?: unknown;
    stdout: string;
    stderr: string;
    exitCode: number;
    runFolder: string;
    error?: string;
  }> => {
    const code = args.code as string;
    const scope = (args.scope as Record<string, unknown>) || {};
    const timeout = (args.timeout as number) || 30000;

    const projectDir = context?.rootDir || process.cwd();
    const cacheDir = join(projectDir, '.vibe-cache');

    // Get unique run folder (r1, r2, r3...) - mutex ensures no race conditions
    const runName = await getNextRunFolderAndCreate(cacheDir);
    const runDir = join(cacheDir, runName);
    const runPath = `.vibe-cache/${runName}`; // Relative path for AI to use

    const scopePath = join(runDir, 'scope.json');
    const scriptPath = join(runDir, 'script.ts');

    try {
      // 1. Write scope to JSON file (directory already created by mutex)
      await writeFile(scopePath, JSON.stringify(scope, null, 2));

      // 3. Wrap code - AI reads scope from run folder
      const scopeKeys = Object.keys(scope);
      const destructure =
        scopeKeys.length > 0 ? `const { ${scopeKeys.join(', ')} } = __scope;` : '';

      const wrappedCode = `// Auto-generated by Vibe runtime - Run: ${runName}
// Scope: ${runPath}/scope.json
// Working directory: project root (relative paths work)

const __scope = JSON.parse(await Bun.file('${runPath}/scope.json').text());
${destructure}

// AI-generated code
const __result = await (async () => {
${code}
})();

console.log('__VIBE_RESULT__' + JSON.stringify(__result));
`;

      await writeFile(scriptPath, wrappedCode);

      // 4. Execute in subprocess
      const proc = Bun.spawn(['bun', 'run', `${runPath}/script.ts`], {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: projectDir,
      });

      // 5. Set up timeout to kill runaway processes
      const timeoutId = setTimeout(() => proc.kill(), timeout);

      // 6. Wait for completion
      const exitCode = await proc.exited;
      clearTimeout(timeoutId);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      // 7. Parse result from stdout
      let result: unknown;
      const resultMatch = stdout.match(/__VIBE_RESULT__(.+)/);
      if (resultMatch) {
        try {
          result = JSON.parse(resultMatch[1]);
        } catch {
          result = resultMatch[1];
        }
      }

      const cleanStdout = stdout.replace(/__VIBE_RESULT__.+\n?/, '');
      return { result, stdout: cleanStdout, stderr, exitCode, runFolder: runPath };
    } catch (err) {
      return {
        stdout: '',
        stderr: '',
        exitCode: 1,
        runFolder: runPath,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    // Note: We don't delete .vibe-cache - useful for debugging
    // AI can reference previous runs via .vibe-cache/r1/, r2/, etc.
  },
};

export const systemTools: RegisteredTool[] = [bashTool, runCodeTool];
