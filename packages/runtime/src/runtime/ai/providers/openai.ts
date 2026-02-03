// OpenAI Provider Implementation using official SDK

import OpenAI from 'openai';
import type { AIRequest, AIResponse, AIToolCall, ThinkingLevel } from '../types';
import { AIError } from '../types';
import { buildMessages } from '../formatters';
import { toOpenAITools } from '../tool-schema';

/** OpenAI provider configuration */
export const OPENAI_CONFIG = {
  defaultUrl: 'https://api.openai.com/v1',
};

/** Default thinking level map for OpenAI models (reasoning_effort parameter) */
const DEFAULT_REASONING_EFFORT_MAP: Record<ThinkingLevel, string> = {
  none: 'none',      // No reasoning tokens (GPT-5.1+)
  low: 'low',        // Minimal reasoning
  medium: 'medium',  // Default - balanced speed and accuracy
  high: 'high',      // More thorough reasoning
  max: 'xhigh',      // Maximum reasoning (GPT-5.1-codex-max+)
};

/**
 * Model reasoning configuration types:
 * - 'effort': Uses OpenAI-style `reasoning_effort` parameter (string levels)
 * - 'boolean': Uses OpenRouter-style `reasoning.enabled` parameter (true/false)
 * - 'none': No reasoning configuration (always-on or not supported)
 */
type ReasoningType = 'effort' | 'boolean' | 'none';

interface ModelReasoningConfig {
  type: ReasoningType;
  /** For 'effort' type: custom level mappings (optional, defaults to DEFAULT_REASONING_EFFORT_MAP) */
  effortMap?: Partial<Record<ThinkingLevel, string | false>>;
}

/**
 * Model-specific reasoning configurations.
 * Models not in this map default to 'effort' type with standard OpenAI mapping.
 */
const MODEL_REASONING_CONFIGS: Record<string, ModelReasoningConfig> = {
  // xAI Grok models (via OpenRouter)
  'x-ai/grok-4': { type: 'none' },  // Always-on reasoning, cannot be configured
  'x-ai/grok-4.1-fast': { type: 'boolean' },  // Boolean reasoning param

  // DeepSeek models (via OpenRouter)
  'deepseek/deepseek-v3.2-20251201': { type: 'boolean' },  // Boolean reasoning param

  // GLM models (via OpenRouter)
  'z-ai/glm-4.7': { type: 'none' },  // No reasoning support

  // Kimi/Moonshot models (via OpenRouter)
  'moonshotai/kimi-k2.5': { type: 'boolean' },  // Boolean reasoning param
};

/**
 * Get model reasoning configuration.
 * Returns the config for the model, or default 'effort' type for unknown models.
 */
function getModelReasoningConfig(modelName: string): ModelReasoningConfig {
  // Check for exact model match
  if (modelName in MODEL_REASONING_CONFIGS) {
    return MODEL_REASONING_CONFIGS[modelName];
  }

  // Default to OpenAI-style reasoning effort
  return { type: 'effort' };
}

/**
 * Get the reasoning_effort value for OpenAI-style models.
 */
function getReasoningEffort(level: ThinkingLevel, config: ModelReasoningConfig): string | null {
  const map = config.effortMap ?? {};
  if (level in map) {
    const value = map[level];
    return value === false ? null : (value ?? null);
  }
  return DEFAULT_REASONING_EFFORT_MAP[level];
}

/**
 * Get the boolean reasoning value for OpenRouter-style models.
 */
function getReasoningEnabled(level: ThinkingLevel): boolean {
  return level !== 'none';
}

/**
 * Execute an AI request using the OpenAI SDK.
 */
