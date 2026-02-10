// Google Generative AI Provider Implementation using official SDK

import { GoogleGenAI } from '@google/genai';
import type { AIRequest, AIResponse, AIToolCall, ThinkingLevel } from '../types';
import { AIError } from '../types';
import { buildSystemMessage, buildContextMessage, buildPromptMessage, buildToolSystemMessage } from '../formatters';
import { toGoogleFunctionDeclarations } from '../tool-schema';

/**
 * Model-specific thinking level mappings.
 * Maps Vibe thinking levels to Google API values for each model.
 * - Gemini 3 Pro: Only supports 'low' and 'high'
 * - Gemini 3 Flash: Supports 'minimal', 'low', 'medium', 'high'
 */
type GoogleThinkingMap = Record<ThinkingLevel, string | null>;

const GOOGLE_THINKING_MAPS: Record<string, GoogleThinkingMap> = {
  // Gemini 3 Flash - supports all levels
  'gemini-3-flash-preview': {
    none: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'high',
  },
  // Gemini 3 Pro - only supports 'low' and 'high'
  'gemini-3-pro-preview': {
    none: null,
    low: 'low',
    medium: 'low',   // Pro doesn't support medium, fall back to low
    high: 'high',
    max: 'high',
  },
};

// Default map for unknown models (conservative - assumes Pro-like constraints)
const DEFAULT_GOOGLE_THINKING_MAP: GoogleThinkingMap = {
  none: null,
  low: 'low',
  medium: 'low',
  high: 'high',
  max: 'high',
};

/**
 * Get Google thinking level based on model and Vibe thinking level.
 */
function getGoogleThinkingLevel(modelName: string, level: ThinkingLevel): string | null {
  const map = GOOGLE_THINKING_MAPS[modelName] ?? DEFAULT_GOOGLE_THINKING_MAP;
  return map[level];
}

/** Generate a unique ID for tool calls (Google doesn't provide one) */
function generateToolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Execute an AI request using the Google Gen AI SDK.
 */
