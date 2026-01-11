import * as AST from '../ast';
import type { VibeType, VibeTypeRequired } from '../ast';
import type { SourceLocation } from '../errors';
import type { PendingToolCall } from './tools/types';
export type { PendingToolCall } from './tools/types';
import type { VibeModelValue } from './ai/client';

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
  | 'completed'
  | 'error';

// Source of a variable's value
export type ValueSource = 'ai' | 'user' | undefined;

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
  err: VibeError | null;             // Error if operation failed, null if success
  toolCalls: ToolCallRecord[];       // AI tool calls (empty array for non-AI operations)
  isConst: boolean;                  // true for const, false for let
  typeAnnotation: VibeType;          // 'text', 'number', 'json', 'prompt', etc. or null
  source?: ValueSource;              // 'ai', 'user', or undefined
}

// Type guard for VibeValue
export function isVibeValue(val: unknown): val is VibeValue {
  return (
    typeof val === 'object' &&
    val !== null &&
    'value' in val &&
    'err' in val &&
    'toolCalls' in val &&
    'isConst' in val
  );
}

// Create a successful VibeValue (no error)
export function createVibeValue(
  value: unknown,
  options: {
    isConst?: boolean;
    typeAnnotation?: VibeType;
    source?: ValueSource;
    toolCalls?: ToolCallRecord[];
  } = {}
): VibeValue {
  return {
    value,
    err: null,
    toolCalls: options.toolCalls ?? [],
    isConst: options.isConst ?? false,
    typeAnnotation: options.typeAnnotation ?? null,
    source: options.source,
  };
}

// Create a VibeValue with an error
export function createVibeError(
  error: Error | string,
  location: SourceLocation | null = null,
  options: {
    isConst?: boolean;
    typeAnnotation?: VibeType;
  } = {}
): VibeValue {
  const isErrorObject = error instanceof Error;
  const err: VibeError = {
    message: typeof error === 'string' ? error : error.message,
    type: typeof error === 'string' ? 'Error' : error.constructor.name,
    location,
    // Capture stack trace from Error objects (useful for debugging TS errors)
    stack: isErrorObject ? error.stack : undefined,
  };
  return {
    value: undefined,
    err,
    toolCalls: [],
    isConst: options.isConst ?? false,
    typeAnnotation: options.typeAnnotation ?? null,
    source: undefined,
  };
}

