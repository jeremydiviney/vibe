// Tests for stdlib tools

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { fastEdit } from './tools';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, '.test-workspace');

describe('fastEdit tool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('basic replacement - prefix...suffix replaced with newText', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(
      filePath,
      `function foo() {
  console.log("old");
  return 1;
}

function bar() {
  return 2;
}`
    );

    await fastEdit.executor(
      {
        path: filePath,
        prefix: 'function foo() {',
        suffix: 'return 1;\n}',
        newText: `function foo() {
  console.log("new");
  return 42;
}`,
      },
      { rootDir: TEST_DIR }
    );

    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toContain('console.log("new")');
    expect(result).toContain('return 42;');
    expect(result).toContain('function bar()'); // Other function unchanged
  });

  test('non-greedy matching - stops at first suffix after prefix', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    // Two functions that end with "return result;"
    fs.writeFileSync(
      filePath,
      `function first() {
  return result;
}

function second() {
  return result;
}`
    );

    await fastEdit.executor(
      {
        path: filePath,
        prefix: 'function first() {',
        suffix: 'return result;\n}',
        newText: `function first() {
  return "replaced";
}`,
      },
      { rootDir: TEST_DIR }
    );

    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toContain('return "replaced"');
    expect(result).toContain('function second()'); // Second function unchanged
    // Second function should still have original return
    expect(result).toMatch(/function second\(\) \{\s+return result;/);
  });

  test('error: prefix not found', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'const x = 1;');

    await expect(
      fastEdit.executor(
        {
          path: filePath,
          prefix: 'function notFound() {',
          suffix: '}',
          newText: 'replacement',
        },
        { rootDir: TEST_DIR }
      )
    ).rejects.toThrow('no region found matching prefix...suffix');
  });

  test('error: suffix not found after prefix', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(filePath, 'function foo() { return 1; }');

    await expect(
      fastEdit.executor(
        {
          path: filePath,
          prefix: 'function foo() {',
          suffix: 'NOT_FOUND_SUFFIX',
          newText: 'replacement',
        },
        { rootDir: TEST_DIR }
      )
    ).rejects.toThrow('no region found matching prefix...suffix');
  });

  test('error: multiple matches (ambiguous anchors)', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    // Two identical functions - ambiguous!
    fs.writeFileSync(
      filePath,
      `function foo() {
  return 1;
}

function foo() {
  return 1;
}`
    );

    await expect(
      fastEdit.executor(
        {
          path: filePath,
          prefix: 'function foo() {',
          suffix: 'return 1;\n}',
          newText: 'replacement',
        },
        { rootDir: TEST_DIR }
      )
    ).rejects.toThrow('2 regions match, must match exactly once');
  });

  test('special regex characters in prefix/suffix are escaped', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    // Content with regex special characters
    fs.writeFileSync(filePath, 'const pattern = /test.*?end/; // comment');

    await fastEdit.executor(
      {
        path: filePath,
        prefix: 'const pattern = /test.*?end/',
        suffix: '// comment',
        newText: 'const pattern = /new/; // updated',
      },
      { rootDir: TEST_DIR }
    );

    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toBe('const pattern = /new/; // updated');
  });

  test('handles multiline content correctly', async () => {
    const filePath = path.join(TEST_DIR, 'test.ts');
    fs.writeFileSync(
      filePath,
      `class MyClass {
  constructor() {
    this.value = 1;
    this.name = "test";
    this.items = [];
  }

  method() {
    return this.value;
  }
}`
    );

    await fastEdit.executor(
      {
        path: filePath,
        prefix: 'constructor() {',
        suffix: '}',
        newText: `constructor() {
    this.value = 42;
  }`,
      },
      { rootDir: TEST_DIR }
    );

    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toContain('this.value = 42');
    expect(result).not.toContain('this.name = "test"');
    expect(result).toContain('method()'); // Other method unchanged
  });
});
