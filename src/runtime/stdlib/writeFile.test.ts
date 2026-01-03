// Tests for writeFile and appendFile tools

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFile, appendFile, fileExists } from './tools';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, '.test-workspace-writeFile');

describe('writeFile tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('creates new file with content', async () => {
    const filePath = path.join(TEST_DIR, 'new.txt');

    const result = await writeFile.executor(
      { path: filePath, content: 'Hello, World!' },
      { rootDir: TEST_DIR }
    );

    expect(result).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello, World!');
  });

  test('overwrites existing file', async () => {
    const filePath = path.join(TEST_DIR, 'existing.txt');
    fs.writeFileSync(filePath, 'old content');

    await writeFile.executor({ path: filePath, content: 'new content' }, { rootDir: TEST_DIR });

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
  });

  test('writes multiline content', async () => {
    const filePath = path.join(TEST_DIR, 'multiline.txt');
    const content = 'line1\nline2\nline3';

    await writeFile.executor({ path: filePath, content }, { rootDir: TEST_DIR });

    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });

  test('writes empty file', async () => {
    const filePath = path.join(TEST_DIR, 'empty.txt');

    await writeFile.executor({ path: filePath, content: '' }, { rootDir: TEST_DIR });

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('');
  });

  test('writes file with special characters', async () => {
    const filePath = path.join(TEST_DIR, 'special.txt');
    const content = '特殊字符 émojis 🎉 symbols ©®™';

    await writeFile.executor({ path: filePath, content }, { rootDir: TEST_DIR });

    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });
});

describe('appendFile tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('appends to existing file', async () => {
    const filePath = path.join(TEST_DIR, 'existing.txt');
    fs.writeFileSync(filePath, 'Hello');

    const result = await appendFile.executor(
      { path: filePath, content: ', World!' },
      { rootDir: TEST_DIR }
    );

    expect(result).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello, World!');
  });

  test('creates new file if not exists', async () => {
    const filePath = path.join(TEST_DIR, 'new.txt');

    await appendFile.executor({ path: filePath, content: 'new content' }, { rootDir: TEST_DIR });

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
  });

  test('appends multiline content', async () => {
    const filePath = path.join(TEST_DIR, 'multiline.txt');
    fs.writeFileSync(filePath, 'line1\n');

    await appendFile.executor({ path: filePath, content: 'line2\nline3' }, { rootDir: TEST_DIR });

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('line1\nline2\nline3');
  });

  test('appends empty string (no change)', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt');
    fs.writeFileSync(filePath, 'content');

    await appendFile.executor({ path: filePath, content: '' }, { rootDir: TEST_DIR });

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('content');
  });
});

describe('fileExists tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('returns true for existing file', async () => {
    const filePath = path.join(TEST_DIR, 'exists.txt');
    fs.writeFileSync(filePath, 'content');

    const result = await fileExists.executor({ path: filePath }, { rootDir: TEST_DIR });

    expect(result).toBe(true);
  });

  test('returns false for non-existent file', async () => {
    const filePath = path.join(TEST_DIR, 'nonexistent.txt');

    const result = await fileExists.executor({ path: filePath }, { rootDir: TEST_DIR });

    expect(result).toBe(false);
  });

  test('returns false for directory (fileExists is for files only)', async () => {
    const dirPath = path.join(TEST_DIR, 'subdir');
    fs.mkdirSync(dirPath);

    // Bun.file().exists() returns false for directories - use dirExists for directories
    const result = await fileExists.executor({ path: dirPath }, { rootDir: TEST_DIR });

    expect(result).toBe(false);
  });
});
