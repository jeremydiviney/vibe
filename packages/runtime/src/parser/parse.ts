import { tokenize } from '../lexer';
import { vibeParser } from './index';
import { vibeAstVisitor } from './visitor';
import { setCurrentFile } from './visitor/helpers';
import { ParserError } from '../errors';
import type { Program } from '../ast';
import type { IRecognitionException, IToken } from 'chevrotain';

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
  const currentToken = error.token;
  const message = error.message;

  // Reserved word used where identifier expected
  // Detected: message mentions "Identifier" and current token is a keyword/type token (not Identifier)
  if (message.includes('Identifier') && currentToken?.image && currentToken?.tokenType?.name) {
    const tokenTypeName = currentToken.tokenType.name;
    // If parser expected Identifier but got a keyword/type token, it's a reserved word
    if (tokenTypeName !== 'Identifier') {
      const isType = tokenTypeName.endsWith('Type');
      const kind = isType ? 'reserved type name' : 'reserved keyword';
      return `Invalid identifier '${currentToken.image}' - '${currentToken.image}' is a ${kind}`;
    }
  }

  // Missing type annotation for function/tool parameter
  // Detected: in "parameter" or "toolParameter" rule, expected Colon, previous token is Identifier
  if (
    (ruleStack.includes('parameter') || ruleStack.includes('toolParameter')) &&
    message.includes('Colon') &&
    previousToken?.tokenType?.name === 'Identifier'
  ) {
    return `Missing type annotation for parameter '${previousToken.image}'`;
  }

  // Missing comma between properties in object/model declaration
  // Detected: in objectLiteral/objectLiteralExpr, expected RBrace, found Identifier
  if (
    (ruleStack.includes('objectLiteral') || ruleStack.includes('objectLiteralExpr')) &&
    message.includes('RBrace') &&
    currentToken?.tokenType?.name === 'Identifier'
  ) {
    return `Missing comma between properties. Add ',' after the previous property`;
  }

  // Missing comma between elements in array
  // Detected: in arrayLiteral, expected RBracket, found something else
  if (
    ruleStack.includes('arrayLiteral') &&
    message.includes('RBracket') &&
    currentToken?.tokenType?.name !== 'RBracket'
  ) {
    return `Missing comma between array elements. Add ',' after the previous element`;
  }

  return message;
}

interface DelimiterInfo {
  type: 'brace' | 'paren' | 'bracket';
  token: IToken;
  line: number;
  column: number;
}

/**
 * Check for unclosed or mismatched delimiters before parsing.
 * Returns a ParserError if there's a delimiter issue, null otherwise.
 */
function checkDelimiters(tokens: IToken[], source: string, file?: string): ParserError | null {
  const stack: DelimiterInfo[] = [];

  const delimiterPairs: Record<string, { open: 'brace' | 'paren' | 'bracket'; close: 'brace' | 'paren' | 'bracket' }> = {
    LBrace: { open: 'brace', close: 'brace' },
    RBrace: { open: 'brace', close: 'brace' },
    LParen: { open: 'paren', close: 'paren' },
    RParen: { open: 'paren', close: 'paren' },
    LBracket: { open: 'bracket', close: 'bracket' },
    RBracket: { open: 'bracket', close: 'bracket' },
  };

  const delimiterNames: Record<string, string> = {
    brace: 'brace',
    paren: 'parenthesis',
    bracket: 'bracket',
  };

  const openingChars: Record<string, string> = {
    brace: '{',
    paren: '(',
    bracket: '[',
  };

  const closingChars: Record<string, string> = {
    brace: '}',
    paren: ')',
    bracket: ']',
  };

  for (const token of tokens) {
    const tokenName = token.tokenType.name;

    // Opening delimiters
    if (tokenName === 'LBrace' || tokenName === 'LParen' || tokenName === 'LBracket') {
      const type = delimiterPairs[tokenName].open;
      stack.push({
        type,
        token,
        line: token.startLine ?? 1,
        column: token.startColumn ?? 1,
      });
    }
    // Closing delimiters
    else if (tokenName === 'RBrace' || tokenName === 'RParen' || tokenName === 'RBracket') {
      const expectedType = delimiterPairs[tokenName].close;

      if (stack.length === 0) {
        // Unmatched closing delimiter
        return new ParserError(
          `Unmatched closing ${delimiterNames[expectedType]} '${closingChars[expectedType]}'`,
          token.image,
          { line: token.startLine ?? 1, column: token.startColumn ?? 1, file },
          source
        );
      }

      const top = stack.pop()!;
      if (top.type !== expectedType) {
        // Mismatched delimiter - report at the closing delimiter but mention the opening
        return new ParserError(
          `Mismatched delimiters: expected closing ${delimiterNames[top.type]} '${closingChars[top.type]}' to match '${openingChars[top.type]}' at line ${top.line}, but found '${closingChars[expectedType]}'`,
          token.image,
          { line: token.startLine ?? 1, column: token.startColumn ?? 1, file },
          source
        );
      }
    }
  }

  // Check for unclosed delimiters
  if (stack.length > 0) {
    // Report the first unclosed delimiter (deepest nesting level that's unclosed)
    // We want to report the innermost unclosed one, which is the last on the stack
    const unclosed = stack[stack.length - 1];
    return new ParserError(
      `Unclosed ${delimiterNames[unclosed.type]} '${openingChars[unclosed.type]}' - missing '${closingChars[unclosed.type]}'`,
      openingChars[unclosed.type],
      { line: unclosed.line, column: unclosed.column, file },
      source
    );
  }

  return null;
}

/**
 * Parse a Vibe source code string into an AST
 */
export function parse(source: string, options?: ParseOptions): Program {
  // Set current file for location tracking
  setCurrentFile(options?.file);

  // Tokenize
  const tokens = tokenize(source);

  // Check for unclosed/mismatched delimiters first
  // This provides better error messages than the parser for delimiter issues
  const delimiterError = checkDelimiters(tokens, source, options?.file);
  if (delimiterError) {
    throw delimiterError;
  }

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
