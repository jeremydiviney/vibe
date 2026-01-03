// Anthropic Provider Implementation using official SDK

import Anthropic from '@anthropic-ai/sdk';
import type { AIRequest, AIResponse, AIToolCall, TargetType, ThinkingLevel } from '../types';
import { AIError } from '../types';
import { buildSystemMessage, buildPromptMessage, buildToolSystemMessage } from '../formatters';
import { parseResponse, typeToSchema } from '../schema';
import { chunkContextForCaching } from '../cache-chunking';
import { toAnthropicTools } from '../tool-schema';

/** Anthropic provider configuration */
export const ANTHROPIC_CONFIG = {
  defaultUrl: 'https://api.anthropic.com',
  supportsStructuredOutput: true, // Claude 4.5 models support structured outputs
};

/** Beta headers */
const STRUCTURED_OUTPUTS_BETA = 'structured-outputs-2025-11-13';
const EXTENDED_THINKING_BETA = 'interleaved-thinking-2025-05-14';

/** Map thinking level to Anthropic budget_tokens */
const THINKING_BUDGET_MAP: Record<ThinkingLevel, number> = {
  none: 0,
  low: 1024,      // Minimum required
  medium: 4096,
  high: 10240,
  max: 32768,
};

/**
 * Build output_format parameter for structured output.
 * Returns null for types that can't use structured output (json/json[]).
 */
function buildOutputFormat(targetType: TargetType): Record<string, unknown> | null {
  if (!targetType || targetType === 'text') {
    return null;
  }

  // json/json[] types can't use structured output - unknown schema
  const isJsonType = targetType === 'json' || targetType === 'json[]';
  if (isJsonType) {
    return null;
  }

  const schema = typeToSchema(targetType);
  if (!schema) {
    return null;
  }

  // Anthropic requires additionalProperties: false for objects
  const anthropicSchema = { ...schema };
  if (anthropicSchema.type === 'object') {
    anthropicSchema.additionalProperties = false;
  }

  return {
    type: 'json_schema',
    schema: anthropicSchema,
  };
}

/**
 * Execute an AI request using the Anthropic SDK.
 * Uses structured outputs (beta) for Claude 4.5 models.
 */
