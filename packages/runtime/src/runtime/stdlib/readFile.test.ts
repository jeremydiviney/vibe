// Tests for the readFile tool

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { readFile } from './tools';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, '.test-workspace-readFile');

describe('readFile tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('reads entire file contents', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt');
    fs.writeFileSync(filePath, 'Hello, World!');

    const result = await readFile.executor({ path: filePath }, { rootDir: TEST_DIR });

    expect(result).toBe('Hello, World!');
  });

  test('reads multiline file', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3');

    const result = await readFile.executor({ path: filePath }, { rootDir: TEST_DIR });

    expect(result).toBe('line1\nline2\nline3');
  });

  test('reads specific line range with startLine and endLine', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3\nline4\nline5');

    const result = await readFile.executor(
      { path: filePath, startLine: 2, endLine: 4 },
      { rootDir: TEST_DIR }
    );

    expect(result).toBe('line2\nline3\nline4');
  });

  test('startLine only - reads from line to end', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3\nline4\nline5');

    const result = await readFile.executor({ path: filePath, startLine: 3 }, { rootDir: TEST_DIR });

    expect(result).toBe('line3\nline4\nline5');
  });

  test('endLine only - reads from start to line', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3\nline4\nline5');

    const result = await readFile.executor({ path: filePath, endLine: 3 }, { rootDir: TEST_DIR });

    expect(result).toBe('line1\nline2\nline3');
  });

  test('handles startLine beyond file length', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt');
    fs.writeFileSync(filePath, 'line1\nline2');

    const result = await readFile.executor({ path: filePath, startLine: 100 }, { rootDir: TEST_DIR });

    expect(result).toBe('');
  });

  test('handles endLine beyond file length', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt');
    fs.writeFileSync(filePath, 'line1\nline2');

    const result = await readFile.executor({ path: filePath, endLine: 100 }, { rootDir: TEST_DIR });

    expect(result).toBe('line1\nline2');
  });

  test('handles startLine of 0 as 1', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3');

    const result = await readFile.executor(
      { path: filePath, startLine: 0, endLine: 2 },
      { rootDir: TEST_DIR }
    );

    expect(result).toBe('line1\nline2');
  });

  test('reads empty file', async () => {
    const filePath = path.join(TEST_DIR, 'empty.txt');
    fs.writeFileSync(filePath, '');

    const result = await readFile.executor({ path: filePath }, { rootDir: TEST_DIR });

    expect(result).toBe('');
  });

  test('reads file with special characters', async () => {
    const filePath = path.join(TEST_DIR, 'special.txt');
    const content = '特殊字符 émojis 🎉 symbols ©®™';
    fs.writeFileSync(filePath, content);

    const result = await readFile.executor({ path: filePath }, { rootDir: TEST_DIR });

    expect(result).toBe(content);
  });

  test('error: file not found', async () => {
    const filePath = path.join(TEST_DIR, 'nonexistent.txt');

    await expect(readFile.executor({ path: filePath }, { rootDir: TEST_DIR })).rejects.toThrow();
  });
});
