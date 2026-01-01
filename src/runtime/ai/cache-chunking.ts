// Anthropic prompt caching utilities
// Splits context into chunks for progressive caching

const TARGET_CHUNK_TOKENS = 5000;
const CHARS_PER_TOKEN = 4; // Rough estimate for token counting

/** A chunk of context content with estimated token count */
export interface CacheChunk {
  content: string;
  tokenEstimate: number;
}

/** Chunked context ready for Anthropic API with cache breakpoint info */
export interface ChunkedContext {
  chunks: CacheChunk[];
  cacheBreakpointIndex: number; // Which chunk gets cache_control (-1 if none)
}

/**
 * Estimate token count for a string using character-based heuristic.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split formatted context text into chunks of ~5000 tokens each.
 * Splits by line boundaries (each context entry is on its own line).
 * Accumulates lines until hitting threshold, then starts new chunk.
 * Cache breakpoint is placed on 2nd-to-last chunk to allow latest chunk to change.
 */
export function chunkContextForCaching(contextText: string): ChunkedContext {
  const trimmed = contextText.trim();
  if (!trimmed) {
    return { chunks: [], cacheBreakpointIndex: -1 };
  }

  const lines = trimmed.split('\n');
  const chunks: CacheChunk[] = [];
  let currentLines: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = estimateTokens(line);

    // If adding this line exceeds threshold and we have content, start new chunk
    if (currentTokens + lineTokens > TARGET_CHUNK_TOKENS && currentLines.length > 0) {
      chunks.push({
        content: currentLines.join('\n'),
        tokenEstimate: currentTokens,
      });
      currentLines = [];
      currentTokens = 0;
    }

    currentLines.push(line);
    currentTokens += lineTokens;
  }

  // Push final chunk if we have content
  if (currentLines.length > 0) {
    chunks.push({
      content: currentLines.join('\n'),
      tokenEstimate: currentTokens,
    });
  }

  // Cache breakpoint on 2nd-to-last chunk (or -1 if < 2 chunks)
  // This allows the last chunk to change without invalidating the cache
  const cacheBreakpointIndex = chunks.length >= 2 ? chunks.length - 2 : -1;

  return { chunks, cacheBreakpointIndex };
}
