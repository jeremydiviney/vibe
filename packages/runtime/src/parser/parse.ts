import { tokenize } from '../lexer';
import { vibeParser } from './index';
import { vibeAstVisitor } from './visitor';
import { setCurrentFile } from './visitor/helpers';
import { ParserError } from '../errors';
import type { Program } from '../ast';

export interface ParseOptions {
  /** File path to include in source locations (for error reporting) */
  file?: string;
}

/**
 * Parse a Vibe source code string into an AST
 */
export function parse(source: string, options?: ParseOptions): Program {
  // Set current file for location tracking
  setCurrentFile(options?.file);

  // Tokenize
  const tokens = tokenize(source);

  // Parse to CST
  vibeParser.input = tokens;
  const cst = vibeParser.program();

  // Check for parse errors
  if (vibeParser.errors.length > 0) {
    const error = vibeParser.errors[0];
    throw new ParserError(
      error.message,
      error.token.image,
      { line: error.token.startLine ?? 1, column: error.token.startColumn ?? 1, file: options?.file },
      source
    );
  }

  // Transform CST to AST
  const ast = vibeAstVisitor.visit(cst);

  // Clear current file after parsing
  setCurrentFile(undefined);

  return ast;
}
