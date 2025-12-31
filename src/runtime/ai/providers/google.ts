// Google Generative AI Provider Implementation using official SDK

import { GoogleGenAI } from '@google/genai';
import type { AIRequest, AIResponse, ThinkingLevel } from '../types';
import { AIError } from '../types';
import { buildSystemMessage, buildContextMessage, buildPromptMessage } from '../formatters';
import { typeToSchema, parseResponse } from '../schema';

/** Google provider configuration */
export const GOOGLE_CONFIG = {
  supportsStructuredOutput: true,
};

/** Map thinking level to Google Gemini 3 thinkingLevel */
const THINKING_LEVEL_MAP: Record<ThinkingLevel, string | null> = {
  none: null,       // Don't set thinkingConfig
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'high',      // Gemini 3 Flash max is 'high'
};

/**
 * Execute an AI request using the Google Gen AI SDK.
 */
export async function executeGoogle(request: AIRequest): Promise<AIResponse> {
  const { prompt, contextText, targetType, model } = request;

  // Create Google Gen AI client
  const client = new GoogleGenAI({ apiKey: model.apiKey });

  // Build combined prompt (Google uses a simpler message format)
  const systemInstruction = buildSystemMessage();
  const contextMessage = buildContextMessage(contextText);
  const promptMessage = buildPromptMessage(
    prompt,
    targetType,
    GOOGLE_CONFIG.supportsStructuredOutput
  );

  // Combine into single prompt for Google
  const parts: string[] = [];
  if (contextMessage) parts.push(contextMessage);
  parts.push(promptMessage);
  const combinedPrompt = parts.join('\n\n');

  try {
    // Build generation config
    const generationConfig: Record<string, unknown> = {};

    // Add thinking config if level specified
    const thinkingLevel = model.thinkingLevel as ThinkingLevel | undefined;
    const googleThinkingLevel = thinkingLevel ? THINKING_LEVEL_MAP[thinkingLevel] : null;
    if (googleThinkingLevel) {
      generationConfig.thinkingConfig = {
        thinkingLevel: googleThinkingLevel,
      };
    }

    // Add structured output schema if target type specified
    // Skip for json/json[] - Google requires non-empty properties for objects
    const isJsonType = targetType === 'json' || targetType === 'json[]';
    if (targetType && !isJsonType) {
      const schema = typeToSchema(targetType);
      if (schema) {
        generationConfig.responseMimeType = 'application/json';
        generationConfig.responseSchema = {
          type: 'object',
          properties: {
            value: schema,
          },
          required: ['value'],
        };
      }
    }

    // Make API request
    const response = await client.models.generateContent({
      model: model.name,
      contents: combinedPrompt,
      config: {
        systemInstruction,
        ...generationConfig,
      },
    });

    // Extract content
    const content = response.text ?? '';

    // Extract usage from response including cached and thinking tokens
    const meta = response.usageMetadata as Record<string, unknown> | undefined;
    const usage = meta
      ? {
          inputTokens: Number(meta.promptTokenCount ?? 0),
          outputTokens: Number(meta.candidatesTokenCount ?? 0),
          cachedInputTokens: meta.cachedContentTokenCount ? Number(meta.cachedContentTokenCount) : undefined,
          thinkingTokens: meta.thoughtsTokenCount ? Number(meta.thoughtsTokenCount) : undefined,
        }
      : undefined;

    // Parse value from structured output or raw content
    let parsedValue: unknown;
    if (targetType && generationConfig.responseSchema) {
      // Structured output wraps in { value: ... }
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
    // Handle Google API errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      const isRetryable =
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('500') ||
        message.includes('503') ||
        message.includes('service unavailable');

      // Extract status code if present
      const statusMatch = error.message.match(/(\d{3})/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : undefined;

      throw new AIError(
        `Google API error: ${error.message}`,
        statusCode,
        isRetryable
      );
    }
    throw error;
  }
}
