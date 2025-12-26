// TypeScript evaluation with caching
// Uses AsyncFunction constructor to compile and execute TypeScript code

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
    public readonly originalError: Error
  ) {
    super(message);
    this.name = 'TsBlockError';
  }
}

// Evaluate a TypeScript block
export async function evalTsBlock(
  params: string[],
  body: string,
  paramValues: unknown[]
): Promise<unknown> {
  const cacheKey = getCacheKey(params, body);

  // Get or compile function
  let fn = functionCache.get(cacheKey);
  if (!fn) {
    try {
      fn = new AsyncFunction(...params, body);
      functionCache.set(cacheKey, fn);
    } catch (error) {
      // Syntax error in TS block
      const snippet = body.length > 50 ? body.slice(0, 50) + '...' : body;
      throw new TsBlockError(
        `ts block compilation error: ${error instanceof Error ? error.message : String(error)}\n  Code: ${snippet}`,
        params,
        body,
        error instanceof Error ? error : new Error(String(error))
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
      error instanceof Error ? error : new Error(String(error))
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