export async function executeAnthropic(request: AIRequest): Promise<AIResponse> {
  const { prompt, contextText, targetType, model, tools, previousToolCalls, toolResults } = request;

  // Create Anthropic client
  const client = new Anthropic({
    apiKey: model.apiKey,
    baseURL: model.url ?? ANTHROPIC_CONFIG.defaultUrl,
  });

  // Check if we can use structured output for this type
  const outputFormat = buildOutputFormat(targetType);
  const useStructuredOutput = outputFormat !== null;

  // Build system messages
  const systemMessage = buildSystemMessage();
  const toolSystemMessage = tools?.length ? buildToolSystemMessage(tools) : null;

  // Build prompt message (with type instruction if needed)
  const promptMessage = buildPromptMessage(prompt, targetType, useStructuredOutput);

  // Chunk context for progressive caching
  const { chunks, cacheBreakpointIndex } = chunkContextForCaching(contextText);

  // Build initial user messages: context chunks + prompt
  const initialUserMessages: Record<string, unknown>[] = [
    // Context chunks as separate messages (if any)
    ...chunks.map((chunk, i) => ({
      role: 'user' as const,
      content: i === 0 ? `Here is the current program context:\n\n${chunk.content}` : chunk.content,
      // Cache control on 2nd-to-last chunk to allow latest chunk to change
      ...(i === cacheBreakpointIndex ? { cache_control: { type: 'ephemeral' as const } } : {}),
    })),
    // Prompt is always last (never cached)
    { role: 'user' as const, content: promptMessage },
  ];

  // Build conversation messages including tool results if this is a follow-up
  let allMessages = initialUserMessages;
  if (previousToolCalls?.length && toolResults?.length) {
    // Add assistant message with tool_use blocks
    const assistantContent = previousToolCalls.map(call => ({
      type: 'tool_use' as const,
      id: call.id,
      name: call.toolName,
      input: call.args,
    }));

    // Add user message with tool_result blocks
    const toolResultContent = toolResults.map(result => ({
      type: 'tool_result' as const,
      tool_use_id: result.toolCallId,
      content: result.error
        ? `Error: ${result.error}`
        : (typeof result.result === 'string' ? result.result : JSON.stringify(result.result)),
    }));

    allMessages = [
      ...initialUserMessages,
      { role: 'assistant' as const, content: assistantContent },
      { role: 'user' as const, content: toolResultContent },
    ];
  }

  try {
    // Build system array with optional tool descriptions
    const systemBlocks = [
      {
        type: 'text',
        text: systemMessage,
        cache_control: { type: 'ephemeral' },
      },
    ];
    if (toolSystemMessage) {
      systemBlocks.push({
        type: 'text',
        text: toolSystemMessage,
        cache_control: { type: 'ephemeral' },
      });
    }

    // Build request params with cache control on system message
    const params: Record<string, unknown> = {
      model: model.name,
      max_tokens: 16384, // Increased to support thinking tokens
      system: systemBlocks,
      messages: allMessages,
    };

    // Add tools if provided
    if (tools?.length) {
      params.tools = toAnthropicTools(tools);
    }

    // Add extended thinking if level specified and not 'none'
    const thinkingLevel = model.thinkingLevel as ThinkingLevel | undefined;
    const thinkingBudget = thinkingLevel ? THINKING_BUDGET_MAP[thinkingLevel] : 0;
    if (thinkingBudget > 0) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      };
    }

    // Add structured output format if supported for this type
    if (outputFormat) {
      params.output_format = outputFormat;
    }

    // Build beta headers list
    const betas: string[] = [];
    if (outputFormat) {
      betas.push(STRUCTURED_OUTPUTS_BETA);
    }
    if (thinkingBudget > 0) {
      betas.push(EXTENDED_THINKING_BETA);
    }

    // Make API request - use beta endpoint only when needed
    const response = betas.length > 0
      ? await client.beta.messages.create({
          ...params,
          betas,
        } as Parameters<typeof client.beta.messages.create>[0])
      : await client.messages.create(params as Parameters<typeof client.messages.create>[0]);

    // Extract text content from response
    const textBlock = response.content.find((block) => block.type === 'text');
    const content = textBlock?.type === 'text' ? textBlock.text : '';

    // Extract tool_use blocks
    const toolUseBlocks = response.content.filter(
      (block): block is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        block.type === 'tool_use'
    );
    let toolCalls: AIToolCall[] | undefined;
    if (toolUseBlocks.length > 0) {
      toolCalls = toolUseBlocks.map((block) => ({
        id: block.id,
        toolName: block.name,
        args: block.input,
      }));
    }

    // Determine stop reason
    const stopReason =
      response.stop_reason === 'tool_use'
        ? 'tool_use'
        : response.stop_reason === 'max_tokens'
          ? 'length'
          : 'end';

    // Extract usage including cache and thinking tokens
    const rawUsage = response.usage as Record<string, unknown> | undefined;
    const usage = rawUsage
      ? {
          inputTokens: Number(rawUsage.input_tokens ?? 0),
          outputTokens: Number(rawUsage.output_tokens ?? 0),
          cachedInputTokens: rawUsage.cache_read_input_tokens ? Number(rawUsage.cache_read_input_tokens) : undefined,
          cacheCreationTokens: rawUsage.cache_creation_input_tokens ? Number(rawUsage.cache_creation_input_tokens) : undefined,
          thinkingTokens: rawUsage.thinking_tokens ? Number(rawUsage.thinking_tokens) : undefined,
        }
      : undefined;

    // Parse response according to target type
    let parsedValue: unknown;
    try {
      parsedValue = parseResponse(content, targetType);
    } catch (parseError) {
      // If parse fails (shouldn't happen with structured output), return raw content
      parsedValue = content;
    }

    return { content, parsedValue, usage, toolCalls, stopReason };
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
