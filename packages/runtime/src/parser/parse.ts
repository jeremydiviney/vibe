import { tokenize } from '../lexer';
import { vibeParser } from './index';
import { vibeAstVisitor } from './visitor';
import { setCurrentFile } from './visitor/helpers';
import { ParserError } from '../errors';
import type { Program } from '../ast';
import type { IRecognitionException } from 'chevrotain';

export interface ParseOptions {
  /** File path to include in source locations (for error reporting) */
  file?: string;
}

/**
 * Transform Chevrotain errors into user-friendly messages
 */
function improveErrorMessage(error: IRecognitionException): string {
  const ruleStack = error.context?.ruleStack ?? [];
  const previousToken = error.previousToken;
  const message = error.message;

  // Missing type annotation for function/tool parameter
  // Detected: in "parameter" or "toolParameter" rule, expected Colon, previous token is Identifier
  if (
    (ruleStack.includes('parameter') || ruleStack.includes('toolParameter')) &&
    message.includes('Colon') &&
    previousToken?.tokenType?.name === 'Identifier'
  ) {
    return `Missing type annotation for parameter '${previousToken.image}'`;
  }

  return message;
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
      improveErrorMessage(error),
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
