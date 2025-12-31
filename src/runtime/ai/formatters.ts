// Message formatting utilities for AI providers

import type { TargetType } from './types';
import { getTypeInstruction } from './schema';

/** Message structure for AI providers */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Build system message with Vibe processing instructions.
 */
export function buildSystemMessage(): string {
  return `You are an AI assistant integrated into the Vibe programming language runtime.
Your responses will be used programmatically in the execution flow.
Be concise and precise. Follow any type constraints exactly.
When context is provided, use it to inform your response.`;
}

/**
 * Build context message from formatted context text.
 * Returns null if context is empty.
 */
export function buildContextMessage(contextText: string): string | null {
  const trimmed = contextText.trim();
  if (!trimmed) return null;

  return `Here is the current program context:\n\n${trimmed}`;
}

/**
 * Build the prompt message with optional type instruction.
 * For providers without structured output support, appends type instruction.
 * For json/json[] types, always adds instruction since structured output can't enforce unknown schemas.
 */
export function buildPromptMessage(
  prompt: string,
  targetType: TargetType,
  supportsStructuredOutput: boolean
): string {
  if (!targetType) {
    return prompt;
  }

  // json/json[] types always need instruction - structured output can't handle unknown schemas
  const isJsonType = targetType === 'json' || targetType === 'json[]';

  // Skip type instruction if provider uses structured output (except for json types)
  if (supportsStructuredOutput && !isJsonType) {
    return prompt;
  }

  // Append type instruction
  const typeInstruction = getTypeInstruction(targetType);
  if (!typeInstruction) {
    return prompt;
  }

  return `${prompt}\n\n${typeInstruction}`;
}

/**
 * Build messages array for chat-style APIs (OpenAI, Anthropic).
 * Returns: [system, context?, prompt]
 */
export function buildMessages(
  prompt: string,
  contextText: string,
  targetType: TargetType,
  supportsStructuredOutput: boolean
): Message[] {
  const messages: Message[] = [
    { role: 'system', content: buildSystemMessage() },
  ];

  const contextMessage = buildContextMessage(contextText);
  if (contextMessage) {
    messages.push({ role: 'user', content: contextMessage });
  }

  const promptMessage = buildPromptMessage(prompt, targetType, supportsStructuredOutput);
  messages.push({ role: 'user', content: promptMessage });

  return messages;
}

/**
 * Extract text content from various API response formats.
 */
export function extractTextContent(response: unknown): string {
  // Anthropic format: { content: [{ type: "text", text: "..." }] }
  if (hasProperty(response, 'content') && Array.isArray(response.content)) {
    const textBlock = response.content.find(
      (block: unknown) => hasProperty(block, 'type') && block.type === 'text'
    );
    if (textBlock && hasProperty(textBlock, 'text')) {
      return String(textBlock.text);
    }
  }

  // OpenAI format: { choices: [{ message: { content: "..." } }] }
  if (hasProperty(response, 'choices') && Array.isArray(response.choices)) {
    const first = response.choices[0];
    if (hasProperty(first, 'message') && hasProperty(first.message, 'content')) {
      return String(first.message.content);
    }
  }

  // Google format: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  if (hasProperty(response, 'candidates') && Array.isArray(response.candidates)) {
    const first = response.candidates[0];
    if (hasProperty(first, 'content') && hasProperty(first.content, 'parts')) {
      const parts = first.content.parts as unknown[];
      const textPart = parts.find((p: unknown) => hasProperty(p, 'text'));
      if (textPart && hasProperty(textPart, 'text')) {
        return String(textPart.text);
      }
    }
  }

  throw new Error('Unable to extract text content from response');
}

/**
 * Type guard for checking if an object has a property.
 */
function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj;
}

/**
 * Extract usage information from various API response formats.
 */
export function extractUsage(
  response: unknown
): { inputTokens: number; outputTokens: number } | undefined {
  // Anthropic format: { usage: { input_tokens, output_tokens } }
  if (hasProperty(response, 'usage') && hasProperty(response.usage, 'input_tokens')) {
    return {
      inputTokens: Number(response.usage.input_tokens),
      outputTokens: Number(response.usage.output_tokens ?? 0),
    };
  }

  // OpenAI format: { usage: { prompt_tokens, completion_tokens } }
  if (hasProperty(response, 'usage') && hasProperty(response.usage, 'prompt_tokens')) {
    return {
      inputTokens: Number(response.usage.prompt_tokens),
      outputTokens: Number(response.usage.completion_tokens ?? 0),
    };
  }

  // Google format: { usageMetadata: { promptTokenCount, candidatesTokenCount } }
  if (hasProperty(response, 'usageMetadata')) {
    const meta = response.usageMetadata as Record<string, unknown>;
    return {
      inputTokens: Number(meta.promptTokenCount ?? 0),
      outputTokens: Number(meta.candidatesTokenCount ?? 0),
    };
  }

  return undefined;
}
