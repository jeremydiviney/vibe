import * as AST from '../ast';
import type { VibeType, VibeTypeRequired, ContextMode, StructuralType } from '../ast';
import type { SourceLocation } from '../errors';
import type { PendingToolCall } from './tools/types';
export type { PendingToolCall } from './tools/types';
import type { VibeModelValue } from './ai/client';
import type { ModelUsageRecord } from './ai/types';

// Runtime status
export type RuntimeStatus =
  | 'running'
  | 'paused'
  | 'awaiting_ai'
  | 'awaiting_compress'  // Waiting for AI to compress loop context
  | 'awaiting_user'
  | 'awaiting_ts'
  | 'awaiting_tool'
  | 'awaiting_vibe_code'  // Waiting for vibe-generated code to be processed
  | 'awaiting_async'      // Waiting for async operations to complete
  | 'completed'
  | 'error';

// Source of a variable's value
export type ValueSource = 'ai' | 'user' | null;

// ============================================================================
// VibeValue - Unified value wrapper with error handling
// ============================================================================

// Error information captured when an operation fails
export interface VibeError {
  message: string;
  type: string;                      // Error class name: "TypeError", "ReferenceError", etc.
  location: SourceLocation | null;   // Source location in Vibe code (where the error occurred in .vibe file)
  stack?: string;                    // Original error stack trace (for debugging TS errors)
}

// Universal value wrapper - ALL values in Vibe are VibeValue
// Replaces both Variable and AIResultObject with a unified type
export interface VibeValue {
  value: unknown;                    // The actual primitive data
  err: boolean;                      // true if error, false if success (for direct boolean check: if result.err { ... })
  errDetails: VibeError | null;      // Error details when err is true, null otherwise
  toolCalls: ToolCallRecord[];       // AI tool calls (empty array for non-AI operations)
  isConst: boolean;                  // true for const, false for let
  vibeType: VibeType;          // 'text', 'number', 'json', 'prompt', etc. or null
  source: ValueSource;               // 'ai', 'user', or null (no source)
  isPrivate?: boolean;               // true if hidden from AI context
  asyncOperationId?: string;         // ID of pending async operation (when value is pending)
  usage?: ModelUsageRecord;          // Token usage from the AI call that produced this value
}

// Type guard for VibeValue
export function isVibeValue(val: unknown): val is VibeValue {
  return (
    typeof val === 'object' &&
    val !== null &&
    'value' in val &&
    'err' in val &&
    'errDetails' in val &&
    'toolCalls' in val &&
    'isConst' in val
  );
}

// Create a VibeValue (optionally with error for preserving errors through assignments)
export function createVibeValue(
  value: unknown,
  options: {
    isConst?: boolean;
    vibeType?: VibeType;
    source?: ValueSource;
    toolCalls?: ToolCallRecord[];
    err?: boolean;
    errDetails?: VibeError | null;
    isPrivate?: boolean;
    asyncOperationId?: string;
    usage?: ModelUsageRecord;
  } = {}
): VibeValue {
  const result: VibeValue = {
    value,
    err: options.err ?? false,
    errDetails: options.errDetails ?? null,
    toolCalls: options.toolCalls ?? [],
    isConst: options.isConst ?? false,
    vibeType: options.vibeType ?? null,
    source: options.source ?? null,
  };
  if (options.isPrivate) {
    result.isPrivate = true;
  }
  if (options.asyncOperationId) {
    result.asyncOperationId = options.asyncOperationId;
  }
  if (options.usage) {
    result.usage = options.usage;
  }
  return result;
}

// Create a VibeValue with an error
export function createVibeError(
  error: Error | string,
  location: SourceLocation | null = null,
  options: {
    isConst?: boolean;
    vibeType?: VibeType;
  } = {}
): VibeValue {
  const isErrorObject = error instanceof Error;
  const errDetails: VibeError = {
    message: typeof error === 'string' ? error : error.message,
    type: typeof error === 'string' ? 'Error' : error.constructor.name,
    location,
    // Capture stack trace from Error objects (useful for debugging TS errors)
    stack: isErrorObject ? error.stack : undefined,
  };
  return {
    value: null,
    err: true,
    errDetails,
    toolCalls: [],
    isConst: options.isConst ?? false,
    vibeType: options.vibeType ?? null,
    source: null,
  };
}

