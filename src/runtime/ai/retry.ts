// Retry utilities for AI operations

import { AIError, type RetryOptions } from './types';

/**
 * Check if an error is retryable (5xx, 429, or network error).
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AIError) {
    return error.isRetryable;
  }

  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Check for status codes
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network-related errors
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for exponential backoff with jitter.
 * Formula: min(maxDelay, baseDelay * 2^attempt) * (0.5 + random(0.5))
 */
export function calculateDelay(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 30000
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter: 50% to 100% of the delay
  const jitter = 0.5 + Math.random() * 0.5;
  return Math.floor(cappedDelay * jitter);
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic.
 * Retries on 5xx, 429, and network errors with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, baseDelayMs = 1000, maxDelayMs = 30000 } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable and we have attempts left
      if (!isRetryableError(error) || attempt >= maxRetries) {
        throw lastError;
      }

      // Wait before retrying
      const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry failed');
}

/**
 * Create an AIError from an HTTP response.
 */
export function createAIErrorFromResponse(
  status: number,
  message: string
): AIError {
  const isRetryable = status === 429 || (status >= 500 && status < 600);
  return new AIError(message, status, isRetryable);
}
