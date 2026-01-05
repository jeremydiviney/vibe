import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { builtinTools } from '../builtin';
import { mkdir, rm, writeFile, readFile, readdir } from 'fs/promises';
import { join } from 'path';

// Use project-relative temp directory for test files (gitignored)
const TEST_TMP_DIR = '.test-tmp';

describe('System Tools', () => {
  describe('bash tool', () => {
    test('bash tool is registered', () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash');
      expect(bashTool).toBeDefined();
      expect(bashTool?.kind).toBe('builtin');
    });

    test('bash tool has correct schema', () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash')!;
      expect(bashTool.schema.name).toBe('bash');
      expect(bashTool.schema.parameters).toHaveLength(3);
      expect(bashTool.schema.parameters[0].name).toBe('command');
      expect(bashTool.schema.parameters[0].required).toBe(true);
      expect(bashTool.schema.parameters[1].name).toBe('cwd');
      expect(bashTool.schema.parameters[1].required).toBe(false);
      expect(bashTool.schema.parameters[2].name).toBe('timeout');
      expect(bashTool.schema.parameters[2].required).toBe(false);
    });

    test('executes simple echo command', async () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash')!;
      const result = (await bashTool.executor({ command: 'echo hello' })) as {
        stdout: string;
        stderr: string;
        exitCode: number;
      };

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello');
      expect(result.stderr).toBe('');
    });

    test('captures exit code for failing commands', async () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash')!;
      // Use 'exit 1' which should work cross-platform in Bun shell
      const result = (await bashTool.executor({ command: 'exit 1' })) as {
        stdout: string;
        stderr: string;
        exitCode: number;
      };

      expect(result.exitCode).toBe(1);
    });

    test('respects cwd parameter', async () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash')!;
      const testDir = join(TEST_TMP_DIR, 'bash-cwd-test');
      await mkdir(testDir, { recursive: true });

      try {
        // pwd command in Bun shell should return current directory
        const result = (await bashTool.executor({ command: 'pwd', cwd: testDir })) as {
          stdout: string;
          stderr: string;
          exitCode: number;
        };

        expect(result.exitCode).toBe(0);
        // The output should contain our test directory name
        expect(result.stdout).toContain('bash-cwd-test');
      } finally {
        await rm(testDir, { recursive: true });
      }
    });

    test('pipes work correctly', async () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash')!;
      const result = (await bashTool.executor({ command: 'echo "line1\nline2\nline3" | wc -l' })) as {
        stdout: string;
        stderr: string;
        exitCode: number;
      };

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('3');
    });

    test('handles command with arguments', async () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash')!;
      const result = (await bashTool.executor({ command: 'echo one two three' })) as {
        stdout: string;
        stderr: string;
        exitCode: number;
      };

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('one two three');
    });

    test('supports file redirection with >', async () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash')!;
      const testDir = join(TEST_TMP_DIR, 'bash-redirect-test');
      await mkdir(testDir, { recursive: true });

      try {
        // Write to file using >
        await bashTool.executor({
          command: 'echo "hello world" > output.txt',
          cwd: testDir,
        });

        // Verify file was created with content
        const content = await readFile(join(testDir, 'output.txt'), 'utf8');
        expect(content.trim()).toBe('hello world');
      } finally {
        await rm(testDir, { recursive: true });
      }
    });

    test('supports append redirection with >>', async () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash')!;
      const testDir = join(TEST_TMP_DIR, 'bash-append-test');
      await mkdir(testDir, { recursive: true });

      try {
        // Write first line
        await bashTool.executor({
          command: 'echo "line1" > output.txt',
          cwd: testDir,
        });
        // Append second line
        await bashTool.executor({
          command: 'echo "line2" >> output.txt',
          cwd: testDir,
        });

        const content = await readFile(join(testDir, 'output.txt'), 'utf8');
        expect(content.trim()).toBe('line1\nline2');
      } finally {
        await rm(testDir, { recursive: true });
      }
    });

    test('supports complex pipe chains', async () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash')!;
      // echo lines, grep for ones containing "a", then count them
      const result = (await bashTool.executor({
        command: 'echo "apple\nbanana\ncherry\navocado" | grep a | wc -l',
      })) as { stdout: string; exitCode: number };

      expect(result.exitCode).toBe(0);
      // apple, banana, avocado all contain 'a' = 3 lines
      expect(result.stdout.trim()).toBe('3');
    });

    test('can read file and pipe to grep', async () => {
      const bashTool = builtinTools.find((t) => t.name === 'bash')!;
      const testDir = join(TEST_TMP_DIR, 'bash-cat-grep-test');
      await mkdir(testDir, { recursive: true });

      try {
        // Create a test file
        await writeFile(
          join(testDir, 'data.txt'),
          'error: something failed\ninfo: all good\nerror: another problem\ninfo: success'
        );

        // Use cat and grep to find error lines
        const result = (await bashTool.executor({
          command: 'cat data.txt | grep error',
          cwd: testDir,
        })) as { stdout: string; exitCode: number };

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('error: something failed');
        expect(result.stdout).toContain('error: another problem');
        expect(result.stdout).not.toContain('info:');
      } finally {
        await rm(testDir, { recursive: true });
      }
    });
  });

  describe('runCode tool', () => {
    let testDir: string;
    let cacheDir: string;

    beforeAll(async () => {
      testDir = join(TEST_TMP_DIR, 'runcode-test');
      cacheDir = join(testDir, '.vibe-cache');
      await mkdir(testDir, { recursive: true });
    });

    afterAll(async () => {
      await rm(testDir, { recursive: true });
    });

    test('runCode tool is registered', () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode');
      expect(runCodeTool).toBeDefined();
      expect(runCodeTool?.kind).toBe('builtin');
    });

    test('runCode tool has correct schema', () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;
      expect(runCodeTool.schema.name).toBe('runCode');
      expect(runCodeTool.schema.parameters).toHaveLength(3);
      expect(runCodeTool.schema.parameters[0].name).toBe('code');
      expect(runCodeTool.schema.parameters[0].required).toBe(true);
      expect(runCodeTool.schema.parameters[1].name).toBe('scope');
      expect(runCodeTool.schema.parameters[1].required).toBe(false);
      expect(runCodeTool.schema.parameters[2].name).toBe('timeout');
      expect(runCodeTool.schema.parameters[2].required).toBe(false);
    });

    test('executes simple code and returns result', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;
      const result = (await runCodeTool.executor(
        { code: 'return 42;' },
        { rootDir: testDir }
      )) as {
        result?: unknown;
        stdout: string;
        stderr: string;
        exitCode: number;
        runFolder: string;
      };

      expect(result.exitCode).toBe(0);
      expect(result.result).toBe(42);
      expect(result.runFolder).toMatch(/^\.vibe-cache\/r\d+$/);
    });

    test('passes scope variables to code', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;
      const result = (await runCodeTool.executor(
        {
          code: 'return x + y;',
          scope: { x: 10, y: 20 },
        },
        { rootDir: testDir }
      )) as {
        result?: unknown;
        stdout: string;
        stderr: string;
        exitCode: number;
        runFolder: string;
      };

      expect(result.exitCode).toBe(0);
      expect(result.result).toBe(30);
    });

    test('captures console output', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;
      const result = (await runCodeTool.executor(
        { code: 'console.log("hello from code"); return "done";' },
        { rootDir: testDir }
      )) as {
        result?: unknown;
        stdout: string;
        stderr: string;
        exitCode: number;
        runFolder: string;
      };

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello from code');
      expect(result.result).toBe('done');
    });

    test('creates unique run folders', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;

      // Execute two times
      const result1 = (await runCodeTool.executor(
        { code: 'return 1;' },
        { rootDir: testDir }
      )) as { runFolder: string };

      const result2 = (await runCodeTool.executor(
        { code: 'return 2;' },
        { rootDir: testDir }
      )) as { runFolder: string };

      expect(result1.runFolder).not.toBe(result2.runFolder);

      // Both should be valid run folder paths
      expect(result1.runFolder).toMatch(/^\.vibe-cache\/r\d+$/);
      expect(result2.runFolder).toMatch(/^\.vibe-cache\/r\d+$/);
    });

    test('concurrent executions get unique folders (mutex test)', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;

      // Launch 5 concurrent executions
      const promises = Array.from({ length: 5 }, (_, i) =>
        runCodeTool.executor(
          { code: `return ${i};` },
          { rootDir: testDir }
        )
      );

      const results = (await Promise.all(promises)) as Array<{
        result?: number;
        runFolder: string;
        exitCode: number;
      }>;

      // All should succeed
      for (const result of results) {
        expect(result.exitCode).toBe(0);
      }

      // All run folders should be unique
      const folders = results.map((r) => r.runFolder);
      const uniqueFolders = new Set(folders);
      expect(uniqueFolders.size).toBe(5);

      // All should match the pattern
      for (const folder of folders) {
        expect(folder).toMatch(/^\.vibe-cache\/r\d+$/);
      }
    });

    test('saves scope.json and script.ts in run folder', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;
      const result = (await runCodeTool.executor(
        {
          code: 'return name.toUpperCase();',
          scope: { name: 'test' },
        },
        { rootDir: testDir }
      )) as {
        result?: unknown;
        runFolder: string;
      };

      expect(result.result).toBe('TEST');

      // Check that files were created
      const runDir = join(testDir, result.runFolder);
      const files = await readdir(runDir);
      expect(files).toContain('scope.json');
      expect(files).toContain('script.ts');

      // Check scope.json content
      const scopeContent = await readFile(join(runDir, 'scope.json'), 'utf8');
      expect(JSON.parse(scopeContent)).toEqual({ name: 'test' });
    });

    test('can return complex objects', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;
      const result = (await runCodeTool.executor(
        { code: 'return { items: [1, 2, 3], nested: { value: "test" } };' },
        { rootDir: testDir }
      )) as {
        result?: unknown;
      };

      expect(result.result).toEqual({
        items: [1, 2, 3],
        nested: { value: 'test' },
      });
    });

    test('handles code with async/await', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;
      const result = (await runCodeTool.executor(
        {
          code: `
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            await sleep(10);
            return "completed";
          `,
        },
        { rootDir: testDir }
      )) as {
        result?: unknown;
        exitCode: number;
      };

      expect(result.exitCode).toBe(0);
      expect(result.result).toBe('completed');
    });

    test('handles code errors gracefully', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;
      const result = (await runCodeTool.executor(
        { code: 'throw new Error("intentional error");' },
        { rootDir: testDir }
      )) as {
        stdout: string;
        stderr: string;
        exitCode: number;
        runFolder: string;
      };

      // Process should exit with non-zero code
      expect(result.exitCode).not.toBe(0);
      // Error should appear in stderr
      expect(result.stderr).toContain('intentional error');
    });

    test('works with no scope', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;
      const result = (await runCodeTool.executor(
        { code: 'return "no scope needed";' },
        { rootDir: testDir }
      )) as {
        result?: unknown;
        exitCode: number;
      };

      expect(result.exitCode).toBe(0);
      expect(result.result).toBe('no scope needed');
    });

    // =========================================================================
    // Realistic AI code generation scenarios
    // =========================================================================

    test('processes array data from scope - aggregation', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;

      // Simulate AI receiving sales data and calculating totals
      const salesData = [
        { product: 'Widget', quantity: 10, price: 25 },
        { product: 'Gadget', quantity: 5, price: 50 },
        { product: 'Widget', quantity: 3, price: 25 },
      ];

      const result = (await runCodeTool.executor(
        {
          code: `
            // AI-generated code to aggregate sales by product
            const totals = {};
            for (const sale of sales) {
              if (!totals[sale.product]) {
                totals[sale.product] = { quantity: 0, revenue: 0 };
              }
              totals[sale.product].quantity += sale.quantity;
              totals[sale.product].revenue += sale.quantity * sale.price;
            }
            return totals;
          `,
          scope: { sales: salesData },
        },
        { rootDir: testDir }
      )) as { result?: unknown; exitCode: number };

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({
        Widget: { quantity: 13, revenue: 325 },
        Gadget: { quantity: 5, revenue: 250 },
      });
    });

    test('transforms and filters data from scope', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;

      const users = [
        { name: 'Alice', age: 30, active: true },
        { name: 'Bob', age: 25, active: false },
        { name: 'Charlie', age: 35, active: true },
      ];

      const result = (await runCodeTool.executor(
        {
          code: `
            // Filter active users and transform to summary
            const activeUsers = users
              .filter(u => u.active)
              .map(u => ({ name: u.name, ageGroup: u.age >= 30 ? 'senior' : 'junior' }));
            return { count: activeUsers.length, users: activeUsers };
          `,
          scope: { users },
        },
        { rootDir: testDir }
      )) as { result?: unknown; exitCode: number };

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({
        count: 2,
        users: [
          { name: 'Alice', ageGroup: 'senior' },
          { name: 'Charlie', ageGroup: 'senior' },
        ],
      });
    });

    test('reads file from project directory using relative path', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;

      // Create a data file in the project directory
      const dataDir = join(testDir, 'data');
      await mkdir(dataDir, { recursive: true });
      await writeFile(
        join(dataDir, 'config.json'),
        JSON.stringify({ apiKey: 'test-key', maxRetries: 3 })
      );

      const result = (await runCodeTool.executor(
        {
          code: `
            // AI reads config file using relative path (works because cwd = project root)
            const configText = await Bun.file('data/config.json').text();
            const config = JSON.parse(configText);
            return { key: config.apiKey, retries: config.maxRetries };
          `,
        },
        { rootDir: testDir }
      )) as { result?: unknown; exitCode: number };

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({ key: 'test-key', retries: 3 });
    });

    test('writes output file to cache folder', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;

      const result = (await runCodeTool.executor(
        {
          code: `
            // AI writes processed data to the cache folder
            const data = { processed: true, items: [1, 2, 3] };
            await Bun.write('.vibe-cache/my-output.json', JSON.stringify(data, null, 2));
            return { outputPath: '.vibe-cache/my-output.json', success: true };
          `,
        },
        { rootDir: testDir }
      )) as { result?: { outputPath: string; success: boolean }; exitCode: number };

      expect(result.exitCode).toBe(0);
      expect(result.result?.success).toBe(true);

      // Verify the output file was created
      const outputPath = join(testDir, '.vibe-cache', 'my-output.json');
      const outputContent = await readFile(outputPath, 'utf8');
      const parsed = JSON.parse(outputContent);
      expect(parsed.processed).toBe(true);
      expect(parsed.items).toEqual([1, 2, 3]);
    });

    test('multi-step: second run reads output from first run', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;

      // Step 1: Process raw data and save intermediate result
      const rawData = [1, 2, 3, 4, 5];
      const step1 = (await runCodeTool.executor(
        {
          code: `
            // Step 1: Square all numbers and save to run folder
            const squared = numbers.map(n => n * n);
            await Bun.write('.vibe-cache/step1-output.json', JSON.stringify(squared));
            return { outputFile: '.vibe-cache/step1-output.json', count: squared.length };
          `,
          scope: { numbers: rawData },
        },
        { rootDir: testDir }
      )) as { result?: { outputFile: string }; runFolder: string; exitCode: number };

      expect(step1.exitCode).toBe(0);

      // Step 2: Read from step 1's output and continue processing
      const step2 = (await runCodeTool.executor(
        {
          code: `
            // Step 2: Read previous output and calculate sum
            const previousOutput = JSON.parse(await Bun.file(previousFile).text());
            const sum = previousOutput.reduce((a, b) => a + b, 0);
            return { squared: previousOutput, sum };
          `,
          scope: { previousFile: '.vibe-cache/step1-output.json' },
        },
        { rootDir: testDir }
      )) as { result?: { squared: number[]; sum: number }; exitCode: number };

      expect(step2.exitCode).toBe(0);
      expect(step2.result).toEqual({
        squared: [1, 4, 9, 16, 25],
        sum: 55,
      });
    });

    test('handles complex nested scope data', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;

      const complexScope = {
        config: {
          settings: { theme: 'dark', language: 'en' },
          features: ['auth', 'analytics'],
        },
        users: [
          { id: 1, roles: ['admin', 'user'] },
          { id: 2, roles: ['user'] },
        ],
      };

      const result = (await runCodeTool.executor(
        {
          code: `
            // Access deeply nested scope data
            const adminUsers = users.filter(u => u.roles.includes('admin'));
            return {
              theme: config.settings.theme,
              featureCount: config.features.length,
              adminCount: adminUsers.length,
              adminIds: adminUsers.map(u => u.id),
            };
          `,
          scope: complexScope,
        },
        { rootDir: testDir }
      )) as { result?: unknown; exitCode: number };

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({
        theme: 'dark',
        featureCount: 2,
        adminCount: 1,
        adminIds: [1],
      });
    });

    test('can use npm packages available to Bun', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;

      // Test using built-in Node.js modules
      const result = (await runCodeTool.executor(
        {
          code: `
            const path = require('path');
            const joined = path.join('folder', 'subfolder', 'file.txt');
            const parsed = path.parse(joined);
            return { joined, base: parsed.base, ext: parsed.ext };
          `,
        },
        { rootDir: testDir }
      )) as { result?: unknown; exitCode: number };

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({
        joined: expect.stringContaining('file.txt'),
        base: 'file.txt',
        ext: '.txt',
      });
    });

    test('string manipulation with scope data', async () => {
      const runCodeTool = builtinTools.find((t) => t.name === 'runCode')!;

      const result = (await runCodeTool.executor(
        {
          code: `
            // Generate a formatted report from scope data
            const lines = items.map((item, i) => \`\${i + 1}. \${item.name}: $\${item.price.toFixed(2)}\`);
            const total = items.reduce((sum, item) => sum + item.price, 0);
            lines.push('---');
            lines.push(\`Total: $\${total.toFixed(2)}\`);
            return lines.join('\\n');
          `,
          scope: {
            items: [
              { name: 'Coffee', price: 4.5 },
              { name: 'Sandwich', price: 8.25 },
              { name: 'Cookie', price: 2.0 },
            ],
          },
        },
        { rootDir: testDir }
      )) as { result?: string; exitCode: number };

      expect(result.exitCode).toBe(0);
      expect(result.result).toBe(
        '1. Coffee: $4.50\n2. Sandwich: $8.25\n3. Cookie: $2.00\n---\nTotal: $14.75'
      );
    });
  });
});