// Propagate error from one VibeValue to another (for expression evaluation)
// If source has error, result inherits it; otherwise uses provided value
export function propagateError(
  source: VibeValue,
  value: unknown,
  options: {
    isConst?: boolean;
    vibeType?: VibeType;
    source?: ValueSource;
  } = {}
): VibeValue {
  if (source.err) {
    return {
      value: null,
      err: true,
      errDetails: source.errDetails,
      toolCalls: [],
      isConst: options.isConst ?? false,
      vibeType: options.vibeType ?? null,
      source: options.source ?? null,
    };
  }
  return createVibeValue(value, options);
}

// Propagate error from multiple sources (for binary operations)
// Returns first error found, or creates successful value
export function propagateErrors(
  sources: VibeValue[],
  value: unknown,
  options: {
    isConst?: boolean;
    vibeType?: VibeType;
    source?: ValueSource;
  } = {}
): VibeValue {
  for (const src of sources) {
    if (src.err) {
      return {
        value: null,
        err: true,
        errDetails: src.errDetails,
        toolCalls: [],
        isConst: options.isConst ?? false,
        vibeType: options.vibeType ?? null,
        source: options.source ?? null,
      };
    }
  }
  return createVibeValue(value, options);
}

// Variable in context (for AI calls)
// Note: Models are filtered out - they are config, not data for AI context
export interface ContextVariable {
  kind: 'variable';
  name: string;
  value: unknown;
  type: 'text' | 'json' | 'boolean' | 'number' | null;
  isConst: boolean;
  source: ValueSource;    // Where the value came from (AI response, user input, or null for code)
  isPrivate?: boolean;    // true if hidden from AI context
  // Call stack location info (helps AI understand variable scope)
  frameName: string;      // Name of the function/scope (e.g., "main", "processData")
  frameDepth: number;     // 0 = deepest/current frame, higher = older frames
}

// Tool call within a prompt (AI-initiated tool execution during the prompt)
export interface PromptToolCall {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

// Tool call error details
export interface ToolCallError {
  message: string;
  type?: string;           // Error type if available
}

// Tool call record for VibeValue (includes timing)
export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: string | null;   // null if error
  err: boolean;            // true if error, false if success
  errDetails: ToolCallError | null;  // Error details when err is true
  duration: number;        // milliseconds
}

// Resolve VibeValue to its primitive value for coercion
// Used in string interpolation, binary ops, print, etc.
export function resolveValue(val: unknown): unknown {
  if (isVibeValue(val)) {
    return val.value;
  }
  return val;
}

// Prompt in context (when AI function is called)
export interface ContextPrompt {
  kind: 'prompt';
  aiType: 'do' | 'vibe' | 'ask';
  prompt: string;
  toolCalls?: PromptToolCall[];  // Tool calls made during this prompt (before response)
  response?: unknown;  // Included when AI returns
  frameName: string;
  frameDepth: number;
}

// Scope marker in context (entering/exiting loops/functions)
export interface ContextScopeMarker {
  kind: 'scope-enter' | 'scope-exit';
  scopeType: 'for' | 'while' | 'function';
  label?: string;
  frameName: string;
  frameDepth: number;
}

// Summary in context (from compress mode)
export interface ContextSummary {
  kind: 'summary';
  text: string;
  frameName: string;
  frameDepth: number;
}

// Tool call in context (AI-initiated tool execution)
export interface ContextToolCall {
  kind: 'tool-call';
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  frameName: string;
  frameDepth: number;
}

// Context entry - variable, prompt, scope marker, summary, or tool call
export type ContextEntry = ContextVariable | ContextPrompt | ContextScopeMarker | ContextSummary | ContextToolCall;

