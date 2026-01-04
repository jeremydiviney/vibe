// AI operations: do, ask, vibe expressions and their execution

import * as AST from '../../ast';
import type { RuntimeState, ScopeParam } from '../types';
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
      { op: 'exec_expression', expr: expr.prompt, location: expr.prompt.location },
      { op: 'ai_do', model: extractModelName(expr.model), context: expr.context, location: expr.location },
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
      { op: 'exec_expression', expr: expr.prompt, location: expr.prompt.location },
      { op: 'ai_ask', model: extractModelName(expr.model), context: expr.context, location: expr.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Vibe expression - code generation that executes AI-generated Vibe code.
 * Syntax: vibe "prompt" model [cache]
 */
export function execVibeExpression(state: RuntimeState, expr: AST.VibeExpression): RuntimeState {
  const modelName = extractModelName(expr.model);
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.prompt, location: expr.prompt.location },
      { op: 'ai_vibe', vibeExpr: expr, modelName, location: expr.location },
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
 * Note: The prompt is added to orderedEntries in resumeWithAIResponse (after completion),
 * not here, so it doesn't appear in context before the AI call completes.
 */
export function execAIDo(state: RuntimeState, model: string, context: AST.ContextSpecifier): RuntimeState {
  const prompt = String(state.lastResult);
  const contextData = getContextForAI(state, context);

  return {
    ...state,
    status: 'awaiting_ai',
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
 * Note: The prompt is added to orderedEntries in resumeWithUserInput (after completion),
 * not here, so it doesn't appear in context before the user responds.
 */
export function execAIAsk(state: RuntimeState, model: string, context: AST.ContextSpecifier): RuntimeState {
  const prompt = String(state.lastResult);
  const contextData = getContextForAI(state, context);

  return {
    ...state,
    status: 'awaiting_user',
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
 *
 * Flow:
 * 1. Check cache (if cached mode enabled)
 * 2. If cached, call the cached function with current scope params
 * 3. If not cached, request AI to generate Vibe code
 *
 * Note: The prompt is added to orderedEntries in resumeWithVibeCode (after completion).
 */
export function execAIVibe(
  state: RuntimeState,
  vibeExpr: AST.VibeExpression,
  modelName: string
): RuntimeState {
  const prompt = String(state.lastResult);

  // Generate cache key from prompt and model
  const cacheKey = `${modelName}:${prompt}`;

  // Check cache if caching is enabled
  if (vibeExpr.cached && state.vibeCache[cacheKey]) {
    const cachedFunc = state.vibeCache[cacheKey].func;
    // TODO: Execute cached function with current scope params
    // For now, just log and continue (full implementation in next phase)
    return {
      ...state,
      executionLog: [
        ...state.executionLog,
        {
          timestamp: Date.now(),
          instructionType: 'ai_vibe_cache_hit',
          details: { prompt, modelName, cacheKey },
        },
      ],
    };
  }

  // Collect scope parameters (all visible variables in current frame)
  const scopeParams = collectScopeParams(state);

  // Request AI to generate code
  return {
    ...state,
    status: 'awaiting_ai',
    pendingAI: {
      type: 'vibe',
      prompt,
      model: modelName,
      context: [],  // Vibe uses custom context via system prompt
      vibeScopeParams: scopeParams,
      vibeExpr: vibeExpr,
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ai_vibe_request',
        details: { prompt, modelName, scopeParamCount: scopeParams.length },
      },
    ],
  };
}

/**
 * Collect all visible variables in the current scope as parameters for vibe-generated code.
 */
function collectScopeParams(state: RuntimeState): ScopeParam[] {
  const params: ScopeParam[] = [];
  const frame = currentFrame(state);

  for (const [name, variable] of Object.entries(frame.locals)) {
    // Skip models - they're passed separately
    if (isVibeModelValue(variable.value)) continue;

    params.push({
      name,
      type: variable.typeAnnotation ?? inferType(variable.value),
      value: variable.value,
    });
  }

  return params;
}

/**
 * Check if a value is a VibeModelValue.
 */
function isVibeModelValue(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__vibeModel' in value &&
    (value as { __vibeModel: unknown }).__vibeModel === true
  );
}

/**
 * Infer type string from a runtime value.
 */
function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'text';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'text[]';
    const firstType = inferType(value[0]);
    return `${firstType}[]`;
  }
  return 'json';
}
