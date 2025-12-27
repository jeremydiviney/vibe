// AI operations: do, ask, vibe expressions and their execution

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
 * Do expression - push instructions for AI call.
 */
export function execDoExpression(state: RuntimeState, expr: AST.DoExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.prompt },
      { op: 'ai_do', model: extractModelName(expr.model), context: expr.context },
      ...state.instructionStack,
    ],
  };
}

/**
 * Ask expression - push instructions for user input.
 */
export function execAskExpression(state: RuntimeState, expr: AST.AskExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.prompt },
      { op: 'ai_ask', model: extractModelName(expr.model), context: expr.context },
      ...state.instructionStack,
    ],
  };
}

/**
 * Vibe expression - code generation with default context.
 */
export function execVibeExpression(state: RuntimeState, expr: AST.VibeExpression): RuntimeState {
  const defaultContext: AST.ContextSpecifier = {
    type: 'ContextSpecifier',
    kind: 'default',
    location: expr.location,
  };
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.prompt },
      { op: 'ai_vibe', model: 'default', context: defaultContext },
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
 * AI Do - pause for AI response.
 */
export function execAIDo(state: RuntimeState, model: string, context: AST.ContextSpecifier): RuntimeState {
  const prompt = String(state.lastResult);
  const contextData = getContextForAI(state, context);

  // Add prompt to ordered entries in current frame
  const frame = currentFrame(state);
  const newOrderedEntries = [...frame.orderedEntries, { kind: 'prompt' as const, aiType: 'do' as const, prompt }];

  return {
    ...state,
    status: 'awaiting_ai',
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, orderedEntries: newOrderedEntries },
    ],
    pendingAI: {
      type: 'do',
      prompt,
      model,
      context: contextData,
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ai_do_request',
        details: { prompt, model, contextKind: context.kind },
      },
    ],
  };
}

/**
 * AI Ask - pause for user input.
 */
export function execAIAsk(state: RuntimeState, model: string, context: AST.ContextSpecifier): RuntimeState {
  const prompt = String(state.lastResult);
  const contextData = getContextForAI(state, context);

  // Add prompt to ordered entries in current frame
  const frame = currentFrame(state);
  const newOrderedEntries = [...frame.orderedEntries, { kind: 'prompt' as const, aiType: 'ask' as const, prompt }];

  return {
    ...state,
    status: 'awaiting_user',
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, orderedEntries: newOrderedEntries },
    ],
    pendingAI: {
      type: 'ask',
      prompt,
      model,
      context: contextData,
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ai_ask_request',
        details: { prompt, model, contextKind: context.kind },
      },
    ],
  };
}

/**
 * AI Vibe - pause for code generation.
 */
export function execAIVibe(state: RuntimeState, model: string, context: AST.ContextSpecifier): RuntimeState {
  const prompt = String(state.lastResult);
  const contextData = getContextForAI(state, context);

  // Add prompt to ordered entries in current frame
  const frame = currentFrame(state);
  const newOrderedEntries = [...frame.orderedEntries, { kind: 'prompt' as const, aiType: 'vibe' as const, prompt }];

  return {
    ...state,
    status: 'awaiting_ai',
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, orderedEntries: newOrderedEntries },
    ],
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
