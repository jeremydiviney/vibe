// Anthropic Provider Implementation using official SDK

import Anthropic from '@anthropic-ai/sdk';
import type { AIRequest, AIResponse, AIToolCall, ThinkingLevel } from '../types';
import { AIError } from '../types';
import { buildSystemMessage, buildPromptMessage, buildToolSystemMessage } from '../formatters';
import { chunkContextForCaching } from '../cache-chunking';
import { toAnthropicTools } from '../tool-schema';

/** Anthropic provider configuration */
export const ANTHROPIC_CONFIG = {
  defaultUrl: 'https://api.anthropic.com',
};

/** Beta headers */
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
 * Execute an AI request using the Anthropic SDK.
 */
export async function executeAnthropic(request: AIRequest): Promise<AIResponse> {
  const { prompt, contextText, model, tools, previousToolCalls, toolResults, messages: overrideMessages } = request;

  // Create Anthropic client
  const client = new Anthropic({
    apiKey: model.apiKey,
    baseURL: model.url ?? ANTHROPIC_CONFIG.defaultUrl,
  });

  // If messages are provided (e.g., for vibe), use simplified path
  if (overrideMessages) {
    return executeWithOverrideMessages(client, model, overrideMessages);
  }

  // Build system messages
  const systemMessage = buildSystemMessage();
  const toolSystemMessage = tools?.length ? buildToolSystemMessage(tools) : null;

  // Build prompt message
  const promptMessage = buildPromptMessage(prompt);

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

    // Add user message with tool_result blocks (only for matching tool calls)
    const validToolCallIds = new Set(previousToolCalls.map(c => c.id));
    const toolResultContent = toolResults
      .filter(result => validToolCallIds.has(result.toolCallId))
      .map(result => ({
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

  // Add follow-up message if present (e.g., error about missing return fields)
  if (request.followUpMessage) {
    allMessages = [...allMessages, { role: 'user' as const, content: request.followUpMessage }];
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

    // Make API request - use beta endpoint for extended thinking
    // Response type is Message (non-streaming since we don't pass stream: true)
    const response = thinkingBudget > 0
      ? await client.beta.messages.create({
          ...params,
          betas: [EXTENDED_THINKING_BETA],
        } as Parameters<typeof client.beta.messages.create>[0])
      : await client.messages.create(params as unknown as Parameters<typeof client.messages.create>[0]);

    // Cast to Message type (we know it's not streaming)
    const message = response as Anthropic.Message;

    // Extract text content from response
    const textBlock = message.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    const content = textBlock?.text ?? '';

    // Extract tool_use blocks
    const toolUseBlocks = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );
    let toolCalls: AIToolCall[] | undefined;
    if (toolUseBlocks.length > 0) {
      toolCalls = toolUseBlocks.map((block) => ({
        id: block.id,
        toolName: block.name,
        args: block.input as Record<string, unknown>,
      }));
    }

    // Determine stop reason
    const stopReason =
      message.stop_reason === 'tool_use'
        ? 'tool_use'
        : message.stop_reason === 'max_tokens'
          ? 'length'
          : 'end';

    // Extract usage including cache and thinking tokens
    const rawUsage = message.usage as unknown as Record<string, unknown> | undefined;
    const usage = rawUsage
      ? {
          inputTokens: Number(rawUsage.input_tokens ?? 0),
          outputTokens: Number(rawUsage.output_tokens ?? 0),
          cachedInputTokens: rawUsage.cache_read_input_tokens ? Number(rawUsage.cache_read_input_tokens) : undefined,
          cacheCreationTokens: rawUsage.cache_creation_input_tokens ? Number(rawUsage.cache_creation_input_tokens) : undefined,
          thinkingTokens: rawUsage.thinking_tokens ? Number(rawUsage.thinking_tokens) : undefined,
        }
      : undefined;

    // For text responses, parsedValue is just the content
    // For typed responses, the value comes from return tool calls (handled by tool-loop)
    const rawResponse = JSON.stringify(message, null, 2);
    return { content, parsedValue: content, usage, toolCalls, stopReason, rawResponse };
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

/**
 * Execute with override messages (used by vibe for custom system prompt).
 * Simpler path without context chunking, caching, or structured output.
 */
async function executeWithOverrideMessages(
  client: Anthropic,
  model: AIRequest['model'],
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): Promise<AIResponse> {
  // Separate system messages from user/assistant messages
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  // Build system content
  const systemContent = systemMessages.map(m => m.content).join('\n\n');

  try {
    const response = await client.messages.create({
      model: model.name,
      max_tokens: 4096,
      system: systemContent,
      messages: conversationMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    // Extract text content
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const content = textBlock?.text ?? '';

    // Extract usage including cache and thinking tokens
    const rawUsage = response.usage as unknown as Record<string, unknown> | undefined;
    const usage = rawUsage
      ? {
          inputTokens: Number(rawUsage.input_tokens ?? 0),
          outputTokens: Number(rawUsage.output_tokens ?? 0),
          cachedInputTokens: rawUsage.cache_read_input_tokens ? Number(rawUsage.cache_read_input_tokens) : undefined,
          cacheCreationTokens: rawUsage.cache_creation_input_tokens ? Number(rawUsage.cache_creation_input_tokens) : undefined,
          thinkingTokens: rawUsage.thinking_tokens ? Number(rawUsage.thinking_tokens) : undefined,
        }
      : undefined;

    return { content, parsedValue: content, usage, toolCalls: [], stopReason: 'end' };
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
