// AI operations: vibe expression and execution

import * as AST from '../../ast';
import type { RuntimeState } from '../types';
import { currentFrame } from '../state';

/**
 * Extract model name from expression (must be an identifier).
 */
export function extractModelName(expr: AST.Expression): string {
  if (expr.type === 'Identifier') return expr.name;
  throw new Error('Model must be an identifier');
}

/**
 * Vibe expression - push instructions for AI call.
 */
export function execVibeExpression(state: RuntimeState, expr: AST.VibeExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.prompt, location: expr.prompt.location },
      { op: 'ai_vibe', model: extractModelName(expr.model), context: expr.context, location: expr.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Get context data for AI based on context specifier.
 */
export function getContextForAI(state: RuntimeState, context: AST.ContextSpecifier): unknown[] {
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
 * AI Vibe - pause for AI response.
 * Note: The prompt is added to orderedEntries in resumeWithAIResponse (after completion),
 * not here, so it doesn't appear in context before the AI call completes.
 */
export function execAIVibe(state: RuntimeState, model: string, context: AST.ContextSpecifier): RuntimeState {
  const prompt = String(state.lastResult);
  const contextData = getContextForAI(state, context);

  return {
    ...state,
    status: 'awaiting_ai',
    pendingAI: {
      type: 'vibe',
      prompt,
      model,
      context: contextData,
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ai_vibe_request',
        details: { prompt, model, contextKind: context.kind },
      },
    ],
  };
}
