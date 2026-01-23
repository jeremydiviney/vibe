// Unified AI Context System
// Single source of truth for what gets sent to AI models and logged
//
// Architecture:
//   buildAIContext(state) → AIContext (structured)
//        ↓                      ↓
//   formatForProvider()    formatForLog()
//        ↓                      ↓
//   Provider API call      Human-readable log

import type { ContextEntry } from '../types';
import type { ToolSchema } from '../tools/types';
import type { TargetType, ModelConfig } from './types';
import { formatContextForAI } from '../context';
// Import formatters for consistent message building
import {
  buildSystemMessage as buildSystemMessageImpl,
  buildToolSystemMessage as buildToolSystemMessageImpl,
  buildPromptMessage as buildPromptMessageImpl,
} from './formatters';

/**
 * Message in the AI conversation.
 * Represents a single message sent to or received from the model.
 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** For assistant messages with tool calls */
  toolCalls?: Array<{
    id: string;
    toolName: string;
    args: Record<string, unknown>;
  }>;
  /** For user messages with tool results */
  toolResults?: Array<{
    toolCallId: string;
    result?: unknown;
    error?: string;
  }>;
}

/**
 * Complete AI context for a single interaction.
 * This is the single source of truth for:
 * - What gets sent to the AI model
 * - What gets logged for debugging
 */
export interface AIContext {
  /** Operation type */
  operationType: 'do' | 'vibe';

  /** Model being used */
  model: ModelConfig;

  /** Target type for response parsing */
  targetType: TargetType;

  /** Available tools (if any) */
  tools?: ToolSchema[];

  /** The complete message sequence to send to the model */
  messages: AIMessage[];

  /** Structured execution context (for detailed logging) */
  executionContext: ContextEntry[];
}

/**
 * Build the complete AI context from pre-built context entries.
 * This is the SINGLE SOURCE OF TRUTH for what gets sent to the model.
 * Context entries should be built with buildLocalContext (function scope only).
 */
export function buildAIContext(
  contextEntries: ContextEntry[],
  operationType: 'do' | 'vibe',
  model: ModelConfig,
  prompt: string,
  targetType: TargetType,
  tools?: ToolSchema[],
  previousToolCalls?: Array<{ id: string; toolName: string; args: Record<string, unknown> }>,
  toolResults?: Array<{ toolCallId: string; result?: unknown; error?: string }>
): AIContext {
  // Format the provided context entries
  const executionContext = contextEntries;
  const formattedContext = formatContextForAI(executionContext);

  // Build the message sequence
  const messages: AIMessage[] = [];

  // 1. System message
  messages.push({
    role: 'system',
    content: buildSystemMessage(),
  });

  // 2. Tool system message (if tools available)
  if (tools && tools.length > 0) {
    messages.push({
      role: 'system',
      content: buildToolSystemMessage(tools),
    });
  }

  // 3. Context message (if there's execution context)
  if (formattedContext.text) {
    messages.push({
      role: 'user',
      content: `Here is the current program context:\n\n${formattedContext.text}`,
    });
  }

  // 4. Current prompt
  messages.push({
    role: 'user',
    content: buildPromptMessage(prompt, targetType),
  });

  // 5. Previous tool calls and results (for multi-turn)
  if (previousToolCalls?.length && toolResults?.length) {
    messages.push({
      role: 'assistant',
      content: '', // Content comes from tool calls
      toolCalls: previousToolCalls,
    });
    messages.push({
      role: 'user',
      content: '', // Content comes from tool results
      toolResults: toolResults,
    });
  }

  return {
    operationType,
    model,
    targetType,
    tools,
    messages,
    executionContext,
  };
}

/**
 * Build the base system message.
 * Delegates to formatters.ts for consistent formatting.
 */
function buildSystemMessage(): string {
  return buildSystemMessageImpl();
}

/**
 * Build the tool system message describing available tools.
 * Delegates to formatters.ts for consistent formatting.
 */
function buildToolSystemMessage(tools: ToolSchema[]): string {
  return buildToolSystemMessageImpl(tools) ?? '';
}

/**
 * Build the prompt message with type instructions if needed.
 * Delegates to formatters.ts for consistent formatting.
 */
function buildPromptMessage(prompt: string, _targetType: TargetType): string {
  return buildPromptMessageImpl(prompt);
}

// Re-export formatters for backward compatibility
export { buildSystemMessage, buildToolSystemMessage, buildPromptMessage };
