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
import { buildVibeMessages, type VibeScopeParam } from './ai/formatters';

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
      // For vibe expressions, generate Vibe code using scope parameters
      const state = getState();
      if (!state.pendingAI) {
        throw new Error('No pending AI request');
      }

      const modelName = state.pendingAI.model;
      if (modelName === 'default') {
        throw new Error('Vibe expressions require a model to be specified');
      }

      const modelValue = getModelValue(state, modelName);
      if (!modelValue) {
        throw new Error(`Model '${modelName}' not found in scope`);
      }

      // Build model config
      const model = buildModelConfig(modelValue);

      // Get scope parameters for vibe code generation
      const scopeParams: VibeScopeParam[] = state.pendingAI.vibeScopeParams ?? [];

      // Build vibe-specific messages with specialized system prompt
      const vibeMessages = buildVibeMessages(prompt, scopeParams);

      // Build the request for code generation (no tools, no structured output)
      const request: AIRequest = {
        operationType: 'vibe',
        prompt,
        contextText: '',  // Context is embedded in the vibe system prompt
        targetType: null, // Raw text response expected
        model,
        // Override messages with vibe-specific format
      };

      // Get provider executor
      const execute = getProviderExecutor(model.provider!);

      // Execute directly without tool loop (vibe generates code, not tool calls)
      const maxRetries = modelValue.maxRetriesOnError ?? 3;
      const response = await withRetry(() => execute(request), { maxRetries });

      // Log messages for debugging
      const messages: AILogMessage[] = vibeMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      return {
        value: String(response.content),
        usage: response.usage,
        // Include vibe messages for logging
        messages,
        executionContext: [],  // Vibe doesn't use execution context
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
