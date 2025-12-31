// OpenAI Provider Implementation using official SDK

import OpenAI from 'openai';
import type { AIRequest, AIResponse, ThinkingLevel } from '../types';
import { AIError } from '../types';
import { buildMessages } from '../formatters';
import { typeToSchema, parseResponse } from '../schema';

/** OpenAI provider configuration */
export const OPENAI_CONFIG = {
  defaultUrl: 'https://api.openai.com/v1',
  supportsStructuredOutput: true,
};

/** Map thinking level to OpenAI reasoning_effort */
const REASONING_EFFORT_MAP: Record<ThinkingLevel, string> = {
  none: 'none',
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'xhigh',  // OpenAI uses 'xhigh' for max reasoning
};

/**
 * Execute an AI request using the OpenAI SDK.
 */
export async function executeOpenAI(request: AIRequest): Promise<AIResponse> {
  const { prompt, contextText, targetType, model } = request;

  // Create OpenAI client
  const client = new OpenAI({
    apiKey: model.apiKey,
    baseURL: model.url ?? OPENAI_CONFIG.defaultUrl,
  });

  // Build messages
  const messages = buildMessages(
    prompt,
    contextText,
    targetType,
    OPENAI_CONFIG.supportsStructuredOutput
  );

  try {
    // Build request parameters
    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: model.name,
      messages: messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    };

    // Add reasoning effort if thinking level specified
    const thinkingLevel = model.thinkingLevel as ThinkingLevel | undefined;
    if (thinkingLevel) {
      (params as Record<string, unknown>).reasoning_effort = REASONING_EFFORT_MAP[thinkingLevel];
    }

    // Add structured output format if target type specified
    if (targetType === 'json') {
      // Use JSON mode for json - ensures valid JSON without requiring schema
      params.response_format = { type: 'json_object' };
    } else if (targetType) {
      const schema = typeToSchema(targetType);
      if (schema) {
        params.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                value: schema,
              },
              required: ['value'],
              additionalProperties: false,
            },
          },
        };
      }
    }

    // Make API request
    const completion = await client.chat.completions.create(params);

    // Extract content
    const content = completion.choices[0]?.message?.content ?? '';

    // Extract usage including cached and reasoning tokens
    const rawUsage = completion.usage as Record<string, unknown> | undefined;
    const promptDetails = rawUsage?.prompt_tokens_details as Record<string, unknown> | undefined;
    const completionDetails = rawUsage?.completion_tokens_details as Record<string, unknown> | undefined;
    const usage = rawUsage
      ? {
          inputTokens: Number(rawUsage.prompt_tokens ?? 0),
          outputTokens: Number(rawUsage.completion_tokens ?? 0),
          cachedInputTokens: promptDetails?.cached_tokens ? Number(promptDetails.cached_tokens) : undefined,
          thinkingTokens: completionDetails?.reasoning_tokens ? Number(completionDetails.reasoning_tokens) : undefined,
        }
      : undefined;

    // Parse value from structured output or raw content
    let parsedValue: unknown;
    if (targetType && params.response_format) {
      // Structured output wraps in { value: ... }, JSON mode returns raw JSON
      try {
        const parsed = JSON.parse(content);
        parsedValue = parsed.value ?? parsed;
      } catch {
        parsedValue = parseResponse(content, targetType);
      }
    } else {
      parsedValue = parseResponse(content, targetType);
    }

    return { content, parsedValue, usage };
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      const isRetryable = error.status === 429 || (error.status ?? 0) >= 500;
      throw new AIError(
        `OpenAI API error (${error.status}): ${error.message}`,
        error.status,
        isRetryable
      );
    }
    throw error;
  }
}
