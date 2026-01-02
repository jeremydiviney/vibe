import { resolve, normalize } from 'path';

/**
 * Validates that a path is within the allowed root directory.
 * Throws an error if the path escapes the sandbox.
 *
 * @param inputPath - The path to validate (can be relative or absolute)
 * @param rootDir - The root directory that acts as the sandbox
 * @returns The normalized absolute path within the sandbox
 * @throws Error if the path is outside the allowed directory
 */
export function validatePathInSandbox(inputPath: string, rootDir: string): string {
  // Resolve the path relative to the root directory
  const resolved = resolve(rootDir, inputPath);
  const normalized = normalize(resolved);
  const normalizedRoot = normalize(rootDir);

  // Ensure the resolved path starts with the root directory
  // Add path separator to prevent partial matches (e.g., /foo vs /foobar)
  const rootWithSep = normalizedRoot.endsWith('/') || normalizedRoot.endsWith('\\')
    ? normalizedRoot
    : normalizedRoot + (process.platform === 'win32' ? '\\' : '/');

  const pathWithSep = normalized.endsWith('/') || normalized.endsWith('\\')
    ? normalized
    : normalized + (process.platform === 'win32' ? '\\' : '/');

  // Check if the path is exactly the root or starts with root + separator
  const isWithinRoot = normalized === normalizedRoot || pathWithSep.startsWith(rootWithSep);

  if (!isWithinRoot) {
    throw new Error(`Path '${inputPath}' is outside the allowed directory`);
  }

  return normalized;
}
