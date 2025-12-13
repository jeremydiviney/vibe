import { createToken, Lexer, ITokenConfig } from 'chevrotain';
import { LexerError } from '../errors';

// Helper to create tokens
function token(config: ITokenConfig) {
  return createToken(config);
}

// ============================================================================
// Whitespace & Comments (skipped)
// ============================================================================

export const WhiteSpace = token({
  name: 'WhiteSpace',
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

export const LineComment = token({
  name: 'LineComment',
  pattern: /\/\/[^\n]*/,
  group: Lexer.SKIPPED,
});

export const BlockComment = token({
  name: 'BlockComment',
  pattern: /\/\*[\s\S]*?\*\//,
  group: Lexer.SKIPPED,
});

// ============================================================================
// Keywords (must come before Identifier)
// ============================================================================

export const Let = token({ name: 'Let', pattern: /let/ });
export const Const = token({ name: 'Const', pattern: /const/ });
export const Vibe = token({ name: 'Vibe', pattern: /vibe/ });
export const Do = token({ name: 'Do', pattern: /do/ });
export const Function = token({ name: 'Function', pattern: /function/ });
export const Return = token({ name: 'Return', pattern: /return/ });
export const If = token({ name: 'If', pattern: /if/ });
export const Else = token({ name: 'Else', pattern: /else/ });
export const Break = token({ name: 'Break', pattern: /break/ });
export const Continue = token({ name: 'Continue', pattern: /continue/ });
export const True = token({ name: 'True', pattern: /true/ });
export const False = token({ name: 'False', pattern: /false/ });
export const Model = token({ name: 'Model', pattern: /model/ });
export const Default = token({ name: 'Default', pattern: /default/ });
export const Local = token({ name: 'Local', pattern: /local/ });

// ============================================================================
// Literals
// ============================================================================

export const StringLiteral = token({
  name: 'StringLiteral',
  pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/,
});

// Identifier must come after keywords
export const Identifier = token({
  name: 'Identifier',
  pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
});

// ============================================================================
// Operators
// ============================================================================

export const Equals = token({ name: 'Equals', pattern: /=/ });

// ============================================================================
// Delimiters
// ============================================================================

export const LParen = token({ name: 'LParen', pattern: /\(/ });
export const RParen = token({ name: 'RParen', pattern: /\)/ });
export const LBrace = token({ name: 'LBrace', pattern: /\{/ });
export const RBrace = token({ name: 'RBrace', pattern: /\}/ });
export const Comma = token({ name: 'Comma', pattern: /,/ });
export const Colon = token({ name: 'Colon', pattern: /:/ });

// ============================================================================
// All tokens in order (order matters for matching!)
// ============================================================================

export const allTokens = [
  // Whitespace & comments first
  WhiteSpace,
  LineComment,
  BlockComment,

  // Keywords before Identifier
  Let,
  Const,
  Vibe,
  Do,
  Function,
  Return,
  If,
  Else,
  Break,
  Continue,
  True,
  False,
  Model,
  Default,
  Local,

  // Literals
  StringLiteral,

  // Identifier after keywords
  Identifier,

  // Operators
  Equals,

  // Delimiters
  LParen,
  RParen,
  LBrace,
  RBrace,
  Comma,
  Colon,
];

// ============================================================================
// Create the Lexer instance
// ============================================================================

export const VibeLexer = new Lexer(allTokens, {
  ensureOptimizations: true,
});

// Helper function to tokenize source code
export function tokenize(source: string) {
  const result = VibeLexer.tokenize(source);

  if (result.errors.length > 0) {
    const error = result.errors[0];
    throw new LexerError(
      error.message,
      { line: error.line ?? 1, column: error.column ?? 1 },
      source
    );
  }

  return result.tokens;
}
