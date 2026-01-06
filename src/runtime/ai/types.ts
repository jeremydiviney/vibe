// AI Module Type Definitions

import type { AIProviderType } from '../../ast';
import type { ToolSchema } from '../tools/types';

// Re-export for convenience
export type { AIProviderType };

/** Target types for AI responses */
export type TargetType = 'text' | 'json' | 'boolean' | 'number' | 'text[]' | 'json[]' | 'boolean[]' | 'number[]' | null;

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
  operationType: 'do' | 'vibe';
  prompt: string;
  contextText: string;
  targetType: TargetType;
  model: ModelConfig;
  /** Available tools for function calling */
  tools?: ToolSchema[];
  /** Previous tool calls from AI response (for multi-turn) */
  previousToolCalls?: AIToolCall[];
  /** Tool results from previous call (for multi-turn) */
  toolResults?: AIToolResult[];
  /** Override messages (used by vibe for custom system prompt) */
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
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

/** Tool call parsed from AI response */
export interface AIToolCall {
  /** Provider-assigned ID for the tool call */
  id: string;
  /** Name of the tool to call */
  toolName: string;
  /** Arguments parsed from the tool call */
  args: Record<string, unknown>;
  /** Thought signature for Gemini 3 models (must be echoed back in follow-up) */
  thoughtSignature?: string;
}

/** Tool result to send back in follow-up request */
export interface AIToolResult {
  /** ID of the tool call this result is for */
  toolCallId: string;
  /** Successful result value */
  result?: unknown;
  /** Error message if the tool call failed */
  error?: string;
}

/** Why the model stopped generating */
export type AIStopReason = 'end' | 'tool_use' | 'length' | 'content_filter';

/** AI response from all providers */
export interface AIResponse {
  content: string;
  parsedValue: unknown;
  usage?: TokenUsage;
  /** Tool calls from the model (if any) */
  toolCalls?: AIToolCall[];
  /** Why the model stopped generating */
  stopReason?: AIStopReason;
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
