import { describe, expect, test, beforeEach, beforeAll, afterAll } from 'bun:test';
import { createToolRegistry, createToolRegistryWithBuiltins } from '../registry';
import { builtinTools } from '../builtin';
import type { RegisteredTool, ToolRegistry } from '../types';

// Use project-relative temp directory for test files (gitignored)
const TEST_TMP_DIR = '.test-tmp';

describe('Tool Registry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  // ============================================================================
  // Basic registration and retrieval
  // ============================================================================

  test('registers and retrieves a tool', () => {
    const tool: RegisteredTool = {
      name: 'testTool',
      kind: 'user',
      schema: {
        name: 'testTool',
        description: 'A test tool',
        parameters: [{ name: 'input', type: { type: 'string' }, required: true }],
      },
      executor: async () => 'result',
    };

    registry.register(tool);
    const retrieved = registry.get('testTool');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('testTool');
    expect(retrieved?.kind).toBe('user');
  });

  test('returns undefined for non-existent tool', () => {
    expect(registry.get('nonExistent')).toBeUndefined();
  });

  test('has returns true for registered tool', () => {
    const tool: RegisteredTool = {
      name: 'existingTool',
      kind: 'user',
      schema: {
        name: 'existingTool',
        parameters: [],
      },
      executor: async () => null,
    };

    registry.register(tool);
    expect(registry.has('existingTool')).toBe(true);
    expect(registry.has('missingTool')).toBe(false);
  });

  // ============================================================================
  // Listing tools
  // ============================================================================

  test('lists all registered tools', () => {
    const tool1: RegisteredTool = {
      name: 'tool1',
      kind: 'user',
      schema: { name: 'tool1', parameters: [] },
      executor: async () => null,
    };

    const tool2: RegisteredTool = {
      name: 'tool2',
      kind: 'builtin',
      schema: { name: 'tool2', parameters: [] },
      executor: async () => null,
    };

    registry.register(tool1);
    registry.register(tool2);

    const tools = registry.list();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toContain('tool1');
    expect(tools.map((t) => t.name)).toContain('tool2');
  });

  test('getSchemas returns all tool schemas', () => {
    const tool: RegisteredTool = {
      name: 'schemaTest',
      kind: 'user',
      schema: {
        name: 'schemaTest',
        description: 'Test schema',
        parameters: [
          { name: 'param1', type: { type: 'string' }, required: true },
          { name: 'param2', type: { type: 'number' }, required: false },
        ],
      },
      executor: async () => null,
    };

    registry.register(tool);
    const schemas = registry.getSchemas();

    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('schemaTest');
    expect(schemas[0].parameters).toHaveLength(2);
  });

  // ============================================================================
  // Registry with builtins
  // ============================================================================

  test('createToolRegistryWithBuiltins includes all builtin tools', () => {
    const registryWithBuiltins = createToolRegistryWithBuiltins();
    const tools = registryWithBuiltins.list();

    // Check that we have builtin tools
    expect(tools.length).toBeGreaterThan(0);

    // Verify specific builtin tools are present
    expect(registryWithBuiltins.has('sleep')).toBe(true);
    expect(registryWithBuiltins.has('now')).toBe(true);
    expect(registryWithBuiltins.has('jsonParse')).toBe(true);
    expect(registryWithBuiltins.has('jsonStringify')).toBe(true);
    expect(registryWithBuiltins.has('env')).toBe(true);
  });

  test('builtin tools have kind "builtin"', () => {
    const registryWithBuiltins = createToolRegistryWithBuiltins();
    const sleepTool = registryWithBuiltins.get('sleep');

    expect(sleepTool?.kind).toBe('builtin');
  });

  // ============================================================================
  // Tool overwriting
  // ============================================================================

  test('registering tool with same name overwrites', () => {
    const tool1: RegisteredTool = {
      name: 'duplicateTool',
      kind: 'user',
      schema: { name: 'duplicateTool', description: 'first', parameters: [] },
      executor: async () => 'first',
    };

    const tool2: RegisteredTool = {
      name: 'duplicateTool',
      kind: 'user',
      schema: { name: 'duplicateTool', description: 'second', parameters: [] },
      executor: async () => 'second',
    };

    registry.register(tool1);
    registry.register(tool2);

    const retrieved = registry.get('duplicateTool');
    expect(retrieved?.schema.description).toBe('second');
  });
});

