/**
 * Debug State - Functional debug state management
 * Pure functions for managing debug state alongside RuntimeState
 */

import type {
  Breakpoint,
  SourceLocation,
  StackFrame,
  Variable,
  Scope,
  ContextEntry,
  ToolCallRecord,
  StopReason,
  StepMode,
  DebugState,
} from '@vibe-lang/debug-core';

import type { RuntimeState } from '../runtime/types';

// Extended debug state with runtime reference tracking
export interface VibeDebugState extends DebugState {
  breakpoints: Map<string, Breakpoint[]>;  // file -> breakpoints
  nextBreakpointId: number;
  variableReferences: Map<number, VariableReference>;  // For expandable variables
  nextVariableRef: number;
}

// Reference to a variable that can be expanded
export interface VariableReference {
  type: 'object' | 'array' | 'vibeValue' | 'scope';
  value: unknown;
  frameId?: number;
  scopeType?: 'local' | 'global' | 'context';
}

/**
 * Create initial debug state
 */
export function createDebugState(options?: {
  stopOnEntry?: boolean;
}): VibeDebugState {
  return {
    running: false,
    paused: options?.stopOnEntry ?? false,
    pausedAt: null,
    stopReason: options?.stopOnEntry ? 'entry' : null,
    stepMode: 'none',
    breakpoints: new Map(),
    nextBreakpointId: 1,
    variableReferences: new Map(),
    nextVariableRef: 1,
  };
}

/**
 * Set breakpoints for a file
 * Returns the new debug state and verified breakpoints
 */
export function setBreakpoints(
  debugState: VibeDebugState,
  file: string,
  lines: number[],
  conditions?: (string | undefined)[]
): { debugState: VibeDebugState; breakpoints: Breakpoint[] } {
  const breakpoints: Breakpoint[] = lines.map((line, i) => ({
    id: debugState.nextBreakpointId + i,
    file,
    line,
    verified: true,  // We assume all breakpoints are valid for now
    condition: conditions?.[i],
  }));

  const newBreakpoints = new Map(debugState.breakpoints);
  newBreakpoints.set(normalizeFilePath(file), breakpoints);

  return {
    debugState: {
      ...debugState,
      breakpoints: newBreakpoints,
      nextBreakpointId: debugState.nextBreakpointId + lines.length,
    },
    breakpoints,
  };
}

/**
 * Clear all breakpoints for a file
 */
export function clearBreakpoints(
  debugState: VibeDebugState,
  file: string
): VibeDebugState {
  const newBreakpoints = new Map(debugState.breakpoints);
  newBreakpoints.delete(normalizeFilePath(file));
  return { ...debugState, breakpoints: newBreakpoints };
}

/**
 * Check if execution should pause at current location
 */
export function shouldPauseAtLocation(
  debugState: VibeDebugState,
  runtimeState: RuntimeState,
  location: SourceLocation
): { shouldPause: boolean; reason: StopReason | null } {
  // Check breakpoints
  const fileBreakpoints = debugState.breakpoints.get(normalizeFilePath(location.file));
  if (fileBreakpoints) {
    const hitBreakpoint = fileBreakpoints.find(bp => bp.line === location.line);
    if (hitBreakpoint) {
      // Check condition if present
      if (hitBreakpoint.condition) {
        // TODO: Evaluate condition expression
        // For now, always break on conditional breakpoints
      }
      return { shouldPause: true, reason: 'breakpoint' };
    }
  }

  // Check step mode
  if (debugState.stepMode !== 'none') {
    return { shouldPause: true, reason: 'step' };
  }

  return { shouldPause: false, reason: null };
}

/**
 * Pause execution
 */
export function pauseExecution(
  debugState: VibeDebugState,
  location: SourceLocation,
  reason: StopReason
): VibeDebugState {
  return {
    ...debugState,
    running: false,
    paused: true,
    pausedAt: location,
    stopReason: reason,
    stepMode: 'none',
  };
}

