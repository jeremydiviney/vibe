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

// TS block source mapping
export {
  type TsBlockMapping,
  registerTsBlock,
  getTsBlockMapping,
  findMappingByScriptId,
  setScriptId,
  mapTsLocationToVibe,
  mapVibeLocationToTs,
  isLocationInTsBlock,
  getMappingsForFile,
  clearTsBlockMappings,
  getAllMappings,
} from './ts-source-map';

// Bun inspector client
export {
  BunInspectorClient,
  getBunInspector,
  closeBunInspector,
} from './bun-inspector';

// Stack frame merger
export {
  type MergedStackFrame,
  type FrameOrigin,
  type DebugMode,
  type DebugExecutionContext,
  createDebugExecutionContext,
  enterTsBlock,
  enterTsImport,
  exitTsMode,
  incrementTsCallDepth,
  decrementTsCallDepth,
  mergeStackFrames,
  getUnifiedStackTrace,
  shouldHandoffToTs,
  shouldReturnToVibe,
  getFrameIdForOrigin,
} from './stack-merger';

// TS import tracker
export {
  type TsImportInfo,
  registerTsImport,
  getTsImportInfo,
  isTsImportCall,
  setTsImportEntryLine,
  registerTempBreakpoint,
  popTempBreakpoint,
  clearTempBreakpoints,
  getAllTsImports,
  getTsImportsForFile,
  clearTsImports,
  buildTsEntryPointId,
  parseTsEntryPointId,
} from './ts-import-tracker';

// Handoff manager
export {
  type HandoffState,
  createHandoffState,
  shouldInitiateHandoff,
  initiateHandoff,
  completeHandoff,
  shouldReturnControl,
  returnToVibe,
  handleTsStepIn,
  handleTsStepOut,
  getCurrentMode,
  isInTsMode,
  getSavedVibeState,
  setupTsImportBreakpoint,
  cleanupTempBreakpoint,
  cleanupAllTempBreakpoints,
} from './handoff-manager';

// Advanced debug features
export {
  type AdvancedBreakpoint,
  type WatchExpression,
  type ExceptionBreakpointConfig,
  type AdvancedDebugState,
  createAdvancedDebugState,
  setAdvancedBreakpoint,
  removeAdvancedBreakpoint,
  getAdvancedBreakpoint,
  evaluateCondition,
  checkHitCondition,
  shouldBreakpointTrigger,
  interpolateLogMessage,
  addWatchExpression,
  removeWatchExpression,
  evaluateWatchExpressions,
  setExceptionBreakpoints,
  shouldBreakOnException,
  flushLogOutput,
} from './advanced-features';

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
