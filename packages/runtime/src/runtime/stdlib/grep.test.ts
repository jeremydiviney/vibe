// Tests for the grep tool

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { grep } from './tools';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, '.test-workspace-grep');

interface GrepMatch {
  file: string;
  line: number;
  match: string;
}

describe('grep tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('finds matches in single file', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const foo = 1;\nconst bar = 2;\nconst foobar = 3;');

    const result = (await grep.executor(
      { pattern: 'foo', path: 'test.ts' },
      { rootDir: TEST_DIR }
    )) as GrepMatch[];

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ file: 'test.ts', line: 1, match: 'foo' });
    expect(result[1]).toEqual({ file: 'test.ts', line: 3, match: 'foo' });
  });

  test('searches directory recursively', async () => {
    fs.mkdirSync(path.join(TEST_DIR, 'src'), { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'root.ts'), 'const target = 1;');
    fs.writeFileSync(path.join(TEST_DIR, 'src', 'index.ts'), 'const target = 2;');

    const result = (await grep.executor({ pattern: 'target', path: '.' }, { rootDir: TEST_DIR })) as GrepMatch[];

    expect(result).toHaveLength(2);
    expect(result.some((m) => m.file === 'root.ts')).toBe(true);
    expect(result.some((m) => m.file.includes('index.ts'))).toBe(true);
  });

  test('supports regex patterns', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const foo123 = 1;\nconst bar = 2;\nconst foo456 = 3;');

    const result = (await grep.executor(
      { pattern: 'foo\\d+', path: 'test.ts' },
      { rootDir: TEST_DIR }
    )) as GrepMatch[];

    expect(result).toHaveLength(2);
    expect(result[0].match).toBe('foo123');
    expect(result[1].match).toBe('foo456');
  });

  test('case insensitive search with ignoreCase', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const FOO = 1;\nconst foo = 2;\nconst Foo = 3;');

    const result = (await grep.executor(
      { pattern: 'foo', path: 'test.ts', ignoreCase: true },
      { rootDir: TEST_DIR }
    )) as GrepMatch[];

    expect(result).toHaveLength(3);
  });

  test('case sensitive by default', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const FOO = 1;\nconst foo = 2;\nconst Foo = 3;');

    const result = (await grep.executor(
      { pattern: 'foo', path: 'test.ts' },
      { rootDir: TEST_DIR }
    )) as GrepMatch[];

    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(2);
  });

  test('returns empty array when no matches', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const bar = 1;');

    const result = (await grep.executor(
      { pattern: 'foo', path: 'test.ts' },
      { rootDir: TEST_DIR }
    )) as GrepMatch[];

    expect(result).toEqual([]);
  });

  test('finds multiple matches on same line', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'foo bar foo baz foo');

    const result = (await grep.executor(
      { pattern: 'foo', path: 'test.ts' },
      { rootDir: TEST_DIR }
    )) as GrepMatch[];

    expect(result).toHaveLength(3);
    expect(result.every((m) => m.line === 1)).toBe(true);
  });

  test('handles special regex characters when escaped', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const x = a.b;\nconst y = a*b;');

    // Search for literal "a.b" (escaped dot)
    const result = (await grep.executor(
      { pattern: 'a\\.b', path: 'test.ts' },
      { rootDir: TEST_DIR }
    )) as GrepMatch[];

    expect(result).toHaveLength(1);
    expect(result[0].match).toBe('a.b');
  });

  test('returns correct line numbers (1-based)', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'line1\nline2\ntarget\nline4\ntarget');

    const result = (await grep.executor(
      { pattern: 'target', path: 'test.ts' },
      { rootDir: TEST_DIR }
    )) as GrepMatch[];

    expect(result).toHaveLength(2);
    expect(result[0].line).toBe(3);
    expect(result[1].line).toBe(5);
  });
});