describe('Builtin Tools', () => {
  // ============================================================================
  // Verify builtin tool definitions
  // ============================================================================

  test('all builtin tools have required properties', () => {
    for (const tool of builtinTools) {
      expect(tool.name).toBeDefined();
      expect(tool.kind).toBe('builtin');
      expect(tool.schema).toBeDefined();
      expect(tool.executor).toBeInstanceOf(Function);
    }
  });

  test('builtin tools have proper schemas', () => {
    const readFileTool = builtinTools.find((t) => t.name === 'readFile');
    expect(readFileTool).toBeDefined();
    expect(readFileTool?.schema.name).toBe('readFile');
    expect(readFileTool?.schema.description).toBeDefined();
    expect(readFileTool?.schema.parameters.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // Builtin tool execution
  // ============================================================================

  test('sleep tool waits specified time', async () => {
    const sleepTool = builtinTools.find((t) => t.name === 'sleep');
    expect(sleepTool).toBeDefined();

    const start = Date.now();
    await sleepTool!.executor({ ms: 50 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some tolerance
  });

  test('now tool returns current timestamp', async () => {
    const nowTool = builtinTools.find((t) => t.name === 'now');
    expect(nowTool).toBeDefined();

    const before = Date.now();
    const result = await nowTool!.executor({});
    const after = Date.now();

    expect(typeof result).toBe('number');
    expect(result as number).toBeGreaterThanOrEqual(before);
    expect(result as number).toBeLessThanOrEqual(after);
  });

  test('jsonParse tool parses JSON string', async () => {
    const jsonParseTool = builtinTools.find((t) => t.name === 'jsonParse');
    expect(jsonParseTool).toBeDefined();

    const result = await jsonParseTool!.executor({ text: '{"name":"test","value":42}' });
    expect(result).toEqual({ name: 'test', value: 42 });
  });

  test('jsonStringify tool converts to JSON string', async () => {
    const jsonStringifyTool = builtinTools.find((t) => t.name === 'jsonStringify');
    expect(jsonStringifyTool).toBeDefined();

    const result = await jsonStringifyTool!.executor({ value: { name: 'test', value: 42 } });
    expect(result).toBe('{"name":"test","value":42}');
  });

  test('env tool returns environment variable', async () => {
    const envTool = builtinTools.find((t) => t.name === 'env');
    expect(envTool).toBeDefined();

    // Set a test env var
    process.env.TEST_VAR = 'test_value';
    const result = await envTool!.executor({ name: 'TEST_VAR' });
    expect(result).toBe('test_value');

    // Cleanup
    delete process.env.TEST_VAR;
  });

  test('env tool returns empty string for missing variable without default', async () => {
    const envTool = builtinTools.find((t) => t.name === 'env');
    expect(envTool).toBeDefined();

    const result = await envTool!.executor({ name: 'NONEXISTENT_VAR_12345' });
    expect(result).toBe('');
  });

  test('env tool returns default value for missing variable', async () => {
    const envTool = builtinTools.find((t) => t.name === 'env');
    expect(envTool).toBeDefined();

    const result = await envTool!.executor({ name: 'NONEXISTENT_VAR_12345', defaultValue: 'fallback' });
    expect(result).toBe('fallback');
  });

  // ============================================================================
  // Enhanced readFile with line ranges
  // ============================================================================

  describe('readFile with line ranges', () => {
    const fs = require('fs');
    const path = require('path');
    let testDir: string;
    let testFile: string;

    beforeAll(() => {
      fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
      testDir = fs.mkdtempSync(path.join(TEST_TMP_DIR, 'vibe-test-'));
      testFile = path.join(testDir, 'test.txt');
      // Create a 10-line test file
      fs.writeFileSync(testFile, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10');
    });

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true });
    });

    test('reads entire file without line parameters', async () => {
      const readFileTool = builtinTools.find((t) => t.name === 'readFile')!;
      const result = await readFileTool.executor({ path: testFile });
      expect(result).toBe('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10');
    });

    test('reads from startLine to end', async () => {
      const readFileTool = builtinTools.find((t) => t.name === 'readFile')!;
      const result = await readFileTool.executor({ path: testFile, startLine: 8 });
      expect(result).toBe('Line 8\nLine 9\nLine 10');
    });

    test('reads from beginning to endLine', async () => {
      const readFileTool = builtinTools.find((t) => t.name === 'readFile')!;
      const result = await readFileTool.executor({ path: testFile, endLine: 3 });
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    test('reads specific line range', async () => {
      const readFileTool = builtinTools.find((t) => t.name === 'readFile')!;
      const result = await readFileTool.executor({ path: testFile, startLine: 3, endLine: 5 });
      expect(result).toBe('Line 3\nLine 4\nLine 5');
    });

    test('handles startLine beyond file length', async () => {
      const readFileTool = builtinTools.find((t) => t.name === 'readFile')!;
      const result = await readFileTool.executor({ path: testFile, startLine: 100 });
      expect(result).toBe('');
    });

    test('handles endLine beyond file length', async () => {
      const readFileTool = builtinTools.find((t) => t.name === 'readFile')!;
      const result = await readFileTool.executor({ path: testFile, startLine: 9, endLine: 100 });
      expect(result).toBe('Line 9\nLine 10');
    });

    test('handles single line (startLine equals endLine)', async () => {
      const readFileTool = builtinTools.find((t) => t.name === 'readFile')!;
      const result = await readFileTool.executor({ path: testFile, startLine: 5, endLine: 5 });
      expect(result).toBe('Line 5');
    });
  });

  // ============================================================================
  // New tool tests
  // ============================================================================

  describe('edit tool', () => {
    const fs = require('fs');
    const path = require('path');
    let testDir: string;

    beforeAll(() => {
      fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
      testDir = fs.mkdtempSync(path.join(TEST_TMP_DIR, 'vibe-edit-test-'));
    });

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true });
    });

    test('replaces text when exactly one match', async () => {
      const editTool = builtinTools.find((t) => t.name === 'edit')!;
      const testFile = path.join(testDir, 'edit-test1.txt');
      fs.writeFileSync(testFile, 'foo bar baz');

      const result = await editTool.executor({ path: testFile, oldText: 'bar', newText: 'qux' });
      expect(result).toBe(true);
      expect(fs.readFileSync(testFile, 'utf8')).toBe('foo qux baz');
    });

    test('throws error when no match found', async () => {
      const editTool = builtinTools.find((t) => t.name === 'edit')!;
      const testFile = path.join(testDir, 'edit-test2.txt');
      fs.writeFileSync(testFile, 'foo bar baz');

      await expect(
        editTool.executor({ path: testFile, oldText: 'qux', newText: 'xxx' })
      ).rejects.toThrow('edit failed: oldText not found in file');
      expect(fs.readFileSync(testFile, 'utf8')).toBe('foo bar baz');
    });

    test('throws error when multiple matches found', async () => {
      const editTool = builtinTools.find((t) => t.name === 'edit')!;
      const testFile = path.join(testDir, 'edit-test3.txt');
      fs.writeFileSync(testFile, 'foo bar foo baz');

      await expect(
        editTool.executor({ path: testFile, oldText: 'foo', newText: 'qux' })
      ).rejects.toThrow('edit failed: oldText matches 2 times, must match exactly once');
      expect(fs.readFileSync(testFile, 'utf8')).toBe('foo bar foo baz');
    });
  });

  describe('directory tools', () => {
    const fs = require('fs');
    const path = require('path');
    let testDir: string;

    beforeAll(() => {
      fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
      testDir = fs.mkdtempSync(path.join(TEST_TMP_DIR, 'vibe-dir-test-'));
    });

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true });
    });

    test('mkdir creates directory', async () => {
      const mkdirTool = builtinTools.find((t) => t.name === 'mkdir')!;
      const newDir = path.join(testDir, 'new-dir');

      const result = await mkdirTool.executor({ path: newDir });
      expect(result).toBe(true);
      expect(fs.existsSync(newDir)).toBe(true);
    });

    test('mkdir creates nested directories with recursive=true', async () => {
      const mkdirTool = builtinTools.find((t) => t.name === 'mkdir')!;
      const nestedDir = path.join(testDir, 'a', 'b', 'c');

      const result = await mkdirTool.executor({ path: nestedDir, recursive: true });
      expect(result).toBe(true);
      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    test('dirExists returns true for existing directory', async () => {
      const dirExistsTool = builtinTools.find((t) => t.name === 'dirExists')!;
      const result = await dirExistsTool.executor({ path: testDir });
      expect(result).toBe(true);
    });

    test('dirExists returns false for non-existent directory', async () => {
      const dirExistsTool = builtinTools.find((t) => t.name === 'dirExists')!;
      const result = await dirExistsTool.executor({ path: path.join(testDir, 'nonexistent') });
      expect(result).toBe(false);
    });
  });

  describe('utility tools', () => {
    test('random returns float between 0 and 1 without args', async () => {
      const randomTool = builtinTools.find((t) => t.name === 'random')!;
      const result = await randomTool.executor({}) as number;
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(1);
    });

    test('random returns integer in range with min/max', async () => {
      const randomTool = builtinTools.find((t) => t.name === 'random')!;
      for (let i = 0; i < 10; i++) {
        const result = await randomTool.executor({ min: 5, max: 10 }) as number;
        expect(result).toBeGreaterThanOrEqual(5);
        expect(result).toBeLessThanOrEqual(10);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    test('uuid returns valid UUID v4 format', async () => {
      const uuidTool = builtinTools.find((t) => t.name === 'uuid')!;
      const result = await uuidTool.executor({}) as string;
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test('uuid returns different values on each call', async () => {
      const uuidTool = builtinTools.find((t) => t.name === 'uuid')!;
      const uuid1 = await uuidTool.executor({});
      const uuid2 = await uuidTool.executor({});
      expect(uuid1).not.toBe(uuid2);
    });
  });

  // ============================================================================
  // File tools: writeFile, appendFile, fileExists, listDir
  // ============================================================================

  describe('file tools', () => {
    const fs = require('fs');
    const path = require('path');
    let testDir: string;

    beforeAll(() => {
      fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
      testDir = fs.mkdtempSync(path.join(TEST_TMP_DIR, 'vibe-file-test-'));
    });

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true });
    });

    describe('writeFile', () => {
      test('writes content to new file', async () => {
        const writeFileTool = builtinTools.find((t) => t.name === 'writeFile')!;
        const testFile = path.join(testDir, 'write-test1.txt');

        const result = await writeFileTool.executor({ path: testFile, content: 'Hello, World!' });
        expect(result).toBe(true);
        expect(fs.readFileSync(testFile, 'utf8')).toBe('Hello, World!');
      });

      test('overwrites existing file', async () => {
        const writeFileTool = builtinTools.find((t) => t.name === 'writeFile')!;
        const testFile = path.join(testDir, 'write-test2.txt');
        fs.writeFileSync(testFile, 'original content');

        const result = await writeFileTool.executor({ path: testFile, content: 'new content' });
        expect(result).toBe(true);
        expect(fs.readFileSync(testFile, 'utf8')).toBe('new content');
      });

      test('writes empty content', async () => {
        const writeFileTool = builtinTools.find((t) => t.name === 'writeFile')!;
        const testFile = path.join(testDir, 'write-test3.txt');

        const result = await writeFileTool.executor({ path: testFile, content: '' });
        expect(result).toBe(true);
        expect(fs.readFileSync(testFile, 'utf8')).toBe('');
      });
    });

    describe('appendFile', () => {
      test('appends content to existing file', async () => {
        const appendFileTool = builtinTools.find((t) => t.name === 'appendFile')!;
        const testFile = path.join(testDir, 'append-test1.txt');
        fs.writeFileSync(testFile, 'Hello');

        const result = await appendFileTool.executor({ path: testFile, content: ', World!' });
        expect(result).toBe(true);
        expect(fs.readFileSync(testFile, 'utf8')).toBe('Hello, World!');
      });

      test('creates new file if it does not exist', async () => {
        const appendFileTool = builtinTools.find((t) => t.name === 'appendFile')!;
        const testFile = path.join(testDir, 'append-test2.txt');

        const result = await appendFileTool.executor({ path: testFile, content: 'New content' });
        expect(result).toBe(true);
        expect(fs.readFileSync(testFile, 'utf8')).toBe('New content');
      });

      test('appends multiple times', async () => {
        const appendFileTool = builtinTools.find((t) => t.name === 'appendFile')!;
        const testFile = path.join(testDir, 'append-test3.txt');
        fs.writeFileSync(testFile, 'Line 1');

        await appendFileTool.executor({ path: testFile, content: '\nLine 2' });
        await appendFileTool.executor({ path: testFile, content: '\nLine 3' });

        expect(fs.readFileSync(testFile, 'utf8')).toBe('Line 1\nLine 2\nLine 3');
      });
    });

    describe('fileExists', () => {
      test('returns true for existing file', async () => {
        const fileExistsTool = builtinTools.find((t) => t.name === 'fileExists')!;
        const testFile = path.join(testDir, 'exists-test1.txt');
        fs.writeFileSync(testFile, 'content');

        const result = await fileExistsTool.executor({ path: testFile });
        expect(result).toBe(true);
      });

      test('returns false for non-existent file', async () => {
        const fileExistsTool = builtinTools.find((t) => t.name === 'fileExists')!;
        const testFile = path.join(testDir, 'nonexistent.txt');

        const result = await fileExistsTool.executor({ path: testFile });
        expect(result).toBe(false);
      });

      test('returns false for directory (Bun.file behavior)', async () => {
        const fileExistsTool = builtinTools.find((t) => t.name === 'fileExists')!;
        // Note: Bun.file().exists() returns false for directories
        const result = await fileExistsTool.executor({ path: testDir });
        expect(result).toBe(false);
      });
    });

    describe('listDir', () => {
      test('lists files in directory', async () => {
        const listDirTool = builtinTools.find((t) => t.name === 'listDir')!;
        const subDir = path.join(testDir, 'listdir-test');
        fs.mkdirSync(subDir);
        fs.writeFileSync(path.join(subDir, 'file1.txt'), 'a');
        fs.writeFileSync(path.join(subDir, 'file2.txt'), 'b');
        fs.writeFileSync(path.join(subDir, 'file3.txt'), 'c');

        const result = (await listDirTool.executor({ path: subDir })) as string[];
        expect(result.sort()).toEqual(['file1.txt', 'file2.txt', 'file3.txt']);
      });

      test('returns empty array for empty directory', async () => {
        const listDirTool = builtinTools.find((t) => t.name === 'listDir')!;
        const emptyDir = path.join(testDir, 'empty-dir');
        fs.mkdirSync(emptyDir);

        const result = await listDirTool.executor({ path: emptyDir });
        expect(result).toEqual([]);
      });

      test('includes subdirectories in listing', async () => {
        const listDirTool = builtinTools.find((t) => t.name === 'listDir')!;
        const subDir = path.join(testDir, 'listdir-mixed');
        fs.mkdirSync(subDir);
        fs.writeFileSync(path.join(subDir, 'file.txt'), 'a');
        fs.mkdirSync(path.join(subDir, 'subdir'));

        const result = (await listDirTool.executor({ path: subDir })) as string[];
        expect(result.sort()).toEqual(['file.txt', 'subdir']);
      });
    });
  });

  // ============================================================================
  // Search tools: glob, grep
  // ============================================================================

  describe('search tools', () => {
    const fs = require('fs');
    const path = require('path');
    let testDir: string;

    beforeAll(() => {
      fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
      testDir = fs.mkdtempSync(path.join(TEST_TMP_DIR, 'vibe-search-test-'));

      // Create test file structure
      fs.mkdirSync(path.join(testDir, 'src'));
      fs.mkdirSync(path.join(testDir, 'src', 'utils'));
      fs.writeFileSync(path.join(testDir, 'src', 'index.ts'), 'export const main = () => console.log("hello");');
      fs.writeFileSync(path.join(testDir, 'src', 'app.ts'), 'import { main } from "./index";\nmain();');
      fs.writeFileSync(path.join(testDir, 'src', 'utils', 'helper.ts'), 'export function helper() { return 42; }');
      fs.writeFileSync(path.join(testDir, 'README.md'), '# Test Project\n\nThis is a test.');
      fs.writeFileSync(path.join(testDir, 'config.json'), '{"name": "test"}');
    });

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true });
    });

    describe('glob', () => {
      // Helper to normalize paths for cross-platform comparison
      const normalizePaths = (paths: string[]) => paths.map((p) => p.replace(/\\/g, '/')).sort();

      test('finds files matching pattern', async () => {
        const globTool = builtinTools.find((t) => t.name === 'glob')!;
        const result = (await globTool.executor({ pattern: '**/*.ts', cwd: testDir })) as string[];
        expect(normalizePaths(result)).toEqual(['src/app.ts', 'src/index.ts', 'src/utils/helper.ts']);
      });

      test('finds files in specific directory', async () => {
        const globTool = builtinTools.find((t) => t.name === 'glob')!;
        const result = (await globTool.executor({ pattern: '*.ts', cwd: path.join(testDir, 'src') })) as string[];
        expect(normalizePaths(result)).toEqual(['app.ts', 'index.ts']);
      });

      test('finds files with multiple extensions', async () => {
        const globTool = builtinTools.find((t) => t.name === 'glob')!;
        const result = (await globTool.executor({ pattern: '*.{md,json}', cwd: testDir })) as string[];
        expect(normalizePaths(result)).toEqual(['README.md', 'config.json']);
      });

      test('returns empty array when no matches', async () => {
        const globTool = builtinTools.find((t) => t.name === 'glob')!;
        const result = await globTool.executor({ pattern: '*.xyz', cwd: testDir });
        expect(result).toEqual([]);
      });
    });

    describe('grep', () => {
      // Helper to check if a file path ends with expected suffix (cross-platform)
      const fileEndsWith = (file: string, suffix: string) =>
        file.replace(/\\/g, '/').endsWith(suffix.replace(/\\/g, '/'));

      test('finds matches in single file', async () => {
        const grepTool = builtinTools.find((t) => t.name === 'grep')!;
        const result = (await grepTool.executor({
          pattern: 'console',
          path: path.join(testDir, 'src', 'index.ts'),
        })) as Array<{ file: string; line: number; match: string }>;

        expect(result).toHaveLength(1);
        expect(result[0].line).toBe(1);
        expect(result[0].match).toBe('console');
      });

      test('finds matches across directory', async () => {
        const grepTool = builtinTools.find((t) => t.name === 'grep')!;
        const result = (await grepTool.executor({
          pattern: 'export',
          path: path.join(testDir, 'src'),
        })) as Array<{ file: string; line: number; match: string }>;

        expect(result.length).toBeGreaterThanOrEqual(2);
        const files = [...new Set(result.map((r) => r.file))];
        expect(files.some((f) => fileEndsWith(f, 'src/index.ts'))).toBe(true);
        expect(files.some((f) => fileEndsWith(f, 'src/utils/helper.ts'))).toBe(true);
      });

      test('supports case-insensitive search', async () => {
        const grepTool = builtinTools.find((t) => t.name === 'grep')!;
        const result = (await grepTool.executor({
          pattern: 'CONSOLE',
          path: path.join(testDir, 'src', 'index.ts'),
          ignoreCase: true,
        })) as Array<{ file: string; line: number; match: string }>;

        expect(result).toHaveLength(1);
        expect(result[0].match).toBe('console');
      });

      test('returns empty array when no matches', async () => {
        const grepTool = builtinTools.find((t) => t.name === 'grep')!;
        const result = await grepTool.executor({
          pattern: 'nonexistent',
          path: testDir,
        });

        expect(result).toEqual([]);
      });

      test('supports regex patterns', async () => {
        const grepTool = builtinTools.find((t) => t.name === 'grep')!;
        const result = (await grepTool.executor({
          pattern: 'function\\s+\\w+',
          path: path.join(testDir, 'src', 'utils', 'helper.ts'),
        })) as Array<{ file: string; line: number; match: string }>;

        expect(result).toHaveLength(1);
        expect(result[0].match).toBe('function helper');
      });
    });
  });
});