// Ordered entry - tracks order of variable assignments and AI prompts in a frame
// Values are snapshotted at assignment time for accurate history
export type FrameEntry =
  | {
      kind: 'variable';
      name: string;
      value: unknown;           // Snapshot at assignment time
      type: string | null;
      isConst: boolean;
      source?: 'ai' | 'user';
      isPrivate?: boolean;      // true if hidden from AI context
    }
  | {
      kind: 'prompt';
      aiType: 'do' | 'vibe' | 'ask';
      prompt: string;
      toolCalls?: PromptToolCall[];  // Tool calls made during this prompt
      response?: unknown;            // Added when AI returns
    }
  | {
      kind: 'summary';          // For compress mode
      text: string;
    }
  | {
      kind: 'scope-enter';      // Marker for entering loop/function
      scopeType: 'for' | 'while' | 'function';
      label?: string;           // e.g., function name or "for n in items"
    }
  | {
      kind: 'scope-exit';       // Marker for leaving loop/function
      scopeType: 'for' | 'while' | 'function';
      label?: string;
    }
  | {
      kind: 'tool-call';        // AI-initiated tool call
      toolName: string;
      args: Record<string, unknown>;
      result?: unknown;
      error?: string;
    };

// Stack frame (serializable - uses Record instead of Map)
export interface StackFrame {
  name: string;
  locals: Record<string, VibeValue>;  // All variables are VibeValue
  parentFrameIndex: number | null;    // Lexical parent frame for scope chain
  orderedEntries: FrameEntry[];       // Track order of variable assignments and AI prompts
  modulePath?: string;                // Module this frame belongs to (for imported functions)
}

// AI operation history entry
export interface AIOperation {
  type: 'do' | 'vibe' | 'ask';
  prompt: string;
  response: unknown;
  timestamp: number;
}

// Detailed token usage from AI providers
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  // Cached tokens (prompt caching)
  cachedInputTokens?: number;
  // Tokens used to create cache (Anthropic)
  cacheCreationTokens?: number;
  // Reasoning/thinking tokens (OpenAI o1, Claude extended thinking)
  thinkingTokens?: number;
}

// Message in the AI conversation (for logging)
export interface AILogMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** For assistant messages with tool calls */
  toolCalls?: Array<{
    id: string;
    toolName: string;
    args: Record<string, unknown>;
  }>;
  /** For user messages with tool results */
  toolResults?: Array<{
    toolCallId: string;
    result?: unknown;
    error?: string;
  }>;
}

// Detailed AI interaction for debugging/logging
// Contains the COMPLETE context that was sent to the model
export interface AIInteraction {
  type: 'do' | 'vibe' | 'ask';
  prompt: string;
  response: unknown;
  timestamp: number;
  model: string;
  // Model details for logging
  modelDetails?: {
    name: string;
    provider: string;
    url?: string;
    thinkingLevel?: string;
  };
  targetType: string | null;
  usage?: TokenUsage;
  durationMs?: number;
  // The complete message sequence sent to the model (single source of truth for logging)
  messages: AILogMessage[];
  // Structured execution context (variables, prompts, tool calls)
  executionContext: ContextEntry[];
  // Tool calls made during this interaction (after the initial request)
  interactionToolCalls?: PromptToolCall[];
}

// Execution log entry for tracking what happened
export interface ExecutionEntry {
  timestamp: number;
  instructionType: string;
  details?: Record<string, unknown>;
  result?: unknown;
}

// ============================================================================
// Verbose Logging Types (JSONL output)
// ============================================================================

// Base log event fields
interface LogEventBase {
  seq: number;           // Sequential event number (1, 2, 3, ...)
  ts: string;            // ISO timestamp
  event: string;         // Event type
}

// Run lifecycle events
export interface RunStartEvent extends LogEventBase {
  event: 'run_start';
  file: string;
}

export interface RunCompleteEvent extends LogEventBase {
  event: 'run_complete';
  durationMs: number;
  status: 'completed' | 'error';
  error?: string;
}

// AI call events
export interface AIStartEvent extends LogEventBase {
  event: 'ai_start';
  id: string;            // e.g., "do-000001", "vibe-000001"
  type: 'do' | 'vibe';
  model: string;
  prompt: string;        // Truncated prompt for display
}

export interface AICompleteEvent extends LogEventBase {
  event: 'ai_complete';
  id: string;
  durationMs: number;
  tokens?: { in: number; out: number; thinking?: number; cachedIn?: number };
  toolCalls: number;     // Count of tool calls made
  error?: string;
}

