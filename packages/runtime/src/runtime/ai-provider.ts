// Real AI Provider Implementation
// Uses the AI module to make actual API calls

import type { AIProvider, AIExecutionResult } from './index';
import type { RuntimeState, AILogMessage, PromptToolCall } from './types';
import type { VibeModelValue, TargetType, AIRequest, ModelConfig, AIProviderType, ServerToolsConfig } from './ai';
import type { VibeToolValue, ToolSchema } from './tools/types';
import { detectProvider, getProviderExecutor, buildAIRequest } from './ai';
import { withRetry } from './ai/retry';
import { executeWithTools, type ToolRoundResult } from './ai/tool-loop';
import { buildLocalContext, formatContextForAI } from './context';
import { buildAIContext } from './ai/context';
import { buildVibeMessages, type VibeScopeParam } from './ai/formatters';
import {
  getReturnTools,
  shouldUseReturnTool,
  isReturnToolCall,
  buildReturnInstruction,
  collectAndValidateFieldResults,
  isFieldReturnResult,
  RETURN_TOOL_PREFIX,
} from './ai/return-tools';
import type { ExpectedField } from './types';
import { RuntimeError } from '../errors';
import { resolveTypeDefinition } from './modules/loader';

/**
 * Get model value from runtime state by model name.
 */
function getModelValue(state: RuntimeState, modelName: string): VibeModelValue | null {
  // Search through all frames for the model
  for (let i = state.callStack.length - 1; i >= 0; i--) {
    const frame = state.callStack[i];
    const variable = frame.locals[modelName];
    if (variable?.vibeType === 'model' && variable.value) {
      return variable.value as VibeModelValue;
    }
  }
  return null;
}


/**
 * Get target type from the pending variable declaration context.
 * Returns null if not in a variable declaration or no type annotation.
 * Returns the type string which may be a built-in type or a structural type name.
 */
function getTargetType(state: RuntimeState): TargetType | string | null {
  // Look at the next instruction to see if we're assigning to a typed variable
  const nextInstruction = state.instructionStack[0];
  if (nextInstruction?.op === 'declare_var' && nextInstruction.type) {
    return nextInstruction.type;
  }
  return null;
}

/**
 * Check if a type is a built-in Vibe type that the AI module understands.
 */
function isBuiltInType(type: string | null): type is TargetType {
  if (!type) return false;
  return ['text', 'json', 'boolean', 'number'].includes(type) || type.endsWith('[]');
}

/**
 * Convert a StructuralType to an array of ExpectedField.
 * Recursively handles nested types and type references.
 * @param structure The structural type to convert
 * @param state RuntimeState for resolving type references (including imports)
 */
function structuralTypeToExpectedFields(
  structure: import('../ast').StructuralType,
  state: RuntimeState
): ExpectedField[] {
  return structure.fields.map((field) => {
    // Handle inline nested objects
    if (field.nestedType) {
      return {
        name: field.name,
        type: 'json' as const,  // Nested objects are json at runtime
        nestedFields: structuralTypeToExpectedFields(field.nestedType, state),
      };
    }

    // Handle array of named types
    if (field.type.endsWith('[]')) {
      const baseType = field.type.slice(0, -2);
      const referencedType = resolveTypeDefinition(state, baseType);
      if (referencedType) {
        // Array of structural type - each element should match the structure
        return {
          name: field.name,
          type: 'json[]' as const,
          nestedFields: structuralTypeToExpectedFields(referencedType, state),
        };
      }
      // Array of built-in type
      return { name: field.name, type: field.type as ExpectedField['type'] };
    }

    // Handle named type reference
    const referencedType = resolveTypeDefinition(state, field.type);
    if (referencedType) {
      return {
        name: field.name,
        type: 'json' as const,
        nestedFields: structuralTypeToExpectedFields(referencedType, state),
      };
    }

    // Built-in type
    return { name: field.name, type: field.type as ExpectedField['type'] };
  });
}

/** Default thinking level when not specified */
const DEFAULT_THINKING_LEVEL = 'medium';

/**
 * Build model config from runtime model value.
 */
