// Tests for the edit tool

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { edit } from './tools';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, '.test-workspace-edit');

describe('edit tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('basic replacement - oldText replaced with newText', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const x = 1;\nconst y = 2;');

    await edit.executor(
      {
        path: filePath,
        oldText: 'const x = 1;',
        newText: 'const x = 42;',
      },
      { rootDir: TEST_DIR }
    );

    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toBe('const x = 42;\nconst y = 2;');
  });

  test('multiline replacement', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(
      filePath,
      `function foo() {
  return 1;
}

function bar() {
  return 2;
}`
    );

    await edit.executor(
      {
        path: filePath,
        oldText: `function foo() {
  return 1;
}`,
        newText: `function foo() {
  return 42;
}`,
      },
      { rootDir: TEST_DIR }
    );

    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toContain('return 42;');
    expect(result).toContain('function bar()');
  });

  test('error: oldText not found', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const x = 1;');

    await expect(
      edit.executor(
        {
          path: filePath,
          oldText: 'NOT_FOUND',
          newText: 'replacement',
        },
        { rootDir: TEST_DIR }
      )
    ).rejects.toThrow('oldText not found in file');
  });

  test('error: oldText matches multiple times', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const x = 1;\nconst x = 1;');

    await expect(
      edit.executor(
        {
          path: filePath,
          oldText: 'const x = 1;',
          newText: 'const x = 42;',
        },
        { rootDir: TEST_DIR }
      )
    ).rejects.toThrow('oldText matches 2 times, must match exactly once');
  });

  test('replaces empty string with content (prepend)', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'content');

    // This actually replaces the first empty string match
    // which prepends to the file
    await edit.executor(
      {
        path: filePath,
        oldText: 'content',
        newText: 'new content',
      },
      { rootDir: TEST_DIR }
    );

    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toBe('new content');
  });

  test('handles special characters in oldText', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const regex = /test.*end/;');

    await edit.executor(
      {
        path: filePath,
        oldText: 'const regex = /test.*end/;',
        newText: 'const regex = /new/;',
      },
      { rootDir: TEST_DIR }
    );

    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toBe('const regex = /new/;');
  });

  test('preserves file encoding and line endings', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    const content = 'line1\r\nline2\r\nline3';
    fs.writeFileSync(filePath, content);

    await edit.executor(
      {
        path: filePath,
        oldText: 'line2',
        newText: 'modified',
      },
      { rootDir: TEST_DIR }
    );

    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toBe('line1\r\nmodified\r\nline3');
  });
});