// Tool call events (within vibe loops)
export interface ToolStartEvent extends LogEventBase {
  event: 'tool_start';
  parentId: string;      // Parent AI call ID
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolCompleteEvent extends LogEventBase {
  event: 'tool_complete';
  parentId: string;
  tool: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

// TypeScript execution events
export interface TSStartEvent extends LogEventBase {
  event: 'ts_start';
  id: string;            // e.g., "ts-000001" or "tsf-000001"
  tsType: 'block' | 'function';  // block = inline ts{}, function = imported ts
  name?: string;         // Function name (for imported ts functions)
  params: string[];
  location: { file: string; line: number };
}

export interface TSCompleteEvent extends LogEventBase {
  event: 'ts_complete';
  id: string;
  tsType: 'block' | 'function';
  durationMs: number;
  error?: string;
}

// Union of all log events
export type LogEvent =
  | RunStartEvent
  | RunCompleteEvent
  | AIStartEvent
  | AICompleteEvent
  | ToolStartEvent
  | ToolCompleteEvent
  | TSStartEvent
  | TSCompleteEvent;

// Pending AI request info
export interface PendingAI {
  type: 'do' | 'vibe';  // 'do' = single round, 'vibe' = multi-turn tool loop
  prompt: string;
  model: string;
  context: unknown[];
  // Scope parameters for vibe code generation
  vibeScopeParams?: Array<{ name: string; type: string; value: unknown }>;
  // Location for error reporting
  location?: SourceLocation;
}

// Expected field for destructuring/typed returns
export interface ExpectedField {
  name: string;
  type: VibeTypeRequired;
  isPrivate?: boolean;  // true if hidden from AI context
  nestedFields?: ExpectedField[];  // For nested structures
}

// Pending compress request (for compress context mode)
export interface PendingCompress {
  prompt: string | null;           // Custom prompt or null for default
  model: string;                   // Model variable name to use
  entriesToSummarize: FrameEntry[]; // Entries to compress
  entryIndex: number;              // Where scope started in orderedEntries
  scopeType: 'for' | 'while';
  label?: string;
}

// Pending TypeScript evaluation (inline ts block)
export interface PendingTS {
  params: string[];
  body: string;
  paramValues: unknown[];
  location: SourceLocation;  // Source location in .vibe file for error reporting
}

// Pending imported TS function call
export interface PendingImportedTsCall {
  funcName: string;
  args: unknown[];
  location: SourceLocation;  // Source location in .vibe file for error reporting
}

// Loaded TypeScript module
export interface TsModule {
  exports: Record<string, unknown>;  // Exported functions/values
}

// Loaded Vibe module
export interface VibeModule {
  exports: Record<string, ExportedItem>;
  program: AST.Program;
  globals: Record<string, VibeValue>;  // Module-level variables (isolated per module)
  functions: Record<string, AST.FunctionDeclaration>;  // All functions in module (for internal calls)
}

// Exported item from a Vibe module
export type ExportedItem =
  | { kind: 'function'; declaration: AST.FunctionDeclaration }
  | { kind: 'variable'; name: string; value: unknown; isConst: boolean; vibeType: string | null }
  | { kind: 'model'; declaration: AST.ModelDeclaration };

// ============================================================================
// Async Execution Types
// ============================================================================

/** Status of an async operation */
export type AsyncOperationStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Type of async operation */
export type AsyncOperationType = 'do' | 'vibe' | 'ts' | 'ts-function' | 'vibe-function';

/** Scheduled async operation waiting to be started by Runtime.run() */
export type PendingAsyncStart =
  | { type: 'do' | 'vibe'; operationId: string; variableName: string | null; prompt: string; model: string; context: unknown[]; operationType: 'do' | 'vibe' }
  | { type: 'ts'; operationId: string; variableName: string | null; params: string[]; body: string; paramValues: unknown[]; location: SourceLocation }
  | { type: 'ts-function'; operationId: string; variableName: string | null; funcName: string; args: unknown[]; location: SourceLocation }
  | { type: 'vibe-function'; operationId: string; variableName: string | null; funcName: string; args: unknown[]; modulePath?: string };

/** Individual async operation being tracked */
export interface AsyncOperation {
  id: string;                                // Unique identifier (e.g., "async-001")
  variableName: string | null;               // null for standalone async (fire-and-forget)
  status: AsyncOperationStatus;
  operationType: AsyncOperationType;
  startTime?: number;                        // ms timestamp when started
  endTime?: number;                          // ms timestamp when completed
  result?: VibeValue;                        // Result when completed
  error?: VibeError;                         // Error if failed
  dependencies: string[];                    // Variable names this depends on
  contextSnapshot: ContextEntry[];           // Context captured at wave start
  waveId: number;                            // Which wave this operation belongs to
  promise?: Promise<VibeValue>;              // The actual promise (not serializable)
}

/** A wave of async operations that can run in parallel */
export interface AsyncWave {
  id: number;
  operationIds: string[];                    // IDs of operations in this wave
  contextSnapshot: ContextEntry[];           // Context at wave start
  startTime: number;
  endTime?: number;
}

// The complete runtime state (fully serializable)
export interface RuntimeState {
  status: RuntimeStatus;

  // The program
  program: AST.Program;
  functions: Record<string, AST.FunctionDeclaration>;
  typeDefinitions: Map<string, StructuralType>;  // Named structural types

  // Loaded modules
  tsModules: Record<string, TsModule>;      // TS modules by import path
  vibeModules: Record<string, VibeModule>;  // Vibe modules by import path
  importedNames: Record<string, { source: string; sourceType: 'ts' | 'vibe' }>;  // Track where names come from

  // Execution state
  callStack: StackFrame[];
  instructionStack: Instruction[];
  valueStack: unknown[];  // For building complex values (objects, arrays, args)

  // Results
  lastResult: unknown;
  lastResultSource: ValueSource;  // Tracks source of lastResult (ai/user/undefined)
  aiHistory: AIOperation[];
  executionLog: ExecutionEntry[];

  // AI interaction logging (opt-in for debugging)
  logAiInteractions: boolean;
  aiInteractions: AIInteraction[];

  // Context (rebuilt before each instruction)
  localContext: ContextEntry[];
  globalContext: ContextEntry[];

  // Pending async operation
  pendingAI: PendingAI | null;
  pendingCompress: PendingCompress | null;
  pendingTS: PendingTS | null;
  pendingImportedTsCall: PendingImportedTsCall | null;
  pendingToolCall: PendingToolCall | null;

  // Destructuring support
  pendingDestructuring: ExpectedField[] | null;  // Fields expected from AI for destructuring
  expectedFields: ExpectedField[] | null;        // Expected fields for current AI call (single or multi-value)

  // Model tracking for compress
  lastUsedModel: string | null;  // Set on model declaration, updated on AI calls

  // Root directory for file operation sandboxing
  rootDir: string;

  // Error info
  error: string | null;
  errorObject: Error | null;

  // Async execution tracking
  asyncOperations: Map<string, AsyncOperation>;  // id -> operation
  pendingAsyncIds: Set<string>;                  // Currently executing operation IDs
  asyncVarToOpId: Map<string, string>;           // varName -> operation ID
  asyncWaves: AsyncWave[];                       // Execution waves
  currentWaveId: number;                         // Current wave being built/executed
  maxParallel: number;                           // Max concurrent operations (from --max-parallel)
  nextAsyncId: number;                           // Counter for generating unique IDs
  awaitingAsyncIds: string[];                    // Operation IDs we're currently awaiting (when status is awaiting_async)

  // Async declaration context - set when inside async let/const to enable non-blocking mode
  currentAsyncVarName: string | null;            // Variable being assigned (null = not in async context)
  currentAsyncIsConst: boolean;                  // Whether it's a const declaration
  currentAsyncType: VibeType;                    // Type annotation for the variable
  currentAsyncIsPrivate: boolean;                // Whether it's a private declaration
  currentAsyncIsDestructure: boolean;            // True if async destructuring (variables created by destructure_assign)
  currentAsyncIsFireAndForget: boolean;          // True for fire-and-forget async (no variable assigned)

  // Async function isolation tracking
  isInAsyncIsolation: boolean;                   // True when running in isolated state (async Vibe function)

  // Scheduled async operations - waiting for Runtime.run() to start them
  pendingAsyncStarts: PendingAsyncStart[];       // Operations to start as Promises

  // String interpolation context - true when evaluating prompt for do/vibe or prompt variable
  inPromptContext: boolean;
}

// ============================================================================
// Instruction types - grouped by category
// All instructions have a location for error reporting
// ============================================================================

// Execute AST nodes and literals
export type ExecutionInstruction =
  | { op: 'exec_statement'; stmt: AST.Statement; location: SourceLocation }
  | { op: 'exec_expression'; expr: AST.Expression; location: SourceLocation }
  | { op: 'exec_statements'; stmts: AST.Statement[]; index: number; location: SourceLocation }
  | { op: 'literal'; value: unknown; location: SourceLocation };

// Variable lifecycle
export type VariableInstruction =
  | { op: 'declare_var'; name: string; isConst: boolean; type: VibeType; isPrivate?: boolean; location: SourceLocation }
  | { op: 'assign_var'; name: string; location: SourceLocation }
  | { op: 'destructure_assign'; fields: ExpectedField[]; isConst: boolean; location: SourceLocation };

// Branching, loops, and early exit
export type ControlFlowInstruction =
  | { op: 'if_branch'; consequent: AST.BlockStatement; alternate?: AST.Statement | null; location: SourceLocation }
  | { op: 'for_in_init'; stmt: AST.ForInStatement; location: SourceLocation }
  | { op: 'for_in_iterate'; variable: string; items: unknown[]; index: number; body: AST.BlockStatement; savedKeys: string[]; contextMode?: AST.ContextMode; label: string; entryIndex: number; location: SourceLocation }
  | { op: 'while_init'; stmt: AST.WhileStatement; savedKeys: string[]; location: SourceLocation }
  | { op: 'while_iterate'; stmt: AST.WhileStatement; savedKeys: string[]; contextMode?: AST.ContextMode; label?: string; entryIndex: number; location: SourceLocation }
  | { op: 'while_check'; stmt: AST.WhileStatement; savedKeys: string[]; contextMode?: AST.ContextMode; label?: string; entryIndex: number; location: SourceLocation }
  | { op: 'break_loop'; savedKeys: string[]; contextMode?: ContextMode; label?: string; entryIndex: number; scopeType: 'for' | 'while'; location: SourceLocation }
  | { op: 'return_value'; location: SourceLocation }
  | { op: 'throw_error'; location: SourceLocation };

// Call stack and scope management
export type FrameInstruction =
  | { op: 'call_function'; funcName: string; argCount: number; location: SourceLocation }
  | { op: 'call_imported_ts'; funcName: string; argCount: number; location: SourceLocation }
  | { op: 'push_frame'; name: string; location: SourceLocation }
  | { op: 'pop_frame'; location: SourceLocation }
  | { op: 'enter_block'; savedKeys: string[]; location: SourceLocation }
  | { op: 'exit_block'; savedKeys: string[]; location: SourceLocation }
  | { op: 'clear_async_context'; location: SourceLocation };

// Building composite values on the value stack
export type ValueInstruction =
  | { op: 'push_value'; location: SourceLocation }
  | { op: 'build_object'; keys: string[]; location: SourceLocation }
  | { op: 'build_array'; count: number; location: SourceLocation }
  | { op: 'build_range'; location: SourceLocation }
  | { op: 'collect_args'; count: number; location: SourceLocation };

// Operators and property/index access
export type OperatorInstruction =
  | { op: 'binary_op'; operator: string; location: SourceLocation }
  | { op: 'unary_op'; operator: string; location: SourceLocation }
  | { op: 'index_access'; location: SourceLocation }
  | { op: 'slice_access'; hasStart: boolean; hasEnd: boolean; location: SourceLocation }
  | { op: 'member_access'; property: string; location: SourceLocation };

// String interpolation
export type StringInstruction =
  | { op: 'interpolate_string'; template: string; location: SourceLocation }
  | { op: 'interpolate_prompt_string'; template: string; location: SourceLocation }
  | { op: 'clear_prompt_context'; location: SourceLocation };

// Operations involving external systems (AI, TypeScript, tools)
export type ExternalInstruction =
  | { op: 'ai_vibe'; model: string | null; context: AST.ContextSpecifier | null; operationType: 'do' | 'vibe'; location: SourceLocation }
  | { op: 'ts_eval'; params: string[]; body: string; location: SourceLocation }
  | { op: 'exec_tool_declaration'; decl: AST.ToolDeclaration; location: SourceLocation }
  | { op: 'declare_model'; stmt: AST.ModelDeclaration; location: SourceLocation };

// Combined instruction type
export type Instruction =
  | ExecutionInstruction
  | VariableInstruction
  | ControlFlowInstruction
  | FrameInstruction
  | ValueInstruction
  | OperatorInstruction
  | StringInstruction
  | ExternalInstruction;
