// Anthropic Provider Implementation using official SDK

import Anthropic from '@anthropic-ai/sdk';
import type { AIRequest, AIResponse } from '../types';
import { AIError } from '../types';
import { buildMessages } from '../formatters';
import { parseResponse } from '../schema';

/** Anthropic provider configuration */
export const ANTHROPIC_CONFIG = {
  defaultUrl: 'https://api.anthropic.com',
  supportsStructuredOutput: false, // Anthropic uses prompt-based type enforcement
};

/**
 * Execute an AI request using the Anthropic SDK.
 * Note: Anthropic doesn't support structured outputs, so we use prompt instructions.
 */
export async function executeAnthropic(request: AIRequest): Promise<AIResponse> {
  const { prompt, contextText, targetType, model } = request;

  // Create Anthropic client
  const client = new Anthropic({
    apiKey: model.apiKey,
    baseURL: model.url ?? ANTHROPIC_CONFIG.defaultUrl,
  });

  // Build messages (type instruction appended for Anthropic since no structured output)
  const messages = buildMessages(
    prompt,
    contextText,
    targetType,
    ANTHROPIC_CONFIG.supportsStructuredOutput
  );

  // Extract system message and user messages
  const systemMessage = messages.find((m) => m.role === 'system')?.content ?? '';
  const userMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  try {
    // Make API request
    const response = await client.messages.create({
      model: model.name,
      max_tokens: 4096,
      system: systemMessage,
      messages: userMessages,
    });

    // Extract content from response
    const textBlock = response.content.find((block) => block.type === 'text');
    const content = textBlock?.type === 'text' ? textBlock.text : '';

    // Extract usage
    const usage = response.usage
      ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        }
      : undefined;

    // Parse response according to target type
    let parsedValue: unknown;
    try {
      parsedValue = parseResponse(content, targetType);
    } catch (parseError) {
      // For Anthropic, if first parse fails, we could retry once
      // For now, just return the raw content
      parsedValue = content;
    }

    return { content, parsedValue, usage };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      const isRetryable = error.status === 429 || (error.status ?? 0) >= 500;
      throw new AIError(
        `Anthropic API error (${error.status}): ${error.message}`,
        error.status,
        isRetryable
      );
    }
    throw error;
  }
}