function buildModelConfig(modelValue: VibeModelValue): ModelConfig {
  if (!modelValue.name) {
    throw new RuntimeError('Model name is required');
  }
  if (!modelValue.apiKey) {
    throw new RuntimeError('API key is required');
  }

  const provider: AIProviderType =
    (modelValue.provider as AIProviderType) ?? detectProvider(modelValue.url);

  // Normalize raw serverTools value into ServerToolsConfig
  let serverTools: ServerToolsConfig | undefined;
  if (modelValue.serverTools && typeof modelValue.serverTools === 'object') {
    const raw = modelValue.serverTools as Record<string, unknown>;
    if (raw.webSearch !== undefined) {
      serverTools = {
        webSearch: raw.webSearch as ServerToolsConfig['webSearch'],
      };
    }
  }

  return {
    name: modelValue.name,
    apiKey: modelValue.apiKey,
    url: modelValue.url,
    provider,
    maxRetriesOnError: modelValue.maxRetriesOnError ?? undefined,
    thinkingLevel: (modelValue.thinkingLevel as ModelConfig['thinkingLevel']) ?? DEFAULT_THINKING_LEVEL,
    serverTools,
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

      // Get model name from pendingAI or pendingCompress
      let modelName: string;
      let aiType: 'do' | 'vibe' | 'compress';
      if (state.pendingAI) {
        modelName = state.pendingAI.model;
        aiType = state.pendingAI.type;
      } else if (state.pendingCompress) {
        modelName = state.pendingCompress.model;
        aiType = 'compress';
      } else {
        throw new Error('No pending AI or compress request');
      }
      const modelValue = getModelValue(state, modelName);
      if (!modelValue) {
        const location = state.pendingAI?.location ?? state.pendingCompress?.location;
        throw new RuntimeError(`Model '${modelName}' not found in scope`, location);
      }

      // Determine target type from pending variable declaration
      const targetType = getTargetType(state);

      // Build model config
      const model = buildModelConfig(modelValue);

      // Get tools from model (empty array if no tools specified)
      const modelTools: VibeToolValue[] = (modelValue.tools as VibeToolValue[]) ?? [];

      // Always include return tools (keeps tool list consistent for caching)
      const returnTools = getReturnTools();
      const allTools = [...returnTools, ...modelTools];
      const toolSchemas: ToolSchema[] = allTools.map((t) => t.schema);

      // Build expected fields for return validation
      // Priority: 1) pendingDestructuring (multi-value), 2) targetType (single-value)
      let expectedFields: ExpectedField[] | null = null;
      if (state.pendingDestructuring) {
        // Multi-value destructuring: const {name: text, age: number} = do "..."
        expectedFields = state.pendingDestructuring.map((f) => ({ name: f.name, type: f.type }));
      } else if (targetType) {
        // Check if it's a built-in type
        if (isBuiltInType(targetType)) {
          // Single-value typed return: const x: number = do "..."
          expectedFields = [{ name: 'value', type: targetType }];
        } else {
          // Check if it's a structural type (local or imported)
          const structuralType = resolveTypeDefinition(state, targetType);
          if (structuralType) {
            // Structural type return: const result: MyType = do "..."
            // Convert structure to expected fields
            expectedFields = structuralTypeToExpectedFields(structuralType, state);
          }
        }
      }

      // Determine if this request should use tool-based return
      const useToolReturn = expectedFields !== null && expectedFields.length > 0;
      const returnToolName = useToolReturn ? RETURN_TOOL_PREFIX : null;

      // Append return instruction to prompt if we have expected fields
      const finalPrompt = expectedFields
        ? prompt + buildReturnInstruction(expectedFields)
        : prompt;

      // Build context from local frame (current function's params/variables only)
      const context = buildLocalContext(state);

      // For compress, treat as single-round 'do' type
      const requestType = aiType === 'compress' ? 'do' : aiType;

      // Build unified AI context (single source of truth for messages and logging)
      const aiContext = buildAIContext(
        context,
        requestType,
        model,
        finalPrompt,
        // For tool-based returns, pass null to disable structured output
        useToolReturn ? null : targetType,
        toolSchemas.length > 0 ? toolSchemas : undefined
      );

      // Format context for the request
      const formattedContext = formatContextForAI(context);

      const request: AIRequest = {
        ...buildAIRequest(
          model,
          finalPrompt,
          formattedContext.text,
          requestType,
          // For tool-based returns, pass null to disable structured output
          useToolReturn ? null : targetType
        ),
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      };

      // Get provider executor (provider is always defined after buildModelConfig)
      const execute = getProviderExecutor(model.provider!);

      // Execute with tool loop (handles multi-turn tool calling)
      // 'do' with return tool = allow retries for missing fields (maxRounds: 3)
      // 'do' without return tool = single round (maxRounds: 1)
      // 'vibe' = multi-turn (maxRounds: 10)
      const maxRetries = modelValue.maxRetriesOnError ?? 3;
      const isDo = aiType === 'do' || aiType === 'compress';
      const expectedFieldNames = expectedFields?.map(f => f.name);
      const { response, rounds, returnFieldResults, completedViaReturnTool, retryAttempts } = await executeWithTools(
        request,
        allTools,
        state.rootDir,
        (req) => withRetry(() => execute(req), { maxRetries }),
        {
          maxRounds: isDo ? (useToolReturn ? 3 : 1) : 10,
          expectedReturnTool: returnToolName ?? undefined,
          expectedFieldNames,
        }
      );

      // Convert tool rounds to PromptToolCall format for logging
      const interactionToolCalls: PromptToolCall[] = rounds.flatMap((round) =>
        round.toolCalls
          .map((call) => {
            const result = round.results.find((r) => r.toolCallId === call.id);
            return {
              toolName: call.toolName,
              args: call.args,
              result: result?.result,
              error: result?.error,
            };
          })
      );

      // Determine final value
      const location = state.pendingAI?.location ?? state.pendingCompress?.location;
      // Build AI log context for error reporting (so context files have content even on failure)
      const aiLogContext = {
        messages: aiContext.messages,
        response: response.content,
        rawResponse: response.rawResponse,
        toolRounds: rounds.length > 0 ? rounds : undefined,
        retryAttempts,
      };
      let finalValue: unknown;
      if (useToolReturn) {
        if (completedViaReturnTool && returnFieldResults) {
          // Filter and validate field return results
          const fieldResults = returnFieldResults.filter(isFieldReturnResult);
          if (fieldResults.length === 0) {
            throw new RuntimeError('No valid field return results from AI', location, undefined, { __aiLogContext: aiLogContext });
          }
          // Validate and collect all fields
          try {
            const validated = collectAndValidateFieldResults(fieldResults, expectedFields!);
            // For single-value returns (e.g., `const x: number = do "..."`),
            // expectedFields is [{name: 'value', type: 'number'}] - extract the value.
            // For structural types or destructuring, keep the full object.
            const isSingleValueReturn = !state.pendingDestructuring
              && expectedFields!.length === 1
              && expectedFields![0].name === 'value';
            finalValue = isSingleValueReturn ? validated['value'] : validated;
          } catch (e) {
            // Wrap validation errors with source location
            throw new RuntimeError(e instanceof Error ? e.message : String(e), location, undefined, { __aiLogContext: aiLogContext });
          }
        } else {
          // After max retries, AI still didn't call return tool
          throw new RuntimeError(`AI failed to call return tools after multiple attempts`, location, undefined, { __aiLogContext: aiLogContext });
        }
      } else {
        // Check if model used return tool anyway (even when not expected)
        // This can happen since return tools are always included for caching
        if (completedViaReturnTool && returnFieldResults) {
          const fieldResults = returnFieldResults.filter(isFieldReturnResult);
          if (fieldResults.length > 0) {
            // Model used return tool - extract value from it
            // Take the first field result's value (typically 'value' field)
            finalValue = fieldResults[0].value;
          } else {
            finalValue = response.parsedValue ?? response.content;
          }
        } else {
          finalValue = response.parsedValue ?? response.content;
        }
      }

      // Return the parsed value, usage, tool rounds, and context for logging
      return {
        value: finalValue,
        textContent: response.content || undefined,  // Plain text output from AI
        usage: response.usage,
        toolRounds: rounds.length > 0 ? rounds : undefined,
        retryAttempts,
        rawResponse: response.rawResponse,
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
        const location = state.pendingAI?.location;
        throw new RuntimeError(`Model '${modelName}' not found in scope`, location);
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
        textContent: response.content || undefined,  // Same as value for vibe
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
