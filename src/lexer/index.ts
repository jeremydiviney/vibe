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

// Identifier must be defined first for longer_alt references
export const Identifier = token({
  name: 'Identifier',
  pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
});

export const Let = token({ name: 'Let', pattern: /let/, longer_alt: Identifier });
export const Const = token({ name: 'Const', pattern: /const/, longer_alt: Identifier });
export const Vibe = token({ name: 'Vibe', pattern: /vibe/, longer_alt: Identifier });
export const Do = token({ name: 'Do', pattern: /do/, longer_alt: Identifier });
export const Ask = token({ name: 'Ask', pattern: /ask/, longer_alt: Identifier });
export const Function = token({ name: 'Function', pattern: /function/, longer_alt: Identifier });
export const Return = token({ name: 'Return', pattern: /return/, longer_alt: Identifier });
export const If = token({ name: 'If', pattern: /if/, longer_alt: Identifier });
export const Else = token({ name: 'Else', pattern: /else/, longer_alt: Identifier });
export const Break = token({ name: 'Break', pattern: /break/, longer_alt: Identifier });
export const Continue = token({ name: 'Continue', pattern: /continue/, longer_alt: Identifier });
export const True = token({ name: 'True', pattern: /true/, longer_alt: Identifier });
export const False = token({ name: 'False', pattern: /false/, longer_alt: Identifier });
export const Model = token({ name: 'Model', pattern: /model/, longer_alt: Identifier });
export const Default = token({ name: 'Default', pattern: /default/, longer_alt: Identifier });
export const Local = token({ name: 'Local', pattern: /local/, longer_alt: Identifier });
export const Import = token({ name: 'Import', pattern: /import/, longer_alt: Identifier });
export const Export = token({ name: 'Export', pattern: /export/, longer_alt: Identifier });
export const From = token({ name: 'From', pattern: /from/, longer_alt: Identifier });

// TsBlock pattern function: Captures entire ts(params) { body }
// Defined separately to avoid initialization issues
function matchTsBlock(text: string, startOffset: number): RegExpExecArray | null {
  // Must start with 'ts'
  if (text.slice(startOffset, startOffset + 2) !== 'ts') return null;

  // Check it's not part of a longer identifier
  const nextChar = text[startOffset + 2];
  if (nextChar && /[a-zA-Z0-9_]/.test(nextChar)) return null;

  let i = startOffset + 2;

  // Skip whitespace
  while (i < text.length && /\s/.test(text[i])) i++;

  // Must have '('
  if (text[i] !== '(') return null;
  i++;

  // Find matching ')'
  let parenDepth = 1;
  while (i < text.length && parenDepth > 0) {
    if (text[i] === '(') parenDepth++;
    else if (text[i] === ')') parenDepth--;
    i++;
  }
  if (parenDepth !== 0) return null;

  // Skip whitespace
  while (i < text.length && /\s/.test(text[i])) i++;

  // Must have '{'
  if (text[i] !== '{') return null;
  i++;

  // Find matching '}' with balanced brace counting
  // Handle strings and comments to avoid false matches
  let braceDepth = 1;
  while (i < text.length && braceDepth > 0) {
    const char = text[i];

    // Handle string literals
    if (char === '"' || char === "'") {
      const quote = char;
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') i++; // Skip escaped char
        i++;
      }
    }
    // Handle template literals
    else if (char === '`') {
      i++;
      while (i < text.length && text[i] !== '`') {
        if (text[i] === '\\') i++;
        i++;
      }
    }
    // Handle line comments
    else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    }
    // Handle block comments
    else if (char === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++; // Skip the '/'
    }
    // Handle braces
    else if (char === '{') braceDepth++;
    else if (char === '}') braceDepth--;

    i++;
  }

  if (braceDepth !== 0) return null;

  // Create a fake RegExpExecArray
  const match = text.slice(startOffset, i);
  const result = [match] as RegExpExecArray;
  result.index = startOffset;
  result.input = text;
  return result;
}

// TsBlock: Captures entire ts(params) { body } as a single token
export const TsBlock = createToken({
  name: 'TsBlock',
  pattern: matchTsBlock,
  line_breaks: true,
  start_chars_hint: ['t'],  // TsBlock always starts with 't' (from 'ts')
});

// Type keywords
export const TextType = token({ name: 'TextType', pattern: /text/, longer_alt: Identifier });
export const JsonType = token({ name: 'JsonType', pattern: /json/, longer_alt: Identifier });
export const PromptType = token({ name: 'PromptType', pattern: /prompt/, longer_alt: Identifier });
export const BooleanType = token({ name: 'BooleanType', pattern: /boolean/, longer_alt: Identifier });

// ============================================================================
// Literals
// ============================================================================

export const StringLiteral = token({
  name: 'StringLiteral',
  pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/,
});

export const TemplateLiteral = token({
  name: 'TemplateLiteral',
  pattern: /`(?:[^`\\]|\\.|\r?\n)*`/,
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
export const LBracket = token({ name: 'LBracket', pattern: /\[/ });
export const RBracket = token({ name: 'RBracket', pattern: /\]/ });
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
  Ask,
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
  Import,
  Export,
  From,
  TsBlock,  // Must be before Identifier - captures entire ts(...) { ... }
  TextType,
  JsonType,
  PromptType,
  BooleanType,

  // Literals
  StringLiteral,
  TemplateLiteral,

  // Identifier after keywords
  Identifier,

  // Operators
  Equals,

  // Delimiters
  LParen,
  RParen,
  LBrace,
  RBrace,
  LBracket,
  RBracket,
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
