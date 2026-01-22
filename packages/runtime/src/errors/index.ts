// Source location for error reporting
export interface SourceLocation {
  line: number;
  column: number;
  file?: string;
}

export interface SourceSpan {
  start: SourceLocation;
  end: SourceLocation;
}

// Base error class for all Vibe errors
export class VibeError extends Error {
  constructor(
    message: string,
    public location?: SourceLocation,
    public source?: string
  ) {
    super(message);
    this.name = 'VibeError';
  }

  format(): string {
    if (!this.location) {
      return `${this.name}: ${this.message}`;
    }

    const loc = `[${this.location.file ?? 'vibe'}:${this.location.line}:${this.location.column}]`;
    let result = `${this.name}: ${loc} ${this.message}`;

    // Add source context if available
    if (this.source) {
      const lines = this.source.split('\n');
      const line = lines[this.location.line - 1];
      if (line) {
        result += `\n\n  ${this.location.line} | ${line}`;
        result += `\n    ${' '.repeat(String(this.location.line).length)} | ${' '.repeat(this.location.column - 1)}^`;
      }
    }

    return result;
  }
}

// Lexer errors
export class LexerError extends VibeError {
  constructor(message: string, location?: SourceLocation, source?: string) {
    super(message, location, source);
    this.name = 'LexerError';
  }
}

// Parser errors
export class ParserError extends VibeError {
  constructor(
    message: string,
    public tokenValue?: string,
    location?: SourceLocation,
    source?: string
  ) {
    super(message, location, source);
    this.name = 'ParserError';
  }
}

// Runtime errors
export class RuntimeError extends VibeError {
  constructor(
    message: string,
    location?: SourceLocation,
    source?: string,
    public context?: Record<string, unknown>
  ) {
    super(message, location, source);
    this.name = 'RuntimeError';
  }
}

// Type errors
export class TypeError extends VibeError {
  constructor(
    message: string,
    public expected?: string,
    public received?: string,
    location?: SourceLocation,
    source?: string
  ) {
    super(message, location, source);
    this.name = 'TypeError';
  }
}

// Reference errors (undefined variables)
export class ReferenceError extends VibeError {
  constructor(
    public variableName: string,
    location?: SourceLocation,
    source?: string
  ) {
    super(`Undefined variable '${variableName}'`, location, source);
    this.name = 'ReferenceError';
  }
}

// Assignment errors (const reassignment)
export class AssignmentError extends VibeError {
  constructor(
    public variableName: string,
    location?: SourceLocation,
    source?: string
  ) {
    super(`Cannot reassign constant '${variableName}'`, location, source);
    this.name = 'AssignmentError';
  }
}

// Semantic errors (type checking, scope validation)
export class SemanticError extends VibeError {
  constructor(message: string, location?: SourceLocation, source?: string) {
    super(message, location, source);
    this.name = 'SemanticError';
  }
}
