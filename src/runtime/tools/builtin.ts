import type { RegisteredTool } from './types';
import { fileTools } from './file-tools';
import { searchTools } from './search-tools';
import { directoryTools } from './directory-tools';
import { utilityTools } from './utility-tools';

/**
 * Standard tools available in the Vibe runtime.
 * Combines all tool categories into a single array.
 *
 * Categories:
 * - File operations: readFile, writeFile, appendFile, fileExists, listDir, edit
 * - File search: glob, grep
 * - Directory operations: mkdir, dirExists
 * - Utilities: env, sleep, now, jsonParse, jsonStringify, print, random, uuid
 *
 * Total: 18 tools
 */
export const standardTools: RegisteredTool[] = [
  ...fileTools,
  ...searchTools,
  ...directoryTools,
  ...utilityTools,
];

/** @deprecated Use standardTools instead */
export const builtinTools = standardTools;
