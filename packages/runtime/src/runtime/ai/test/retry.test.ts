// Retry logic tests

import { describe, test, expect, mock } from 'bun:test';
import {
  isRetryableError,
  calculateDelay,
  withRetry,
  createAIErrorFromResponse,
} from '../retry';
import { AIError } from '../types';

describe('isRetryableError', () => {
  test('returns true for AIError with isRetryable flag', () => {
    const error = new AIError('Rate limited', 429, true);
    expect(isRetryableError(error)).toBe(true);
  });

  test('returns false for AIError without isRetryable flag', () => {
    const error = new AIError('Bad request', 400, false);
    expect(isRetryableError(error)).toBe(false);
  });

  test('returns true for network-related errors', () => {
    expect(isRetryableError(new Error('network error'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('timeout'))).toBe(true);
    expect(isRetryableError(new Error('socket hang up'))).toBe(true);
  });

  test('returns false for non-retryable errors', () => {
    expect(isRetryableError(new Error('Unknown error'))).toBe(false);
    expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
  });
});

describe('calculateDelay', () => {
  test('returns delay with exponential growth', () => {
    const delay0 = calculateDelay(0, 1000, 30000);
    const delay1 = calculateDelay(1, 1000, 30000);
    const delay2 = calculateDelay(2, 1000, 30000);

    // Each should be roughly double the previous (with jitter)
    // delay0 is base * 2^0 * jitter = 1000 * 1 * (0.5-1.0) = 500-1000
    expect(delay0).toBeGreaterThanOrEqual(500);
    expect(delay0).toBeLessThanOrEqual(1000);

    // delay1 is base * 2^1 * jitter = 1000 * 2 * (0.5-1.0) = 1000-2000
    expect(delay1).toBeGreaterThanOrEqual(1000);
    expect(delay1).toBeLessThanOrEqual(2000);

    // delay2 is base * 2^2 * jitter = 1000 * 4 * (0.5-1.0) = 2000-4000
    expect(delay2).toBeGreaterThanOrEqual(2000);
    expect(delay2).toBeLessThanOrEqual(4000);
  });

  test('caps delay at maxDelay', () => {
    const delay = calculateDelay(10, 1000, 5000);
    // At attempt 10, base delay would be 1000 * 2^10 = 1024000
    // But capped at 5000 with jitter = 2500-5000
    expect(delay).toBeGreaterThanOrEqual(2500);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});

describe('createAIErrorFromResponse', () => {
  test('creates retryable error for 429', () => {
    const error = createAIErrorFromResponse(429, 'Rate limited');
    expect(error.statusCode).toBe(429);
    expect(error.isRetryable).toBe(true);
    expect(error.message).toContain('Rate limited');
  });

  test('creates retryable error for 5xx', () => {
    const error500 = createAIErrorFromResponse(500, 'Internal error');
    expect(error500.isRetryable).toBe(true);

    const error503 = createAIErrorFromResponse(503, 'Service unavailable');
    expect(error503.isRetryable).toBe(true);
  });

  test('creates non-retryable error for 4xx (except 429)', () => {
    const error400 = createAIErrorFromResponse(400, 'Bad request');
    expect(error400.isRetryable).toBe(false);

    const error401 = createAIErrorFromResponse(401, 'Unauthorized');
    expect(error401.isRetryable).toBe(false);
  });
});

describe('withRetry', () => {
  test('returns result on first success', async () => {
    const fn = mock().mockResolvedValue('success');
    const result = await withRetry(fn, { maxRetries: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on retryable error', async () => {
    const fn = mock()
      .mockRejectedValueOnce(new AIError('Rate limited', 429, true))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('does not retry on non-retryable error', async () => {
    const fn = mock().mockRejectedValue(new AIError('Bad request', 400, false));

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('Bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('throws after max retries', async () => {
    const fn = mock().mockRejectedValue(new AIError('Rate limited', 429, true));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 10 })
    ).rejects.toThrow('Rate limited');

    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  test('retries on network errors', async () => {
    const fn = mock()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
