/**
 * Advanced Debug Features
 * Conditional breakpoints, logpoints, watch expressions, exception breakpoints
 */

import type { RuntimeState } from '../runtime/types';
import type { VibeDebugState } from './state';
import type { SourceLocation, Breakpoint } from '@vibe-lang/debug-core';

// Extended breakpoint with advanced features
export interface AdvancedBreakpoint extends Breakpoint {
  // Condition expression (only break if true)
  condition?: string;
  // Hit count condition (e.g., ">=5", "==10", "%3")
  hitCondition?: string;
  // Log message instead of breaking (logpoint)
  logMessage?: string;
  // Current hit count
  hitCount: number;
}

// Watch expression
export interface WatchExpression {
  id: number;
  expression: string;
  // Last evaluated value
  lastValue?: string;
  // Error if evaluation failed
  error?: string;
}

// Exception breakpoint configuration
export interface ExceptionBreakpointConfig {
  // Break on all exceptions
  all: boolean;
  // Break on uncaught exceptions only
  uncaught: boolean;
  // Break on specific exception types
  filters: string[];
}

// Advanced debug state
export interface AdvancedDebugState {
  // Advanced breakpoints (keyed by file:line)
  advancedBreakpoints: Map<string, AdvancedBreakpoint>;
  // Watch expressions
  watchExpressions: WatchExpression[];
  nextWatchId: number;
  // Exception breakpoint settings
  exceptionBreakpoints: ExceptionBreakpointConfig;
  // Log output buffer for logpoints
  logOutput: string[];
}

/**
 * Create initial advanced debug state
 */
export function createAdvancedDebugState(): AdvancedDebugState {
  return {
    advancedBreakpoints: new Map(),
    watchExpressions: [],
    nextWatchId: 1,
    exceptionBreakpoints: {
      all: false,
      uncaught: true,
      filters: [],
    },
    logOutput: [],
  };
}

/**
 * Set an advanced breakpoint
 */
export function setAdvancedBreakpoint(
  state: AdvancedDebugState,
  file: string,
  line: number,
  options?: {
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
  }
): { state: AdvancedDebugState; breakpoint: AdvancedBreakpoint } {
  const key = `${normalizeFilePath(file)}:${line}`;

  const breakpoint: AdvancedBreakpoint = {
    id: Date.now(), // Simple unique ID
    file,
    line,
    verified: true,
    condition: options?.condition,
    hitCondition: options?.hitCondition,
    logMessage: options?.logMessage,
    hitCount: 0,
  };

  const newBreakpoints = new Map(state.advancedBreakpoints);
  newBreakpoints.set(key, breakpoint);

  return {
    state: { ...state, advancedBreakpoints: newBreakpoints },
    breakpoint,
  };
}

/**
 * Remove an advanced breakpoint
 */
export function removeAdvancedBreakpoint(
  state: AdvancedDebugState,
  file: string,
  line: number
): AdvancedDebugState {
  const key = `${normalizeFilePath(file)}:${line}`;
  const newBreakpoints = new Map(state.advancedBreakpoints);
  newBreakpoints.delete(key);
  return { ...state, advancedBreakpoints: newBreakpoints };
}

/**
 * Get advanced breakpoint at location
 */
export function getAdvancedBreakpoint(
  state: AdvancedDebugState,
  file: string,
  line: number
): AdvancedBreakpoint | undefined {
  const key = `${normalizeFilePath(file)}:${line}`;
  return state.advancedBreakpoints.get(key);
}

/**
 * Evaluate condition expression
 * Returns true if condition passes (or no condition)
 */
export function evaluateCondition(
  condition: string | undefined,
  runtimeState: RuntimeState
): boolean {
  if (!condition) return true;

  try {
    // Get current frame's variables
    const frame = runtimeState.callStack[runtimeState.callStack.length - 1];
    if (!frame) return true;

    // Build context for evaluation
    const context: Record<string, unknown> = {};
    for (const [name, variable] of Object.entries(frame.locals)) {
      context[name] = variable.value;
    }

    // Simple expression evaluation
    // Supports: variable comparisons, logical operators, simple math
    return evaluateSimpleExpression(condition, context);
  } catch {
    // If evaluation fails, don't break
    return false;
  }
}