export async function executeGoogle(request: AIRequest): Promise<AIResponse> {
  const { prompt, contextText, targetType, model, tools, previousToolCalls, toolResults } = request;

  // Create Google Gen AI client
  const client = new GoogleGenAI({ apiKey: model.apiKey });

  // Build combined prompt (Google uses a simpler message format)
  const baseSystemInstruction = buildSystemMessage();
  const toolSystemMessage = tools?.length ? buildToolSystemMessage(tools) : null;
  const systemInstruction = toolSystemMessage
    ? `${baseSystemInstruction}\n\n${toolSystemMessage}`
    : baseSystemInstruction;

  const contextMessage = buildContextMessage(contextText);
  const promptMessage = buildPromptMessage(prompt);

  // Combine into single prompt for Google
  const parts: string[] = [];
  if (contextMessage) parts.push(contextMessage);
  parts.push(promptMessage);
  const combinedPrompt = parts.join('\n\n');

  // Build conversation contents - either simple prompt or multi-turn with tool results
  type ContentPart = { text: string } | { functionCall: { name: string; args: Record<string, unknown> } } | { functionResponse: { name: string; response: unknown } };
  type Content = { role: 'user' | 'model'; parts: ContentPart[] };

  let contents: string | Content[];

  if (previousToolCalls?.length && toolResults?.length) {
    // Multi-turn conversation with tool results
    // 1. Original user message
    const userMessage: Content = {
      role: 'user',
      parts: [{ text: combinedPrompt }],
    };

    // 2. Model message with function calls (including thoughtSignature for Gemini 3)
    const modelParts: ContentPart[] = previousToolCalls.map(call => {
      const part: ContentPart = {
        functionCall: {
          name: call.toolName,
          args: call.args,
        },
      };
      // Include thoughtSignature if present (required for Gemini 3)
      if (call.thoughtSignature) {
        (part as Record<string, unknown>).thoughtSignature = call.thoughtSignature;
      }
      return part;
    });
    const modelMessage: Content = {
      role: 'model',
      parts: modelParts,
    };

    // 3. User message with function responses (only for matching tool calls)
    const toolCallMap = new Map(previousToolCalls.map(c => [c.id, c]));
    const responseParts: ContentPart[] = toolResults
      .filter(result => toolCallMap.has(result.toolCallId))
      .map(result => ({
        functionResponse: {
          name: toolCallMap.get(result.toolCallId)!.toolName,
          response: result.error
            ? { error: result.error }
            : { result: result.result },
        },
      }));
    const responseMessage: Content = {
      role: 'user',
      parts: responseParts,
    };

    contents = [userMessage, modelMessage, responseMessage];

    // Add follow-up message if present (e.g., error about missing return fields)
    if (request.followUpMessage) {
      contents.push({ role: 'user', parts: [{ text: request.followUpMessage }] });
    }
  } else if (request.followUpMessage) {
    // No previous tool calls but has follow-up message (e.g., retry asking AI to call tools)
    contents = [
      { role: 'user' as const, parts: [{ text: combinedPrompt }] },
      { role: 'user' as const, parts: [{ text: request.followUpMessage }] },
    ];
  } else {
    // Simple single prompt
    contents = combinedPrompt;
  }

  try {
    // Build generation config
    const generationConfig: Record<string, unknown> = {};

    // Add thinking config if level specified
    const thinkingLevel = model.thinkingLevel as ThinkingLevel | undefined;
    const googleThinkingLevel = thinkingLevel ? getGoogleThinkingLevel(model.name, thinkingLevel) : null;
    if (googleThinkingLevel) {
      generationConfig.thinkingConfig = {
        thinkingLevel: googleThinkingLevel,
      };
    }

    // Build config with optional tools
    const config: Record<string, unknown> = {
      systemInstruction,
      ...generationConfig,
    };

    // Add tools if provided
    if (tools?.length) {
      config.tools = [{ functionDeclarations: toGoogleFunctionDeclarations(tools) }];
    }

    // Add Google Search tool if configured via serverTools
    const webSearch = model.serverTools?.webSearch;
    if (webSearch) {
      const googleSearchTool: Record<string, unknown> = { googleSearch: {} };
      if (typeof webSearch === 'object' && webSearch.excludeDomains?.length) {
        googleSearchTool.googleSearch = { excludeDomains: webSearch.excludeDomains };
      }
      const existingTools = (config.tools as unknown[]) ?? [];
      config.tools = [...existingTools, googleSearchTool];
    }

    // Make API request
    // Cast contents to unknown to avoid strict SDK type checking (we build valid content)
    const response = await client.models.generateContent({
      model: model.name,
      contents: contents as unknown as Parameters<typeof client.models.generateContent>[0]['contents'],
      config,
    });

    // Extract text content
    const content = response.text ?? '';

    // Extract function calls from response parts (including thoughtSignature for Gemini 3)
    const responseParts = (response.candidates?.[0]?.content?.parts ?? []) as Array<{
      text?: string;
      functionCall?: { name: string; args: Record<string, unknown> };
      thoughtSignature?: string;
    }>;
    const functionCallParts = responseParts.filter((p) => p.functionCall);
    let toolCalls: AIToolCall[] | undefined;
    if (functionCallParts.length > 0) {
      toolCalls = functionCallParts.map((p) => ({
        id: generateToolCallId(),
        toolName: p.functionCall!.name,
        args: p.functionCall!.args,
        thoughtSignature: p.thoughtSignature,
      }));
    }

    // Debug: if we found no tool calls, check if there are functionCall keys we somehow missed
    if (!toolCalls?.length) {
      const missedCalls = responseParts.filter((p) => 'functionCall' in p);
      if (missedCalls.length > 0) {
        console.warn(`[google] Found ${missedCalls.length} part(s) with 'functionCall' key but filter returned 0. ` +
          `Part details: ${JSON.stringify(missedCalls.map(p => ({ keys: Object.keys(p), fcTruthy: !!p.functionCall, fcType: typeof p.functionCall, fcValue: p.functionCall })))}`);
      }
    }



    // Determine stop reason
    const finishReason = response.candidates?.[0]?.finishReason as string | undefined;
    const stopReason =
      finishReason === 'STOP'
        ? (toolCalls?.length ? 'tool_use' : 'end')
        : finishReason === 'MAX_TOKENS'
          ? 'length'
          : finishReason === 'SAFETY'
            ? 'content_filter'
            : 'end';

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

    // For text responses, parsedValue is just the content
    // For typed responses, the value comes from return tool calls (handled by tool-loop)
    const rawResponse = JSON.stringify({
      candidates: response.candidates,
      usageMetadata: response.usageMetadata,
    }, null, 2);
    return { content, parsedValue: content, usage, toolCalls, stopReason, rawResponse };
  } catch (error) {
    // Handle Google API errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      const isRetryable =
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('500') ||
        message.includes('503') ||
        message.includes('service unavailable') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('socket hang up');

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
