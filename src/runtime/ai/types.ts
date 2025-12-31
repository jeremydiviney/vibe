// AI Module Type Definitions

import type { AIProviderType } from '../../ast';

// Re-export for convenience
export type { AIProviderType };

/** Target types for AI responses */
export type TargetType = 'text' | 'json' | 'boolean' | 'number' | null;

/** Thinking level for extended reasoning */
export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high' | 'max';

/** Model configuration from Vibe model declaration */
export interface ModelConfig {
  name: string;
  apiKey: string;
  url: string | null;
  provider?: AIProviderType;
  maxRetriesOnError?: number;
  thinkingLevel?: ThinkingLevel;
}

/** AI request for all providers */
export interface AIRequest {
  operationType: 'do' | 'ask' | 'vibe';
  prompt: string;
  contextText: string;
  targetType: TargetType;
  model: ModelConfig;
}

/** Detailed token usage from AI providers */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  // Cached tokens (prompt caching)
  cachedInputTokens?: number;
  // Tokens used to create cache (Anthropic)
  cacheCreationTokens?: number;
  // Reasoning/thinking tokens (OpenAI o1, Claude extended thinking)
  thinkingTokens?: number;
}

/** AI response from all providers */
export interface AIResponse {
  content: string;
  parsedValue: unknown;
  usage?: TokenUsage;
}

/** Custom error for AI operations */
export class AIError extends Error {
  readonly statusCode?: number;
  readonly isRetryable: boolean;

  constructor(message: string, statusCode?: number, isRetryable = false) {
    super(message);
    this.name = 'AIError';
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}

/** Provider executor function signature */
export type ProviderExecutor = (request: AIRequest) => Promise<AIResponse>;

/** Retry options */
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}
