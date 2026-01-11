// Tests for the glob tool

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { glob } from './tools';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, '.test-workspace-glob');

describe('glob tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('matches files with simple pattern', async () => {
    fs.writeFileSync(path.join(TEST_DIR, 'file1.ts'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'file2.ts'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'file3.js'), '');

    const result = (await glob.executor({ pattern: '*.ts' }, { rootDir: TEST_DIR })) as string[];

    expect(result).toHaveLength(2);
    expect(result).toContain('file1.ts');
    expect(result).toContain('file2.ts');
  });

  test('matches files recursively with **', async () => {
    fs.mkdirSync(path.join(TEST_DIR, 'src'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'src', 'utils'), { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'root.ts'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'src', 'index.ts'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'src', 'utils', 'helper.ts'), '');

    const result = (await glob.executor({ pattern: '**/*.ts' }, { rootDir: TEST_DIR })) as string[];

    expect(result).toHaveLength(3);
    expect(result).toContain('root.ts');
    expect(result.some((f) => f.includes('index.ts'))).toBe(true);
    expect(result.some((f) => f.includes('helper.ts'))).toBe(true);
  });

  test('matches with custom cwd', async () => {
    fs.mkdirSync(path.join(TEST_DIR, 'src'), { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'root.ts'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'src', 'index.ts'), '');

    const result = (await glob.executor({ pattern: '*.ts', cwd: 'src' }, { rootDir: TEST_DIR })) as string[];

    expect(result).toHaveLength(1);
    expect(result).toContain('index.ts');
  });

  test('returns empty array when no matches', async () => {
    fs.writeFileSync(path.join(TEST_DIR, 'file.js'), '');

    const result = (await glob.executor({ pattern: '*.ts' }, { rootDir: TEST_DIR })) as string[];

    expect(result).toEqual([]);
  });

  test('matches multiple extensions with braces', async () => {
    fs.writeFileSync(path.join(TEST_DIR, 'file1.ts'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'file2.tsx'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'file3.js'), '');

    const result = (await glob.executor(
      { pattern: '*.{ts,tsx}' },
      { rootDir: TEST_DIR }
    )) as string[];

    expect(result).toHaveLength(2);
    expect(result).toContain('file1.ts');
    expect(result).toContain('file2.tsx');
  });

  test('matches files starting with specific prefix', async () => {
    fs.writeFileSync(path.join(TEST_DIR, 'test-one.ts'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'test-two.ts'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'other.ts'), '');

    const result = (await glob.executor({ pattern: 'test-*.ts' }, { rootDir: TEST_DIR })) as string[];

    expect(result).toHaveLength(2);
    expect(result).toContain('test-one.ts');
    expect(result).toContain('test-two.ts');
  });

  test('matches single character with ?', async () => {
    fs.writeFileSync(path.join(TEST_DIR, 'file1.ts'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'file2.ts'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'file10.ts'), '');

    const result = (await glob.executor({ pattern: 'file?.ts' }, { rootDir: TEST_DIR })) as string[];

    expect(result).toHaveLength(2);
    expect(result).toContain('file1.ts');
    expect(result).toContain('file2.ts');
    expect(result).not.toContain('file10.ts');
  });
});