/**
 * Resume execution (continue)
 */
export function resumeExecution(debugState: VibeDebugState): VibeDebugState {
  return {
    ...debugState,
    running: true,
    paused: false,
    pausedAt: null,
    stopReason: null,
    stepMode: 'none',
  };
}

/**
 * Set step mode
 */
export function setStepMode(
  debugState: VibeDebugState,
  mode: StepMode
): VibeDebugState {
  return {
    ...debugState,
    running: true,
    paused: false,
    stepMode: mode,
  };
}

/**
 * Get current source location from runtime state
 */
export function getCurrentLocation(runtimeState: RuntimeState): SourceLocation | null {
  // Get location from current instruction or statement
  const instruction = runtimeState.instructionStack[0];
  if (instruction?.location) {
    return {
      file: instruction.location.file ?? runtimeState.rootDir ?? '',
      line: instruction.location.line,
      column: instruction.location.column,
    };
  }

  // Fallback to current frame's location
  const frame = runtimeState.callStack[runtimeState.callStack.length - 1];
  if (frame?.currentLocation) {
    return {
      file: frame.currentLocation.file ?? runtimeState.rootDir ?? '',
      line: frame.currentLocation.line,
      column: frame.currentLocation.column,
    };
  }

  return null;
}

/**
 * Get stack trace from runtime state
 */
export function getStackTrace(runtimeState: RuntimeState): {
  stackFrames: StackFrame[];
  totalFrames: number;
} {
  const stackFrames: StackFrame[] = runtimeState.callStack.map((frame, index) => ({
    id: index,
    name: frame.functionName ?? '<main>',
    source: {
      file: frame.currentLocation?.file ?? '',
      line: frame.currentLocation?.line ?? 1,
      column: frame.currentLocation?.column ?? 1,
    },
    isVibeCode: true,  // For now, all frames are Vibe code
  })).reverse();  // Most recent frame first

  return {
    stackFrames,
    totalFrames: stackFrames.length,
  };
}

/**
 * Get scopes for a stack frame
 */
export function getScopes(
  debugState: VibeDebugState,
  runtimeState: RuntimeState,
  frameId: number
): { debugState: VibeDebugState; scopes: Scope[] } {
  const scopes: Scope[] = [];
  let newDebugState = debugState;

  // Local scope
  const localRef = newDebugState.nextVariableRef++;
  newDebugState = {
    ...newDebugState,
    variableReferences: new Map(newDebugState.variableReferences).set(localRef, {
      type: 'scope',
      value: null,
      frameId,
      scopeType: 'local',
    }),
  };
  scopes.push({
    name: 'Local',
    type: 'local',
    variablesReference: localRef,
    expensive: false,
  });

  // Global scope (if not at top level)
  if (frameId < runtimeState.callStack.length - 1) {
    const globalRef = newDebugState.nextVariableRef++;
    newDebugState = {
      ...newDebugState,
      variableReferences: new Map(newDebugState.variableReferences).set(globalRef, {
        type: 'scope',
        value: null,
        frameId: 0,
        scopeType: 'global',
      }),
    };
    scopes.push({
      name: 'Global',
      type: 'global',
      variablesReference: globalRef,
      expensive: false,
    });
  }

  // Context scope (AI context)
  const contextRef = newDebugState.nextVariableRef++;
  newDebugState = {
    ...newDebugState,
    variableReferences: new Map(newDebugState.variableReferences).set(contextRef, {
      type: 'scope',
      value: null,
      frameId,
      scopeType: 'context',
    }),
  };
  scopes.push({
    name: 'AI Context',
    type: 'context',
    variablesReference: contextRef,
    expensive: true,  // Context can be large
  });

  return { debugState: newDebugState, scopes };
}

/**
 * Get variables for a reference
 */