// Propagate error from one VibeValue to another (for expression evaluation)
// If source has error, result inherits it; otherwise uses provided value
export function propagateError(
  source: VibeValue,
  value: unknown,
  options: {
    isConst?: boolean;
    typeAnnotation?: VibeType;
    source?: ValueSource;
  } = {}
): VibeValue {
  if (source.err) {
    return {
      value: undefined,
      err: source.err,
      toolCalls: [],
      isConst: options.isConst ?? false,
      typeAnnotation: options.typeAnnotation ?? null,
      source: options.source,
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
    typeAnnotation?: VibeType;
    source?: ValueSource;
  } = {}
): VibeValue {
  for (const src of sources) {
    if (src.err) {
      return {
        value: undefined,
        err: src.err,
        toolCalls: [],
        isConst: options.isConst ?? false,
        typeAnnotation: options.typeAnnotation ?? null,
        source: options.source,
      };
    }
  }
  return createVibeValue(value, options);
}

// ============================================================================
// Legacy Variable type (being replaced by VibeValue)
// ============================================================================

// Variable entry with mutability flag and optional type
// @deprecated Use VibeValue instead
export interface Variable {
  value: unknown;
  isConst: boolean;
  typeAnnotation: string | null;
  source?: ValueSource;  // Where the value came from (AI response, user input, or code)
}

// Variable in context (for AI calls)
// Note: Models are filtered out - they are config, not data for AI context
export interface ContextVariable {
  kind: 'variable';
  name: string;
  value: unknown;
  type: 'text' | 'json' | 'boolean' | 'number' | null;
  isConst: boolean;
  source?: ValueSource;   // Where the value came from (AI response, user input, or code)
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

// Tool call record for VibeValue (includes timing)
export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: string | null;   // null if error
  error: string | null;    // null if success
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

// Pending AI request info
export interface PendingAI {
  type: 'do' | 'vibe';  // 'do' = single round, 'vibe' = multi-turn tool loop
  prompt: string;
  model: string;
  context: unknown[];
  // Scope parameters for vibe code generation
  vibeScopeParams?: Array<{ name: string; type: string; value: unknown }>;
}

// Expected field for destructuring/typed returns
export interface ExpectedField {
  name: string;
  type: VibeTypeRequired;
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
}

// Exported item from a Vibe module
export type ExportedItem =
  | { kind: 'function'; declaration: AST.FunctionDeclaration }
  | { kind: 'variable'; name: string; value: unknown; isConst: boolean; typeAnnotation: string | null }
  | { kind: 'model'; declaration: AST.ModelDeclaration };

// The complete runtime state (fully serializable)
export interface RuntimeState {
  status: RuntimeStatus;

  // The program
  program: AST.Program;
  functions: Record<string, AST.FunctionDeclaration>;

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
}

// Instructions - what to execute next
// All instructions have a location for error reporting
export type Instruction =
  // Execute AST nodes
  | { op: 'exec_statement'; stmt: AST.Statement; location: SourceLocation }
  | { op: 'exec_expression'; expr: AST.Expression; location: SourceLocation }
  | { op: 'exec_statements'; stmts: AST.Statement[]; index: number; location: SourceLocation }

  // Variable operations (use lastResult)
  | { op: 'declare_var'; name: string; isConst: boolean; type: VibeType; location: SourceLocation }
  | { op: 'assign_var'; name: string; location: SourceLocation }

  // Function calls (functions always forget context - no context mode support)
  | { op: 'call_function'; funcName: string; argCount: number; location: SourceLocation }
  | { op: 'push_frame'; name: string; location: SourceLocation }
  | { op: 'pop_frame'; location: SourceLocation }
  | { op: 'return_value'; location: SourceLocation }

  // Block scoping
  | { op: 'enter_block'; savedKeys: string[]; location: SourceLocation }
  | { op: 'exit_block'; savedKeys: string[]; location: SourceLocation }

  // AI operations (pause points)
  | { op: 'ai_vibe'; model: string | null; context: AST.ContextSpecifier | null; operationType: 'do' | 'vibe'; location: SourceLocation }

  // TypeScript evaluation (pause point)
  | { op: 'ts_eval'; params: string[]; body: string; location: SourceLocation }

  // Imported TS function call (pause point)
  | { op: 'call_imported_ts'; funcName: string; argCount: number; location: SourceLocation }

  // Control flow
  | { op: 'if_branch'; consequent: AST.BlockStatement; alternate?: AST.Statement | null; location: SourceLocation }

  // For-in loop
  | { op: 'for_in_init'; stmt: AST.ForInStatement; location: SourceLocation }
  | { op: 'for_in_iterate'; variable: string; items: unknown[]; index: number; body: AST.BlockStatement; savedKeys: string[]; contextMode?: AST.ContextMode; label: string; entryIndex: number; location: SourceLocation }

  // While loop
  | { op: 'while_init'; stmt: AST.WhileStatement; savedKeys: string[]; location: SourceLocation }
  | { op: 'while_iterate'; stmt: AST.WhileStatement; savedKeys: string[]; contextMode?: AST.ContextMode; label?: string; entryIndex: number; location: SourceLocation }
  | { op: 'while_check'; stmt: AST.WhileStatement; savedKeys: string[]; contextMode?: AST.ContextMode; label?: string; entryIndex: number; location: SourceLocation }

  // Value building (for objects, arrays, function args)
  | { op: 'push_value'; location: SourceLocation }
  | { op: 'build_object'; keys: string[]; location: SourceLocation }
  | { op: 'build_array'; count: number; location: SourceLocation }
  | { op: 'build_range'; location: SourceLocation }
  | { op: 'collect_args'; count: number; location: SourceLocation }

  // Literals
  | { op: 'literal'; value: unknown; location: SourceLocation }

  // String interpolation
  | { op: 'interpolate_string'; template: string; location: SourceLocation }

  // Template literal interpolation (${var} syntax)
  | { op: 'interpolate_template'; template: string; location: SourceLocation }

  // Binary operators
  | { op: 'binary_op'; operator: string; location: SourceLocation }

  // Unary operators
  | { op: 'unary_op'; operator: string; location: SourceLocation }

  // Array access
  | { op: 'index_access'; location: SourceLocation }
  | { op: 'slice_access'; hasStart: boolean; hasEnd: boolean; location: SourceLocation }

  // Method call on object (built-in methods)
  | { op: 'method_call'; method: string; argCount: number; location: SourceLocation }

  // Member/property access (handles VibeValue.toolCalls, VibeValue.err, regular properties, and bound methods)
  | { op: 'member_access'; property: string; location: SourceLocation }

  // Tool operations
  | { op: 'exec_tool_declaration'; decl: AST.ToolDeclaration; location: SourceLocation }

  // Model declaration with tools (uses lastResult as tools array)
  | { op: 'declare_model'; stmt: AST.ModelDeclaration; location: SourceLocation }

  // AI tool call result (for context building)
  | { op: 'ai_tool_call_result'; toolName: string; args: unknown; result: unknown; error?: string; location: SourceLocation }

  // Destructuring assignment (assign multiple fields from AI result)
  | { op: 'destructure_assign'; fields: ExpectedField[]; isConst: boolean; location: SourceLocation };
