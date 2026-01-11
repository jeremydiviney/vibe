/**
 * TS Block Source Mapping
 * Maps TypeScript block code to locations within .vibe files
 */

import type { SourceLocation } from '../errors';

// Mapping from generated TS code to original .vibe location
export interface TsBlockMapping {
  // The .vibe file containing the ts block
  vibeFile: string;
  // Line in .vibe file where ts block starts
  vibeStartLine: number;
  // Column in .vibe file where ts block starts
  vibeStartColumn: number;
  // The ts block body (for matching)
  tsBody: string;
  // Parameters passed to the ts block
  params: string[];
  // Generated script ID (assigned by Bun inspector)
  scriptId?: string;
}

// Registry of all TS block mappings
const tsBlockMappings = new Map<string, TsBlockMapping>();

// Counter for generating unique IDs
let mappingIdCounter = 0;

/**
 * Register a TS block for debugging
 * Returns a unique ID for this TS block
 */
export function registerTsBlock(
  vibeFile: string,
  vibeLocation: SourceLocation,
  tsBody: string,
  params: string[]
): string {
  const id = `ts_block_${++mappingIdCounter}`;

  tsBlockMappings.set(id, {
    vibeFile,
    vibeStartLine: vibeLocation.line,
    vibeStartColumn: vibeLocation.column,
    tsBody,
    params,
  });

  return id;
}

/**
 * Get mapping for a TS block by ID
 */
export function getTsBlockMapping(id: string): TsBlockMapping | undefined {
  return tsBlockMappings.get(id);
}

/**
 * Find TS block mapping by script ID (assigned by Bun inspector)
 */
export function findMappingByScriptId(scriptId: string): TsBlockMapping | undefined {
  for (const mapping of tsBlockMappings.values()) {
    if (mapping.scriptId === scriptId) {
      return mapping;
    }
  }
  return undefined;
}

/**
 * Associate a script ID with a TS block mapping
 */
export function setScriptId(mappingId: string, scriptId: string): void {
  const mapping = tsBlockMappings.get(mappingId);
  if (mapping) {
    mapping.scriptId = scriptId;
  }
}

/**
 * Convert a location within generated TS code to the original .vibe location
 */
export function mapTsLocationToVibe(
  mapping: TsBlockMapping,
  tsLine: number,
  tsColumn: number
): SourceLocation {
  // The first line of the TS block body corresponds to vibeStartLine
  // We add the line offset (tsLine - 1 since TS lines are 0-based in inspector)
  // Note: We subtract 1 for the 'use strict' line we prepend
  const lineOffset = Math.max(0, tsLine - 1);

  return {
    file: mapping.vibeFile,
    line: mapping.vibeStartLine + lineOffset,
    column: lineOffset === 0 ? mapping.vibeStartColumn + tsColumn : tsColumn,
  };
}

/**
 * Convert a .vibe location to a location within a TS block
 */
export function mapVibeLocationToTs(
  mapping: TsBlockMapping,
  vibeLine: number,
  vibeColumn: number
): { line: number; column: number } | null {
  // Check if this location is within the TS block
  const tsBlockLines = mapping.tsBody.split('\n').length;
  const lineOffset = vibeLine - mapping.vibeStartLine;

  if (lineOffset < 0 || lineOffset >= tsBlockLines) {
    return null; // Location is outside this TS block
  }

  // Add 1 for the 'use strict' line we prepend
  return {
    line: lineOffset + 1,
    column: lineOffset === 0 ? Math.max(0, vibeColumn - mapping.vibeStartColumn) : vibeColumn,
  };
}

/**
 * Check if a .vibe location is within a TS block
 */
export function isLocationInTsBlock(
  vibeFile: string,
  vibeLine: number
): TsBlockMapping | null {
  for (const mapping of tsBlockMappings.values()) {
    if (mapping.vibeFile !== vibeFile) continue;

    const tsBlockLines = mapping.tsBody.split('\n').length;
    const endLine = mapping.vibeStartLine + tsBlockLines - 1;

    if (vibeLine >= mapping.vibeStartLine && vibeLine <= endLine) {
      return mapping;
    }
  }
  return null;
}

/**
 * Get all TS block mappings for a file
 */
export function getMappingsForFile(vibeFile: string): TsBlockMapping[] {
  const mappings: TsBlockMapping[] = [];
  for (const mapping of tsBlockMappings.values()) {
    if (mapping.vibeFile === vibeFile) {
      mappings.push(mapping);
    }
  }
  return mappings;
}

/**
 * Clear all mappings (useful for testing)
 */
export function clearTsBlockMappings(): void {
  tsBlockMappings.clear();
  mappingIdCounter = 0;
}

/**
 * Get all registered mappings (for debugging)
 */
export function getAllMappings(): Map<string, TsBlockMapping> {
  return new Map(tsBlockMappings);
}