export function getVariables(
  debugState: VibeDebugState,
  runtimeState: RuntimeState,
  variablesReference: number
): { debugState: VibeDebugState; variables: Variable[] } {
  const ref = debugState.variableReferences.get(variablesReference);
  if (!ref) {
    return { debugState, variables: [] };
  }

  let newDebugState = debugState;
  const variables: Variable[] = [];

  if (ref.type === 'scope') {
    // Get variables from a scope
    const frame = runtimeState.callStack[runtimeState.callStack.length - 1 - (ref.frameId ?? 0)];
    if (!frame) {
      return { debugState, variables: [] };
    }

    if (ref.scopeType === 'local' || ref.scopeType === 'global') {
      // Get local/global variables
      // Pass the entire VibeValue so createVariable can detect .err and .toolCalls
      for (const [name, variable] of Object.entries(frame.locals)) {
        const { debugState: ds, variable: v } = createVariable(newDebugState, name, variable, variable.typeAnnotation);
        newDebugState = ds;
        variables.push(v);
      }
    } else if (ref.scopeType === 'context') {
      // Get context entries
      const contextEntries = runtimeState.localContext ?? [];
      for (const entry of contextEntries) {
        variables.push({
          name: entry.name ?? 'context',
          value: String(entry.value).slice(0, 100),
          type: 'context',
          variablesReference: 0,
        });
      }
    }
  } else if (ref.type === 'object' || ref.type === 'array') {
    // Expand object or array
    const value = ref.value;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const { debugState: ds, variable: v } = createVariable(newDebugState, `[${index}]`, item);
        newDebugState = ds;
        variables.push(v);
      });
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        const { debugState: ds, variable: v } = createVariable(newDebugState, key, val);
        newDebugState = ds;
        variables.push(v);
      }
    }
  } else if (ref.type === 'vibeValue') {
    // Expand VibeValue (show .value, .err, .toolCalls)
    const vibeValue = ref.value as any;
    if (vibeValue) {
      variables.push({
        name: 'value',
        value: formatValue(vibeValue.value),
        type: typeof vibeValue.value,
        variablesReference: 0,
      });
      if (vibeValue.err && vibeValue.errDetails) {
        const errMsg = vibeValue.errDetails.message ?? 'unknown error';
        variables.push({
          name: 'err',
          value: 'true',
          type: 'boolean',
          variablesReference: 0,
        });
        variables.push({
          name: 'errDetails',
          value: errMsg,
          type: 'error',
          variablesReference: 0,
          hasError: true,
          errorMessage: errMsg,
        });
      }
      if (vibeValue.toolCalls && vibeValue.toolCalls.length > 0) {
        const toolCallsRef = newDebugState.nextVariableRef++;
        newDebugState = {
          ...newDebugState,
          variableReferences: new Map(newDebugState.variableReferences).set(toolCallsRef, {
            type: 'array',
            value: vibeValue.toolCalls,
          }),
        };
        variables.push({
          name: 'toolCalls',
          value: `Array(${vibeValue.toolCalls.length})`,
          type: 'array',
          variablesReference: toolCallsRef,
          hasToolCalls: true,
          toolCallCount: vibeValue.toolCalls.length,
        });
      }
    }
  }

  return { debugState: newDebugState, variables };
}

/**
 * Create a variable from a value
 */
