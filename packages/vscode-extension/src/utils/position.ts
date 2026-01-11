import { Position, Location, Range } from 'vscode-languageserver/node';

/**
 * Position conversion utilities between LSP (0-based) and Parser (1-based)
 */

// Parser location type
export interface ParserLocation {
  line: number;   // 1-based
  column: number; // 1-based
}

/**
 * Convert LSP 0-based position to parser 1-based position
 */
export function toParserPosition(lspPosition: Position): ParserLocation {
  return {
    line: lspPosition.line + 1,
    column: lspPosition.character + 1,
  };
}

/**
 * Convert parser 1-based location to LSP 0-based position
 */
export function toLspPosition(parserLocation: ParserLocation): Position {
  return {
    line: parserLocation.line - 1,
    character: parserLocation.column - 1,
  };
}

/**
 * Create an LSP Range from parser location and identifier name
 */
export function createRange(parserLocation: ParserLocation, name: string): Range {
  const startChar = parserLocation.column - 1;
  return {
    start: { line: parserLocation.line - 1, character: startChar },
    end: { line: parserLocation.line - 1, character: startChar + name.length },
  };
}

/**
 * Create an LSP Range with a keyword offset (for declarations where location points to keyword)
 */
export function createRangeWithOffset(
  parserLocation: ParserLocation,
  name: string,
  keywordOffset: number
): Range {
  const startChar = parserLocation.column - 1 + keywordOffset;
  return {
    start: { line: parserLocation.line - 1, character: startChar },
    end: { line: parserLocation.line - 1, character: startChar + name.length },
  };
}

/**
 * Create an LSP Location from parser location and identifier name
 */
export function createLocation(
  uri: string,
  parserLocation: ParserLocation,
  name: string
): Location {
  return {
    uri,
    range: createRange(parserLocation, name),
  };
}

/**
 * Create an LSP Location with a keyword offset
 */
export function createLocationWithOffset(
  uri: string,
  parserLocation: ParserLocation,
  name: string,
  keywordOffset: number
): Location {
  return {
    uri,
    range: createRangeWithOffset(parserLocation, name, keywordOffset),
  };
}

/**
 * Keyword lengths for calculating name position from declaration location
 * Declaration locations point to the keyword, not the name
 */
export const KEYWORD_OFFSETS: Record<string, number> = {
  function: 9,  // "function "
  tool: 5,      // "tool "
  model: 6,     // "model "
  let: 4,       // "let "
  const: 6,     // "const "
  for: 4,       // "for "
};

/**
 * Get the offset to add to a declaration's location to get to the name
 */
export function getKeywordOffset(keyword: string): number {
  return KEYWORD_OFFSETS[keyword] ?? 0;
}
