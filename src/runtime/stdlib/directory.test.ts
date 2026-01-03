// Tests for directory tools: mkdir, listDir, dirExists

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, listDir, dirExists } from './tools';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, '.test-workspace-directory');

describe('mkdir tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('creates single directory', async () => {
    const dirPath = path.join(TEST_DIR, 'newdir');

    const result = await mkdir.executor({ path: dirPath }, { rootDir: TEST_DIR });

    expect(result).toBe(true);
    expect(fs.existsSync(dirPath)).toBe(true);
    expect(fs.statSync(dirPath).isDirectory()).toBe(true);
  });

  test('creates nested directories with recursive: true', async () => {
    const dirPath = path.join(TEST_DIR, 'a', 'b', 'c');

    const result = await mkdir.executor({ path: dirPath, recursive: true }, { rootDir: TEST_DIR });

    expect(result).toBe(true);
    expect(fs.existsSync(dirPath)).toBe(true);
  });

  test('fails without recursive when parent does not exist', async () => {
    const dirPath = path.join(TEST_DIR, 'parent', 'child');

    await expect(mkdir.executor({ path: dirPath }, { rootDir: TEST_DIR })).rejects.toThrow();
  });

  test('succeeds silently if directory already exists with recursive', async () => {
    const dirPath = path.join(TEST_DIR, 'existing');
    fs.mkdirSync(dirPath);

    const result = await mkdir.executor({ path: dirPath, recursive: true }, { rootDir: TEST_DIR });

    expect(result).toBe(true);
  });
});

describe('listDir tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('lists files in directory', async () => {
    fs.writeFileSync(path.join(TEST_DIR, 'file1.txt'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'file2.txt'), '');

    const result = (await listDir.executor({ path: TEST_DIR }, { rootDir: TEST_DIR })) as string[];

    expect(result).toHaveLength(2);
    expect(result).toContain('file1.txt');
    expect(result).toContain('file2.txt');
  });

  test('lists subdirectories', async () => {
    fs.mkdirSync(path.join(TEST_DIR, 'subdir1'));
    fs.mkdirSync(path.join(TEST_DIR, 'subdir2'));
    fs.writeFileSync(path.join(TEST_DIR, 'file.txt'), '');

    const result = (await listDir.executor({ path: TEST_DIR }, { rootDir: TEST_DIR })) as string[];

    expect(result).toHaveLength(3);
    expect(result).toContain('subdir1');
    expect(result).toContain('subdir2');
    expect(result).toContain('file.txt');
  });

  test('returns empty array for empty directory', async () => {
    const emptyDir = path.join(TEST_DIR, 'empty');
    fs.mkdirSync(emptyDir);

    const result = (await listDir.executor({ path: emptyDir }, { rootDir: TEST_DIR })) as string[];

    expect(result).toEqual([]);
  });

  test('error: directory not found', async () => {
    const nonExistent = path.join(TEST_DIR, 'nonexistent');

    await expect(listDir.executor({ path: nonExistent }, { rootDir: TEST_DIR })).rejects.toThrow();
  });

  test('does not list nested contents (shallow)', async () => {
    fs.mkdirSync(path.join(TEST_DIR, 'subdir'));
    fs.writeFileSync(path.join(TEST_DIR, 'subdir', 'nested.txt'), '');
    fs.writeFileSync(path.join(TEST_DIR, 'root.txt'), '');

    const result = (await listDir.executor({ path: TEST_DIR }, { rootDir: TEST_DIR })) as string[];

    expect(result).toHaveLength(2);
    expect(result).toContain('subdir');
    expect(result).toContain('root.txt');
    expect(result).not.toContain('nested.txt');
  });
});

describe('dirExists tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('returns true for existing directory', async () => {
    const dirPath = path.join(TEST_DIR, 'existing');
    fs.mkdirSync(dirPath);

    const result = await dirExists.executor({ path: dirPath }, { rootDir: TEST_DIR });

    expect(result).toBe(true);
  });

  test('returns false for non-existent path', async () => {
    const dirPath = path.join(TEST_DIR, 'nonexistent');

    const result = await dirExists.executor({ path: dirPath }, { rootDir: TEST_DIR });

    expect(result).toBe(false);
  });

  test('returns false for file (not directory)', async () => {
    const filePath = path.join(TEST_DIR, 'file.txt');
    fs.writeFileSync(filePath, 'content');

    const result = await dirExists.executor({ path: filePath }, { rootDir: TEST_DIR });

    expect(result).toBe(false);
  });
});
