// Language reference loader for AI context
// Loads and caches the Vibe language reference document

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

let cachedLanguageRef: string | null = null;

/**
 * Get the Vibe language reference document content.
 * Cached after first load.
 */
export function getLanguageReference(): string {
  if (cachedLanguageRef !== null) {
    return cachedLanguageRef;
  }

  try {
    // Navigate from src/runtime/ai/ to docs/
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const docsPath = join(currentDir, '..', '..', '..', 'docs', 'language-reference.md');
    cachedLanguageRef = readFileSync(docsPath, 'utf-8');
    return cachedLanguageRef;
  } catch {
    // If file not found (e.g., in bundled distribution), return empty
    cachedLanguageRef = '';
    return cachedLanguageRef;
  }
}

/**
 * Clear the cached language reference.
 * Useful for testing.
 */
export function clearLanguageRefCache(): void {
  cachedLanguageRef = null;
}
