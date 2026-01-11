/**
 * Debug protocol messages between Debug Adapter and Vibe Runtime
 * Communication happens over WebSocket
 */

import type {
  Breakpoint,
  SourceLocation,
  StackFrame,
  Variable,
  Scope,
  ContextEntry,
  StopReason,
  ToolCallRecord,
} from './types';

// ============================================
// Messages from Debug Adapter to Runtime
// ============================================

export interface InitializeMessage {
  type: 'initialize';
  seq: number;
}

export interface SetBreakpointsMessage {
  type: 'setBreakpoints';
  seq: number;
  file: string;
  lines: number[];
  conditions?: (string | undefined)[];  // Optional conditions per breakpoint
}

export interface ContinueMessage {
  type: 'continue';
  seq: number;
}

export interface PauseMessage {
  type: 'pause';
  seq: number;
}

export interface StepInMessage {
  type: 'stepIn';
  seq: number;
}

export interface StepOverMessage {
  type: 'stepOver';
  seq: number;
}

export interface StepOutMessage {
  type: 'stepOut';
  seq: number;
}

export interface GetStackTraceMessage {
  type: 'getStackTrace';
  seq: number;
}

export interface GetScopesMessage {
  type: 'getScopes';
  seq: number;
  frameId: number;
}

export interface GetVariablesMessage {
  type: 'getVariables';
  seq: number;
  variablesReference: number;
}

export interface GetToolCallsMessage {
  type: 'getToolCalls';
  seq: number;
  variablesReference: number;  // Reference to the VibeValue variable
}

export interface GetContextMessage {
  type: 'getContext';
  seq: number;
  contextType: 'default' | 'local';
}

export interface EvaluateMessage {
  type: 'evaluate';
  seq: number;
  expression: string;
  frameId: number;
}

export interface DisconnectMessage {
  type: 'disconnect';
  seq: number;
}

export type AdapterToRuntimeMessage =
  | InitializeMessage
  | SetBreakpointsMessage
  | ContinueMessage
  | PauseMessage
  | StepInMessage
  | StepOverMessage
  | StepOutMessage
  | GetStackTraceMessage
  | GetScopesMessage
  | GetVariablesMessage
  | GetToolCallsMessage
  | GetContextMessage
  | EvaluateMessage
  | DisconnectMessage;

// ============================================
// Messages from Runtime to Debug Adapter
// ============================================

// Response base
export interface ResponseBase {
  type: 'response';
  seq: number;
  requestSeq: number;
  success: boolean;
  message?: string;  // Error message if !success
}

export interface InitializeResponse extends ResponseBase {
  command: 'initialize';
  body?: {
    supportsConditionalBreakpoints: boolean;
    supportsEvaluateForHovers: boolean;
    supportsStepBack: boolean;
    supportsSetVariable: boolean;
    supportsRestartRequest: boolean;
  };
}

export interface SetBreakpointsResponse extends ResponseBase {
  command: 'setBreakpoints';
  body: {
    breakpoints: Breakpoint[];
  };
}

export interface StackTraceResponse extends ResponseBase {
  command: 'getStackTrace';
  body: {
    stackFrames: StackFrame[];
    totalFrames: number;
  };
}

export interface ScopesResponse extends ResponseBase {
  command: 'getScopes';
  body: {
    scopes: Scope[];
  };
}

export interface VariablesResponse extends ResponseBase {
  command: 'getVariables';
  body: {
    variables: Variable[];
  };
}

export interface ToolCallsResponse extends ResponseBase {
  command: 'getToolCalls';
  body: {
    toolCalls: ToolCallRecord[];
  };
}

export interface ContextResponse extends ResponseBase {
  command: 'getContext';
  body: {
    entries: ContextEntry[];
  };
}

export interface EvaluateResponse extends ResponseBase {
  command: 'evaluate';
  body: {
    result: string;
    type: string;
    variablesReference: number;
  };
}

export interface SimpleResponse extends ResponseBase {
  command: 'continue' | 'pause' | 'stepIn' | 'stepOver' | 'stepOut' | 'disconnect';
}

export type RuntimeResponse =
  | InitializeResponse
  | SetBreakpointsResponse
  | StackTraceResponse
  | ScopesResponse
  | VariablesResponse
  | ToolCallsResponse
  | ContextResponse
  | EvaluateResponse
  | SimpleResponse;

// ============================================
// Events from Runtime to Debug Adapter
// ============================================

export interface StoppedEvent {
  type: 'event';
  event: 'stopped';
  body: {
    reason: StopReason;
    location: SourceLocation;
    threadId: number;  // Always 1 for Vibe (single-threaded)
    allThreadsStopped: true;
  };
}

export interface ContinuedEvent {
  type: 'event';
  event: 'continued';
  body: {
    threadId: number;
    allThreadsContinued: true;
  };
}

export interface OutputEvent {
  type: 'event';
  event: 'output';
  body: {
    category: 'stdout' | 'stderr' | 'console';
    output: string;
    source?: SourceLocation;
  };
}

export interface TerminatedEvent {
  type: 'event';
  event: 'terminated';
  body?: {
    restart?: boolean;
  };
}

export interface BreakpointEvent {
  type: 'event';
  event: 'breakpoint';
  body: {
    reason: 'new' | 'changed' | 'removed';
    breakpoint: Breakpoint;
  };
}

// Vibe-specific: entering/exiting TypeScript code
export interface TypeScriptTransitionEvent {
  type: 'event';
  event: 'tsTransition';
  body: {
    entering: boolean;  // true = entering TS, false = returning to Vibe
    location: SourceLocation;
  };
}

export type RuntimeEvent =
  | StoppedEvent
  | ContinuedEvent
  | OutputEvent
  | TerminatedEvent
  | BreakpointEvent
  | TypeScriptTransitionEvent;

// ============================================
// Union of all runtime messages
// ============================================

export type RuntimeToAdapterMessage = RuntimeResponse | RuntimeEvent;

// ============================================
// WebSocket message wrapper
// ============================================

export interface DebugMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

// Helper type guards
export function isEvent(msg: RuntimeToAdapterMessage): msg is RuntimeEvent {
  return msg.type === 'event';
}

export function isResponse(msg: RuntimeToAdapterMessage): msg is RuntimeResponse {
  return msg.type === 'response';
}