function createVariable(
  debugState: VibeDebugState,
  name: string,
  value: unknown,
  typeAnnotation?: string | null
): { debugState: VibeDebugState; variable: Variable } {
  let variablesReference = 0;
  let newDebugState = debugState;
  let displayType = typeAnnotation ?? typeof value;
  let hasError = false;
  let errorMessage: string | undefined;
  let hasToolCalls = false;
  let toolCallCount: number | undefined;
  let isPrivate = false;

  // Check if it's a VibeValue
  if (isVibeValue(value)) {
    const vibeValue = value as any;
    variablesReference = newDebugState.nextVariableRef++;
    newDebugState = {
      ...newDebugState,
      variableReferences: new Map(newDebugState.variableReferences).set(variablesReference, {
        type: 'vibeValue',
        value: vibeValue,
      }),
    };
    displayType = 'VibeValue';
    hasError = !!vibeValue.err;
    // Extract error message from errDetails object (err is now boolean)
    errorMessage = vibeValue.errDetails?.message ? String(vibeValue.errDetails.message) : undefined;
    hasToolCalls = vibeValue.toolCalls && vibeValue.toolCalls.length > 0;
    toolCallCount = vibeValue.toolCalls?.length;
    isPrivate = vibeValue.isPrivate === true;
  } else if (Array.isArray(value)) {
    variablesReference = newDebugState.nextVariableRef++;
    newDebugState = {
      ...newDebugState,
      variableReferences: new Map(newDebugState.variableReferences).set(variablesReference, {
        type: 'array',
        value,
      }),
    };
    displayType = 'array';
  } else if (typeof value === 'object' && value !== null) {
    variablesReference = newDebugState.nextVariableRef++;
    newDebugState = {
      ...newDebugState,
      variableReferences: new Map(newDebugState.variableReferences).set(variablesReference, {
        type: 'object',
        value,
      }),
    };
    displayType = 'object';
  }

  // Add [private] suffix to display name if variable is private
  const displayName = isPrivate ? `${name} [private]` : name;

  return {
    debugState: newDebugState,
    variable: {
      name: displayName,
      value: formatValue(value),
      type: displayType,
      variablesReference,
      hasError,
      errorMessage,
      hasToolCalls,
      toolCallCount,
      ...(isPrivate ? { isPrivate: true } : {}),
    },
  };
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value.slice(0, 100)}${value.length > 100 ? '...' : ''}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (isVibeValue(value)) {
    const v = value as any;
    if (v.err) return `VibeValue(error: ${v.errDetails?.message ?? 'unknown error'})`;
    return `VibeValue(${formatValue(v.value)})`;
  }
  if (typeof value === 'object') return `{...}`;
  return String(value);
}

/**
 * Check if a value is a VibeValue
 */
function isVibeValue(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    ('err' in value || 'toolCalls' in value || 'typeAnnotation' in value)
  );
}

/**
 * Normalize file path for comparison
 */
function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

/**
 * Get tool calls from a VibeValue
 */
export function getToolCalls(
  debugState: VibeDebugState,
  variablesReference: number
): ToolCallRecord[] {
  const ref = debugState.variableReferences.get(variablesReference);
  if (!ref || ref.type !== 'vibeValue') {
    return [];
  }

  const vibeValue = ref.value as any;
  if (!vibeValue?.toolCalls) {
    return [];
  }

  return vibeValue.toolCalls.map((tc: any) => {
    // Support both old format (error) and new format (err/errDetails)
    const hasError = tc.err ?? (tc.error != null);
    const errorMessage = tc.errDetails?.message ?? tc.error ?? null;
    return {
      toolName: tc.name ?? tc.toolName ?? 'unknown',
      args: tc.args ?? tc.arguments ?? {},
      result: tc.result,
      err: hasError,
      errDetails: hasError ? { message: errorMessage } : null,
      duration: tc.duration ?? 0,
    };
  });
}

/**
 * Get AI context entries
 */
export function getContextEntries(
  runtimeState: RuntimeState,
  contextType: 'default' | 'local'
): ContextEntry[] {
  const entries: ContextEntry[] = [];

  if (contextType === 'local') {
    // Get local context
    for (const entry of runtimeState.localContext ?? []) {
      entries.push({
        role: 'user',
        content: `${entry.name}: ${entry.value}`,
      });
    }
  } else {
    // Get default context
    for (const entry of runtimeState.defaultContext ?? []) {
      entries.push({
        role: entry.role as 'user' | 'assistant' | 'system' | 'tool',
        content: String(entry.content),
      });
    }
  }

  return entries;
}
