import { describe, it, expect } from 'bun:test';
import { chunkContextForCaching } from './cache-chunking';

describe('chunkContextForCaching', () => {
  it('returns empty chunks for empty context', () => {
    const result = chunkContextForCaching('');
    expect(result.chunks).toEqual([]);
    expect(result.cacheBreakpointIndex).toBe(-1);
  });

  it('returns empty chunks for whitespace-only context', () => {
    const result = chunkContextForCaching('   \n\n   ');
    expect(result.chunks).toEqual([]);
    expect(result.cacheBreakpointIndex).toBe(-1);
  });

  it('creates single chunk for small context', () => {
    const context = '- name: Alice\n- age: 30';
    const result = chunkContextForCaching(context);
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].content).toBe(context);
    expect(result.cacheBreakpointIndex).toBe(-1); // No 2nd-to-last with single chunk
  });

  it('creates multiple chunks when context exceeds threshold', () => {
    // Create context that exceeds 5000 tokens (~20000 chars)
    const largeLine = '- data: ' + 'x'.repeat(10000); // ~2500 tokens
    const context = [largeLine, largeLine, largeLine].join('\n'); // ~7500 tokens total

    const result = chunkContextForCaching(context);
    expect(result.chunks.length).toBeGreaterThan(1);
  });

  it('sets cache breakpoint on 2nd-to-last chunk', () => {
    // Create context that will produce exactly 2 chunks
    const largeLine = '- data: ' + 'x'.repeat(10000);
    const context = [largeLine, largeLine].join('\n');

    const result = chunkContextForCaching(context);
    expect(result.chunks.length).toBe(2);
    expect(result.cacheBreakpointIndex).toBe(0); // 2nd-to-last of 2 = index 0
  });

  it('sets cache breakpoint correctly for 3 chunks', () => {
    // Create context that will produce 3 chunks
    const largeLine = '- data: ' + 'x'.repeat(10000);
    const context = [largeLine, largeLine, largeLine].join('\n');

    const result = chunkContextForCaching(context);
    expect(result.chunks.length).toBe(3);
    expect(result.cacheBreakpointIndex).toBe(1); // 2nd-to-last of 3 = index 1
  });

  it('preserves line content in chunks', () => {
    const lines = ['- a: 1', '- b: 2', '- c: 3'];
    const context = lines.join('\n');

    const result = chunkContextForCaching(context);
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].content).toBe(context);
  });

  it('estimates token count approximately', () => {
    // 400 chars should be ~100 tokens (4 chars/token)
    const context = 'x'.repeat(400);
    const result = chunkContextForCaching(context);
    expect(result.chunks[0].tokenEstimate).toBe(100);
  });
});