export async function executeOpenAI(request: AIRequest): Promise<AIResponse> {
  const { prompt, contextText, targetType, model, tools, previousToolCalls, toolResults } = request;

  // Create OpenAI client
  const client = new OpenAI({
    apiKey: model.apiKey,
    baseURL: model.url ?? OPENAI_CONFIG.defaultUrl,
  });

  // Build base messages
  const baseMessages = buildMessages(prompt, contextText, tools);

  // Build conversation messages - either simple or multi-turn with tool results
  type ChatMessage = OpenAI.ChatCompletionMessageParam;
  let messages: ChatMessage[] = baseMessages.map((m) => ({
    role: m.role as 'system' | 'user' | 'assistant',
    content: m.content,
  }));

  // Add tool call history if present (multi-turn conversation)
  if (previousToolCalls?.length && toolResults?.length) {
    // Add assistant message with tool calls
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: null,
      tool_calls: previousToolCalls.map(call => ({
        id: call.id,
        type: 'function' as const,
        function: {
          name: call.toolName,
          arguments: JSON.stringify(call.args),
        },
      })),
    };
    messages.push(assistantMessage);

    // Add tool result messages (only for calls that have matching previousToolCalls)
    for (const result of toolResults) {
      const call = previousToolCalls.find(c => c.id === result.toolCallId);
      if (!call) continue;
      const toolMessage: ChatMessage = {
        role: 'tool',
        tool_call_id: call.id,
        content: result.error
          ? `Error: ${result.error}`
          : typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result),
      };
      messages.push(toolMessage);
    }
  }

  // Add follow-up message if present (e.g., error about missing return fields)
  if (request.followUpMessage) {
    messages.push({ role: 'user', content: request.followUpMessage });
  }

  try {
    // Build request parameters
    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: model.name,
      messages,
    };

    // Add tools if provided
    if (tools?.length) {
      params.tools = toOpenAITools(tools) as OpenAI.ChatCompletionTool[];
    }

    // Add reasoning configuration based on model type
    const thinkingLevel = model.thinkingLevel as ThinkingLevel | undefined;
    if (thinkingLevel) {
      const reasoningConfig = getModelReasoningConfig(model.name);

      switch (reasoningConfig.type) {
        case 'effort': {
          // OpenAI-style: reasoning_effort parameter
          const effort = getReasoningEffort(thinkingLevel, reasoningConfig);
          if (effort !== null) {
            (params as unknown as Record<string, unknown>).reasoning_effort = effort;
          }
          break;
        }
        case 'boolean': {
          // OpenRouter-style: reasoning.enabled parameter
          const enabled = getReasoningEnabled(thinkingLevel);
          (params as unknown as Record<string, unknown>).reasoning = { enabled };
          break;
        }
        case 'none':
          // No reasoning configuration for this model
          break;
      }
    }

    // Make API request
    const completion = await client.chat.completions.create(params);

    // Check for OpenRouter error-in-200 responses (errors returned with HTTP 200 status)
    const rawCompletion = completion as unknown as Record<string, unknown>;
    if (rawCompletion.error) {
      const err = rawCompletion.error as { code?: number; message?: string };
      const isRetryable = err.code === 429 || (err.code ?? 0) >= 500;
      throw new AIError(
        `OpenRouter error (${err.code}): ${err.message}`,
        err.code,
        isRetryable
      );
    }

    // Guard against empty/missing choices (model warm-up, non-conformant responses)
    if (!completion.choices?.length) {
      throw new AIError(
        'No response from model: choices array is empty or missing. The model may be warming up or temporarily unavailable.',
        undefined,
        true
      );
    }

    // Extract message
    const message = completion.choices[0]?.message;
    const content = message?.content ?? '';
    const finishReason = completion.choices[0]?.finish_reason;

    // Extract usage including cached and reasoning tokens
    const rawUsage = completion.usage as unknown as Record<string, unknown> | undefined;
    const promptDetails = rawUsage?.prompt_tokens_details as Record<string, unknown> | undefined;
    const completionDetails = rawUsage?.completion_tokens_details as Record<string, unknown> | undefined;
    const thinkingTokens = completionDetails?.reasoning_tokens ? Number(completionDetails.reasoning_tokens) : 0;
    const totalCompletionTokens = Number(rawUsage?.completion_tokens ?? 0);
    const usage = rawUsage
      ? {
          inputTokens: Number(rawUsage.prompt_tokens ?? 0),
          // OpenAI includes reasoning tokens in completion_tokens, subtract to avoid double-counting
          outputTokens: totalCompletionTokens - thinkingTokens,
          cachedInputTokens: promptDetails?.cached_tokens ? Number(promptDetails.cached_tokens) : undefined,
          thinkingTokens: thinkingTokens || undefined,
        }
      : undefined;

    // Parse tool calls if present
    let toolCalls: AIToolCall[] | undefined;
    if (message?.tool_calls?.length) {
      toolCalls = message.tool_calls
        .filter((tc): tc is OpenAI.ChatCompletionMessageToolCall & { function: { name: string; arguments: string } } =>
          'function' in tc && tc.function !== undefined
        )
        .map((tc) => ({
          id: tc.id,
          toolName: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        }));
    }

    // Determine stop reason
    const stopReason =
      finishReason === 'tool_calls'
        ? 'tool_use'
        : finishReason === 'length'
          ? 'length'
          : finishReason === 'content_filter'
            ? 'content_filter'
            : 'end';

    // For text responses, parsedValue is just the content
    // For typed responses, the value comes from return tool calls (handled by tool-loop)
    const rawResponse = JSON.stringify(completion, null, 2);
    return { content, parsedValue: content, usage, toolCalls, stopReason, rawResponse };
  } catch (error) {
    if (error instanceof AIError) {
      throw error;
    }
    if (error instanceof OpenAI.APIError) {
      const isRetryable = error.status === 429 || (error.status ?? 0) >= 500;
      throw new AIError(
        `OpenAI API error (${error.status}): ${error.message}`,
        error.status,
        isRetryable
      );
    }
    // Handle timeout and network errors as retryable
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      const isNetworkError = message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('socket hang up');
      if (isNetworkError) {
        throw new AIError(
          `Network error: ${error.message}`,
          undefined,
          true
        );
      }
    }
    throw error;
  }
}
