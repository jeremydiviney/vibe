/**
 * TS Import Tracker
 * Tracks imported TypeScript functions for debugging
 */

import type { SourceLocation } from '../errors';

// Imported TS function info
export interface TsImportInfo {
  // The name used in Vibe code
  vibeName: string;
  // The .ts file path
  tsFile: string;
  // The original function name in the TS file
  tsFunctionName: string;
  // The .vibe file that imported it
  importedBy: string;
  // Line in .vibe file where import statement is
  importLine: number;
  // Whether we've resolved the entry point line in the TS file
  entryLine?: number;
}

// Registry of imported TS functions
const tsImports = new Map<string, TsImportInfo>();

// Temporary breakpoints set for stepping into TS
const tempBreakpoints = new Map<string, string>(); // tsFile:line -> breakpointId

/**
 * Register an imported TS function
 */
export function registerTsImport(
  vibeName: string,
  tsFile: string,
  tsFunctionName: string,
  importedBy: string,
  importLine: number
): void {
  const key = `${importedBy}:${vibeName}`;
  tsImports.set(key, {
    vibeName,
    tsFile,
    tsFunctionName,
    importedBy,
    importLine,
  });
}

/**
 * Get info about an imported TS function
 */
export function getTsImportInfo(vibeFile: string, functionName: string): TsImportInfo | undefined {
  const key = `${vibeFile}:${functionName}`;
  return tsImports.get(key);
}

/**
 * Check if a function call targets an imported TS function
 */
export function isTsImportCall(vibeFile: string, functionName: string): boolean {
  const key = `${vibeFile}:${functionName}`;
  return tsImports.has(key);
}

/**
 * Set the entry line for a TS function (once resolved by Bun inspector)
 */
export function setTsImportEntryLine(
  vibeFile: string,
  functionName: string,
  entryLine: number
): void {
  const key = `${vibeFile}:${functionName}`;
  const info = tsImports.get(key);
  if (info) {
    info.entryLine = entryLine;
  }
}

/**
 * Register a temporary breakpoint for stepping into TS
 */
export function registerTempBreakpoint(
  tsFile: string,
  line: number,
  breakpointId: string
): void {
  const key = `${tsFile}:${line}`;
  tempBreakpoints.set(key, breakpointId);
}

/**
 * Get and remove a temporary breakpoint
 */
export function popTempBreakpoint(tsFile: string, line: number): string | undefined {
  const key = `${tsFile}:${line}`;
  const id = tempBreakpoints.get(key);
  if (id) {
    tempBreakpoints.delete(key);
  }
  return id;
}

/**
 * Clear all temporary breakpoints
 */
export function clearTempBreakpoints(): Map<string, string> {
  const all = new Map(tempBreakpoints);
  tempBreakpoints.clear();
  return all;
}

/**
 * Get all registered TS imports
 */
export function getAllTsImports(): TsImportInfo[] {
  return Array.from(tsImports.values());
}

/**
 * Get TS imports for a specific Vibe file
 */
export function getTsImportsForFile(vibeFile: string): TsImportInfo[] {
  return Array.from(tsImports.values()).filter(info => info.importedBy === vibeFile);
}

/**
 * Clear all TS import registrations (for testing)
 */
export function clearTsImports(): void {
  tsImports.clear();
  tempBreakpoints.clear();
}

/**
 * Build a unique identifier for a TS function entry point
 * Used to match breakpoint hits
 */
export function buildTsEntryPointId(tsFile: string, functionName: string): string {
  return `ts:${tsFile}:${functionName}`;
}

/**
 * Parse a TS entry point ID
 */
export function parseTsEntryPointId(id: string): { tsFile: string; functionName: string } | null {
  const match = id.match(/^ts:(.+):([^:]+)$/);
  if (!match) return null;
  return { tsFile: match[1], functionName: match[2] };
}
