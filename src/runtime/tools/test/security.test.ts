import { describe, expect, test } from 'bun:test';
import { validatePathInSandbox } from '../security';
import { resolve, normalize } from 'path';

describe('Path Sandboxing', () => {
  const rootDir = process.platform === 'win32'
    ? 'C:\\projects\\myapp'
    : '/projects/myapp';

  describe('validatePathInSandbox', () => {
    test('allows paths within the root directory', () => {
      const result = validatePathInSandbox('src/index.ts', rootDir);
      expect(result).toBe(normalize(resolve(rootDir, 'src/index.ts')));
    });

    test('allows nested paths within the root', () => {
      const result = validatePathInSandbox('src/components/Button.tsx', rootDir);
      expect(result).toBe(normalize(resolve(rootDir, 'src/components/Button.tsx')));
    });

    test('allows the root directory itself', () => {
      const result = validatePathInSandbox('.', rootDir);
      expect(result).toBe(normalize(rootDir));
    });

    test('allows empty relative path (current directory)', () => {
      const result = validatePathInSandbox('', rootDir);
      expect(result).toBe(normalize(rootDir));
    });

    test('normalizes paths with redundant segments', () => {
      const result = validatePathInSandbox('src/../src/index.ts', rootDir);
      expect(result).toBe(normalize(resolve(rootDir, 'src/index.ts')));
    });

    test('blocks path traversal with ../', () => {
      expect(() => validatePathInSandbox('../other-project', rootDir))
        .toThrow("Path '../other-project' is outside the allowed directory");
    });

    test('blocks path traversal with multiple ../..', () => {
      expect(() => validatePathInSandbox('../../etc/passwd', rootDir))
        .toThrow("Path '../../etc/passwd' is outside the allowed directory");
    });

    test('blocks path traversal hidden in middle of path', () => {
      expect(() => validatePathInSandbox('src/../../other-project/file.ts', rootDir))
        .toThrow("is outside the allowed directory");
    });

    test('blocks absolute paths outside root', () => {
      const outsidePath = process.platform === 'win32'
        ? 'C:\\other\\file.txt'
        : '/etc/passwd';
      expect(() => validatePathInSandbox(outsidePath, rootDir))
        .toThrow('is outside the allowed directory');
    });

    test('allows absolute paths within root', () => {
      const absoluteInsidePath = process.platform === 'win32'
        ? 'C:\\projects\\myapp\\src\\file.ts'
        : '/projects/myapp/src/file.ts';
      const result = validatePathInSandbox(absoluteInsidePath, rootDir);
      expect(result).toBe(normalize(absoluteInsidePath));
    });

    test('prevents directory prefix attacks (e.g., /rootbar vs /root)', () => {
      // Trying to access a sibling directory with a similar prefix
      const attackPath = process.platform === 'win32'
        ? 'C:\\projects\\myappevil\\secret.txt'
        : '/projects/myappevil/secret.txt';
      expect(() => validatePathInSandbox(attackPath, rootDir))
        .toThrow('is outside the allowed directory');
    });

    test('handles paths with backslashes on Windows-style input', () => {
      const result = validatePathInSandbox('src\\components\\file.ts', rootDir);
      expect(result).toBe(normalize(resolve(rootDir, 'src/components/file.ts')));
    });

    test('handles paths with mixed slashes', () => {
      const result = validatePathInSandbox('src/components\\file.ts', rootDir);
      expect(result).toBe(normalize(resolve(rootDir, 'src/components/file.ts')));
    });
  });
});
