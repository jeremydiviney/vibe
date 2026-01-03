// Real AI Provider Implementation
// Uses the AI module to make actual API calls

import type { AIProvider, AIExecutionResult } from './index';
import type { RuntimeState, AILogMessage, PromptToolCall } from './types';
import type { VibeModelValue, TargetType, AIRequest, ModelConfig, AIProviderType } from './ai';
import type { VibeToolValue, ToolSchema } from './tools/types';
import { detectProvider, getProviderExecutor, buildAIRequest } from './ai';
import { withRetry } from './ai/retry';
import { executeWithTools, type ToolRoundResult } from './ai/tool-loop';
import { buildGlobalContext, formatContextForAI } from './context';
import { buildAIContext } from './ai/context';

/**
 * Get model value from runtime state by model name.
 */
function getModelValue(state: RuntimeState, modelName: string): VibeModelValue | null {
  // Search through all frames for the model
  for (let i = state.callStack.length - 1; i >= 0; i--) {
    const frame = state.callStack[i];
    const variable = frame.locals[modelName];
    if (variable?.value && isModelValue(variable.value)) {
      return variable.value;
    }
  }
  return null;
}

/**
 * Type guard for model values.
 */
function isModelValue(value: unknown): value is VibeModelValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__vibeModel' in value &&
    (value as VibeModelValue).__vibeModel === true
  );
}

/**
 * Get target type from the pending variable declaration context.
 * Returns null if not in a variable declaration or no type annotation.
 */
function getTargetType(state: RuntimeState): TargetType {
  // Look at the next instruction to see if we're assigning to a typed variable
  const nextInstruction = state.instructionStack[0];
  if (nextInstruction?.op === 'declare_var' && nextInstruction.type) {
    const type = nextInstruction.type;
    // Only return types that the AI module understands
    if (['text', 'json', 'boolean', 'number'].includes(type) || type.endsWith('[]')) {
      return type as TargetType;
    }
  }
  return null;
}

/**
 * Build model config from runtime model value.
 */
function buildModelConfig(modelValue: VibeModelValue): ModelConfig {
  if (!modelValue.name) {
    throw new Error('Model name is required');
  }
  if (!modelValue.apiKey) {
    throw new Error('API key is required');
  }

  const provider: AIProviderType =
    (modelValue.provider as AIProviderType) ?? detectProvider(modelValue.url);

  return {
    name: modelValue.name,
    apiKey: modelValue.apiKey,
    url: modelValue.url,
    provider,
    maxRetriesOnError: modelValue.maxRetriesOnError ?? undefined,
  };
}

/**
 * Create a real AI provider that uses actual API calls.
 * The provider needs access to runtime state to get model configs.
 */
