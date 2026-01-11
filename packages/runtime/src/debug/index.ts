/**
 * Debug Module - Exports for Vibe debugger
 */

// State management
export {
  type VibeDebugState,
  type VariableReference,
  createDebugState,
  setBreakpoints,
  clearBreakpoints,
  shouldPauseAtLocation,
  pauseExecution,
  resumeExecution,
  setStepMode,
  getCurrentLocation,
  getStackTrace,
  getScopes,
  getVariables,
  getToolCalls,
  getContextEntries,
} from './state';

// Debug runner
export {
  type DebugStepResult,
  initDebugSession,
  debugStep,
  debugContinue,
  debugStepIn,
  debugStepOver,
  debugStepOut,
  handleDebugAICall,
  handleDebugTSCall,
  runWithDebug,
  createOutputEvent,
} from './runner';

// Re-export debug-core types for convenience
export type {
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
