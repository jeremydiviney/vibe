// AI operations: vibe expression and execution

import * as AST from '../../ast';
import type { RuntimeState } from '../types';
import type { SourceLocation } from '../../errors';
import { resolveValue } from '../types';
import { currentFrame } from '../state';
import { scheduleAsyncOperation, isInAsyncContext } from '../async/scheduling';

/**
 * Extract model name from expression (must be an identifier), or null if not provided.
 */
export function extractModelName(expr: AST.Expression | null): string | null {
  if (expr === null) return null;
  if (expr.type === 'Identifier') return expr.name;
  throw new Error('Model must be an identifier');
}

/**
 * Vibe/Do expression - push instructions for AI call.
 * operationType determines tool loop behavior: 'vibe' = multi-turn, 'do' = single round.
 * Sets inPromptContext flag so string literals use prompt interpolation semantics.
 */
export function execVibeExpression(state: RuntimeState, expr: AST.VibeExpression): RuntimeState {
  return {
    ...state,
    inPromptContext: true,  // Prompt string interpolation mode
    instructionStack: [
      { op: 'exec_expression', expr: expr.prompt, location: expr.prompt.location },
      { op: 'clear_prompt_context', location: expr.location },  // Clear flag after prompt eval
      { op: 'ai_vibe', model: extractModelName(expr.model), context: expr.context, operationType: expr.operationType, location: expr.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Get context data for AI based on context specifier.
 * If context is null, defaults to 'default' (full execution history).
 */
export function getContextForAI(state: RuntimeState, context: AST.ContextSpecifier | null): unknown[] {
  // Default to full execution history if no context specified
  if (context === null) {
    return state.executionLog;
  }

  switch (context.kind) {
    case 'local':
      // Current frame's execution log only
      return state.executionLog.filter((_, i) => {
        // Filter to just recent entries (simplified - could be smarter)
        return i >= state.executionLog.length - 10;
      });

    case 'default':
      // All execution history
      return state.executionLog;

    case 'variable':
      // Use variable value as context
      if (context.variable) {
        const frame = currentFrame(state);
        const variable = frame.locals[context.variable];
        if (variable && Array.isArray(variable.value)) {
          return variable.value as unknown[];
        }
      }
      return [];

    default:
      return state.executionLog;
  }
}

/**
 * AI Vibe/Do - pause for AI response.
 * Note: The prompt is added to orderedEntries in resumeWithAIResponse (after completion),
 * not here, so it doesn't appear in context before the AI call completes.
 *
 * If model is null, uses lastUsedModel from state.
 * If context is null, defaults to 'default' (full execution history).
 *
 * When asyncContext is set (async declaration), schedules the operation
 * for non-blocking execution instead of pausing.
 */
export function execAIVibe(state: RuntimeState, model: string | null, context: AST.ContextSpecifier | null, operationType: 'do' | 'vibe', location?: SourceLocation): RuntimeState {
  // Unwrap VibeValue if needed before converting to string
  const prompt = String(resolveValue(state.lastResult));

  // Resolve model: use provided model or fall back to lastUsedModel
  const resolvedModel = model ?? state.lastUsedModel;
  if (!resolvedModel) {
    throw new Error('No model specified and no previous model has been used. Please specify a model.');
  }

  const contextData = getContextForAI(state, context);
  const contextKind = context?.kind ?? 'default';

  // Check if we're in async context (variable, destructuring, or fire-and-forget)
  if (isInAsyncContext(state)) {
    // Schedule for non-blocking execution using shared helper
    const newState = scheduleAsyncOperation(
      state,
      {
        type: operationType,
        prompt,
        model: resolvedModel,
        context: contextData,
        operationType,
      },
      `async_${operationType}_scheduled`
    );
    // AI operations also update lastUsedModel
    return { ...newState, lastUsedModel: resolvedModel };
  }

  // Normal blocking execution
  return {
    ...state,
    status: 'awaiting_ai',
    // Update lastUsedModel for compress to use
    lastUsedModel: resolvedModel,
    pendingAI: {
      type: operationType,  // 'do' = single round, 'vibe' = multi-turn
      prompt,
      model: resolvedModel,
      context: contextData,
      location,
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: operationType === 'do' ? 'ai_do_request' : 'ai_vibe_request',
        details: { prompt, model: resolvedModel, contextKind },
      },
    ],
  };
}