/**
 * Check hit count condition
 */
export function checkHitCondition(
  hitCondition: string | undefined,
  hitCount: number
): boolean {
  if (!hitCondition) return true;

  const trimmed = hitCondition.trim();

  // Check different hit condition formats
  if (trimmed.startsWith('>=')) {
    const value = parseInt(trimmed.slice(2), 10);
    return hitCount >= value;
  }
  if (trimmed.startsWith('<=')) {
    const value = parseInt(trimmed.slice(2), 10);
    return hitCount <= value;
  }
  if (trimmed.startsWith('>')) {
    const value = parseInt(trimmed.slice(1), 10);
    return hitCount > value;
  }
  if (trimmed.startsWith('<')) {
    const value = parseInt(trimmed.slice(1), 10);
    return hitCount < value;
  }
  if (trimmed.startsWith('==') || trimmed.startsWith('=')) {
    const value = parseInt(trimmed.replace(/^==?/, ''), 10);
    return hitCount === value;
  }
  if (trimmed.startsWith('%')) {
    const value = parseInt(trimmed.slice(1), 10);
    return value > 0 && hitCount % value === 0;
  }

  // Default: break when hit count reaches the value
  const value = parseInt(trimmed, 10);
  return hitCount >= value;
}

/**
 * Check if breakpoint should trigger
 * Handles condition, hit count, and logpoint
 */
export function shouldBreakpointTrigger(
  state: AdvancedDebugState,
  runtimeState: RuntimeState,
  location: SourceLocation
): { shouldBreak: boolean; logMessage?: string; newState: AdvancedDebugState } {
  const bp = getAdvancedBreakpoint(state, location.file, location.line);
  if (!bp) {
    return { shouldBreak: false, newState: state };
  }

  // Increment hit count
  const newBp: AdvancedBreakpoint = { ...bp, hitCount: bp.hitCount + 1 };
  const newBreakpoints = new Map(state.advancedBreakpoints);
  newBreakpoints.set(`${normalizeFilePath(location.file)}:${location.line}`, newBp);
  let newState: AdvancedDebugState = { ...state, advancedBreakpoints: newBreakpoints };

  // Check condition
  if (!evaluateCondition(bp.condition, runtimeState)) {
    return { shouldBreak: false, newState };
  }

  // Check hit condition
  if (!checkHitCondition(bp.hitCondition, newBp.hitCount)) {
    return { shouldBreak: false, newState };
  }

  // Handle logpoint
  if (bp.logMessage) {
    const message = interpolateLogMessage(bp.logMessage, runtimeState);
    newState = {
      ...newState,
      logOutput: [...newState.logOutput, message],
    };
    // Logpoints don't break
    return { shouldBreak: false, logMessage: message, newState };
  }

  return { shouldBreak: true, newState };
}

/**
 * Interpolate variables in log message
 * Supports {variableName} syntax
 */
export function interpolateLogMessage(
  message: string,
  runtimeState: RuntimeState
): string {
  const frame = runtimeState.callStack[runtimeState.callStack.length - 1];
  if (!frame) return message;

  return message.replace(/\{(\w+)\}/g, (match, varName) => {
    const variable = frame.locals[varName];
    if (variable) {
      return formatValueForLog(variable.value);
    }
    return match; // Keep original if variable not found
  });
}

/**
 * Add a watch expression
 */
export function addWatchExpression(
  state: AdvancedDebugState,
  expression: string
): { state: AdvancedDebugState; watch: WatchExpression } {
  const watch: WatchExpression = {
    id: state.nextWatchId,
    expression,
  };

  return {
    state: {
      ...state,
      watchExpressions: [...state.watchExpressions, watch],
      nextWatchId: state.nextWatchId + 1,
    },
    watch,
  };
}

/**
 * Remove a watch expression
 */
export function removeWatchExpression(
  state: AdvancedDebugState,
  watchId: number
): AdvancedDebugState {
  return {
    ...state,
    watchExpressions: state.watchExpressions.filter(w => w.id !== watchId),
  };
}