export function createRealAIProvider(getState: () => RuntimeState): AIProvider {
  return {
    async execute(prompt: string): Promise<AIExecutionResult> {
      const state = getState();
      if (!state.pendingAI) {
        throw new Error('No pending AI request');
      }

      const modelName = state.pendingAI.model;
      const modelValue = getModelValue(state, modelName);
      if (!modelValue) {
        throw new Error(`Model '${modelName}' not found in scope`);
      }

      // Determine target type from pending variable declaration
      const targetType = getTargetType(state);

      // Build model config
      const model = buildModelConfig(modelValue);

      // Get tools from model (empty array if no tools specified)
      const modelTools: VibeToolValue[] = (modelValue.tools as VibeToolValue[]) ?? [];
      const toolSchemas: ToolSchema[] = modelTools.map(t => t.schema);

      // Build unified AI context (single source of truth)
      const aiContext = buildAIContext(
        state,
        model,
        prompt,
        targetType,
        toolSchemas.length > 0 ? toolSchemas : undefined
      );

      // Build context from global context for the request
      const context = buildGlobalContext(state);
      const formattedContext = formatContextForAI(context);

      // Build the request with tools
      const request: AIRequest = {
        ...buildAIRequest(model, prompt, formattedContext.text, state.pendingAI.type, targetType),
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      };

      // Get provider executor (provider is always defined after buildModelConfig)
      const execute = getProviderExecutor(model.provider!);

      // Execute with tool loop (handles multi-turn tool calling)
      const maxRetries = modelValue.maxRetriesOnError ?? 3;
      const { response, rounds } = await executeWithTools(
        request,
        modelTools,
        state.rootDir,
        (req) => withRetry(() => execute(req), { maxRetries }),
        { maxRounds: 10 }
      );

      // Convert tool rounds to PromptToolCall format for logging
      const interactionToolCalls: PromptToolCall[] = rounds.flatMap(round =>
        round.toolCalls.map((call, i) => {
          const result = round.results[i];
          return {
            toolName: call.toolName,
            args: call.args,
            result: result?.result,
            error: result?.error,
          };
        })
      );

      // Return the parsed value, usage, tool rounds, and context for logging
      return {
        value: response.parsedValue ?? response.content,
        usage: response.usage,
        toolRounds: rounds.length > 0 ? rounds : undefined,
        // Context for logging (single source of truth)
        messages: aiContext.messages,
        executionContext: aiContext.executionContext,
        interactionToolCalls: interactionToolCalls.length > 0 ? interactionToolCalls : undefined,
      };
    },

    async generateCode(prompt: string): Promise<AIExecutionResult> {
      // For vibe expressions, use default model or first available model
      const state = getState();
      if (!state.pendingAI) {
        throw new Error('No pending AI request');
      }

      // For vibe, we might need a default model - for now just error if not found
      const modelName = state.pendingAI.model;
      if (modelName === 'default') {
        throw new Error('Vibe expressions require a configured default model');
      }

      const modelValue = getModelValue(state, modelName);
      if (!modelValue) {
        throw new Error(`Model '${modelName}' not found in scope`);
      }

      // Build model config
      const model = buildModelConfig(modelValue);

      // Get tools from model (empty array if no tools specified)
      const modelTools: VibeToolValue[] = (modelValue.tools as VibeToolValue[]) ?? [];
      const toolSchemas: ToolSchema[] = modelTools.map(t => t.schema);

      // Build unified AI context (single source of truth)
      const aiContext = buildAIContext(
        state,
        model,
        prompt,
        'text',
        toolSchemas.length > 0 ? toolSchemas : undefined
      );

      // Build context for the request
      const context = buildGlobalContext(state);
      const formattedContext = formatContextForAI(context);

      // Build the request with tools
      const request: AIRequest = {
        ...buildAIRequest(model, prompt, formattedContext.text, 'vibe', 'text'),
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      };

      // Get provider executor (provider is always defined after buildModelConfig)
      const execute = getProviderExecutor(model.provider!);

      // Execute with tool loop (handles multi-turn tool calling)
      const maxRetries = modelValue.maxRetriesOnError ?? 3;
      const { response, rounds } = await executeWithTools(
        request,
        modelTools,
        state.rootDir,
        (req) => withRetry(() => execute(req), { maxRetries }),
        { maxRounds: 10 }
      );

      // Convert tool rounds to PromptToolCall format for logging
      const interactionToolCalls: PromptToolCall[] = rounds.flatMap(round =>
        round.toolCalls.map((call, i) => {
          const result = round.results[i];
          return {
            toolName: call.toolName,
            args: call.args,
            result: result?.result,
            error: result?.error,
          };
        })
      );

      return {
        value: String(response.content),
        usage: response.usage,
        toolRounds: rounds.length > 0 ? rounds : undefined,
        // Context for logging (single source of truth)
        messages: aiContext.messages,
        executionContext: aiContext.executionContext,
        interactionToolCalls: interactionToolCalls.length > 0 ? interactionToolCalls : undefined,
      };
    },

    async askUser(prompt: string): Promise<string> {
      // For user input, we could integrate with readline or similar
      // For now, throw to indicate this needs external handling
      throw new Error(
        'User input not implemented. Use an external handler for awaiting_user state.'
      );
    },
  };
}

/**
 * A mock AI provider for testing (returns prompt as response).
 */
export function createMockAIProvider(): AIProvider {
  return {
    async execute(prompt: string): Promise<AIExecutionResult> {
      return { value: `[AI Response to: ${prompt}]` };
    },
    async generateCode(prompt: string): Promise<AIExecutionResult> {
      return { value: `// Generated code for: ${prompt}` };
    },
    async askUser(prompt: string): Promise<string> {
      return `[User input for: ${prompt}]`;
    },
  };
}
