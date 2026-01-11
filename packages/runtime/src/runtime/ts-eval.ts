// TypeScript evaluation with caching
// Uses AsyncFunction constructor to compile and execute TypeScript code

import type { SourceLocation } from '../errors';

// Cache compiled functions by signature (params + body)
const functionCache = new Map<string, (...args: unknown[]) => Promise<unknown>>();

// Get the AsyncFunction constructor
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

// Generate cache key from params and body
function getCacheKey(params: string[], body: string): string {
  return `${params.join(',')}::${body}`;
}

// Custom error for TS block failures
export class TsBlockError extends Error {
  constructor(
    message: string,
    public readonly params: string[],
    public readonly body: string,
    public readonly originalError: Error,
    public readonly location?: SourceLocation
  ) {
    super(message);
    this.name = 'TsBlockError';
  }

  // Format error with source location and original stack trace
  format(): string {
    let result = '';

    // Add Vibe source location if available
    if (this.location) {
      const loc = `[${this.location.file ?? 'vibe'}:${this.location.line}:${this.location.column}]`;
      result = `${loc} `;
    }

    result += this.message;

    // Add original TypeScript stack trace for debugging
    if (this.originalError.stack) {
      result += `\n\nTypeScript stack trace:\n${this.originalError.stack}`;
    }

    return result;
  }
}

// Evaluate a TypeScript block
export async function evalTsBlock(
  params: string[],
  body: string,
  paramValues: unknown[],
  location?: SourceLocation
): Promise<unknown> {
  const cacheKey = getCacheKey(params, body);

  // Get or compile function
  let fn = functionCache.get(cacheKey);
  if (!fn) {
    try {
      // Prepend 'use strict' to ensure frozen object mutations throw errors
      const strictBody = `'use strict';\n${body}`;
      fn = new AsyncFunction(...params, strictBody);
      functionCache.set(cacheKey, fn);
    } catch (error) {
      // Syntax error in TS block
      const snippet = body.length > 50 ? body.slice(0, 50) + '...' : body;
      throw new TsBlockError(
        `ts block compilation error: ${error instanceof Error ? error.message : String(error)}\n  Code: ${snippet}`,
        params,
        body,
        error instanceof Error ? error : new Error(String(error)),
        location
      );
    }
  }

  // Call with parameter values
  try {
    return await fn(...paramValues);
  } catch (error) {
    // Runtime error in TS block
    const snippet = body.length > 50 ? body.slice(0, 50) + '...' : body;
    throw new TsBlockError(
      `ts block runtime error: ${error instanceof Error ? error.message : String(error)}\n  Code: ${snippet}`,
      params,
      body,
      error instanceof Error ? error : new Error(String(error)),
      location
    );
  }
}

// Validate return type against expected type annotation
export function validateReturnType(
  value: unknown,
  expectedType: string | null,
  varName: string
): void {
  if (!expectedType) return; // No type annotation, accept anything

  if (expectedType === 'text' && typeof value !== 'string') {
    throw new TypeError(`Variable '${varName}': expected text, got ${typeof value}`);
  }

  if (expectedType === 'json') {
    if (typeof value !== 'object' || value === null) {
      throw new TypeError(`Variable '${varName}': expected json (object/array), got ${typeof value}`);
    }
  }
}

// Clear the function cache (useful for testing)
export function clearFunctionCache(): void {
  functionCache.clear();
}

// Get cache size (useful for testing)
export function getFunctionCacheSize(): number {
  return functionCache.size;
}