/**
 * Evaluate all watch expressions
 */
export function evaluateWatchExpressions(
  state: AdvancedDebugState,
  runtimeState: RuntimeState
): AdvancedDebugState {
  const evaluated = state.watchExpressions.map(watch => {
    try {
      const frame = runtimeState.callStack[runtimeState.callStack.length - 1];
      if (!frame) {
        return { ...watch, lastValue: undefined, error: 'No active frame' };
      }

      const context: Record<string, unknown> = {};
      for (const [name, variable] of Object.entries(frame.locals)) {
        context[name] = variable.value;
      }

      const value = evaluateExpression(watch.expression, context);
      return {
        ...watch,
        lastValue: formatValueForLog(value),
        error: undefined,
      };
    } catch (error) {
      return {
        ...watch,
        lastValue: undefined,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  return { ...state, watchExpressions: evaluated };
}

/**
 * Configure exception breakpoints
 */
export function setExceptionBreakpoints(
  state: AdvancedDebugState,
  config: Partial<ExceptionBreakpointConfig>
): AdvancedDebugState {
  return {
    ...state,
    exceptionBreakpoints: {
      ...state.exceptionBreakpoints,
      ...config,
    },
  };
}

/**
 * Check if we should break on an exception
 */
export function shouldBreakOnException(
  state: AdvancedDebugState,
  error: Error,
  isCaught: boolean
): boolean {
  const config = state.exceptionBreakpoints;

  // Break on all exceptions
  if (config.all) {
    return true;
  }

  // Break on uncaught only
  if (config.uncaught && !isCaught) {
    return true;
  }

  // Check filters
  if (config.filters.length > 0) {
    const errorType = error.constructor.name;
    return config.filters.some(f =>
      errorType.toLowerCase().includes(f.toLowerCase()) ||
      error.message.toLowerCase().includes(f.toLowerCase())
    );
  }

  return false;
}

/**
 * Get log output and clear buffer
 */
export function flushLogOutput(state: AdvancedDebugState): {
  state: AdvancedDebugState;
  logs: string[];
} {
  return {
    state: { ...state, logOutput: [] },
    logs: state.logOutput,
  };
}

// Helper functions

function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function formatValueForLog(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') {
    // Check for VibeValue
    if ('value' in value) {
      return formatValueForLog((value as any).value);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function evaluateSimpleExpression(
  expression: string,
  context: Record<string, unknown>
): boolean {
  // Replace variable names with their values
  let evaluated = expression;

  for (const [name, value] of Object.entries(context)) {
    const regex = new RegExp(`\\b${name}\\b`, 'g');
    evaluated = evaluated.replace(regex, JSON.stringify(value));
  }

  // Simple expression evaluation using Function constructor
  // Only supports basic comparisons and logical ops
  try {
    // Sanitize - only allow safe operators and values
    if (!/^[\s\d\w"'<>=!&|+\-*/%().]+$/.test(evaluated)) {
      return false;
    }
    const fn = new Function(`return ${evaluated}`);
    return !!fn();
  } catch {
    return false;
  }
}

function evaluateExpression(
  expression: string,
  context: Record<string, unknown>
): unknown {
  // Simple variable lookup
  if (context.hasOwnProperty(expression)) {
    return context[expression];
  }

  // Property access (e.g., "obj.prop")
  const parts = expression.split('.');
  if (parts.length > 1) {
    let value: unknown = context[parts[0]];
    for (let i = 1; i < parts.length && value != null; i++) {
      value = (value as any)[parts[i]];
    }
    return value;
  }

  // Try evaluating as expression
  let evaluated = expression;
  for (const [name, value] of Object.entries(context)) {
    const regex = new RegExp(`\\b${name}\\b`, 'g');
    evaluated = evaluated.replace(regex, JSON.stringify(value));
  }

  try {
    const fn = new Function(`return ${evaluated}`);
    return fn();
  } catch {
    throw new Error(`Cannot evaluate: ${expression}`);
  }
}
