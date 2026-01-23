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

    // Add reasoning effort if thinking level specified
    const thinkingLevel = model.thinkingLevel as ThinkingLevel | undefined;
    if (thinkingLevel) {
      (params as unknown as Record<string, unknown>).reasoning_effort = REASONING_EFFORT_MAP[thinkingLevel];
    }

    // Make API request
    const completion = await client.chat.completions.create(params);

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
