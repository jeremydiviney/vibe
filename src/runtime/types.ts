import * as AST from '../ast';
import type { SourceLocation } from '../errors';
import type { PendingToolCall } from './tools/types';
import type { VibeModelValue } from './ai/client';

// Runtime status
export type RuntimeStatus =
  | 'running'
  | 'paused'
  | 'awaiting_ai'
  | 'awaiting_user'
  | 'awaiting_ts'
  | 'awaiting_tool'
  | 'awaiting_vibe_code'  // Waiting for vibe-generated code to be processed
  | 'completed'
  | 'error';

// Source of a variable's value
export type ValueSource = 'ai' | 'user' | undefined;

// Variable entry with mutability flag and optional type
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

// Prompt in context (when AI function is called)
export interface ContextPrompt {
  kind: 'prompt';
  aiType: 'do' | 'ask' | 'vibe';
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
      aiType: 'do' | 'ask' | 'vibe';
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
  locals: Record<string, Variable>;
  parentFrameIndex: number | null;  // Lexical parent frame for scope chain
  orderedEntries: FrameEntry[];     // Track order of variable assignments and AI prompts
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

// Scope parameter for vibe code generation
export interface ScopeParam {
  name: string;
  type: string;        // Type annotation for AI prompt context
  value: unknown;      // Current value to pass to generated function
}

// Pending AI request info
export interface PendingAI {
  type: 'do' | 'ask' | 'vibe';
  prompt: string;
  model: string;
  context: unknown[];
  // Vibe-specific fields
  vibeModelValue?: VibeModelValue;       // The model used for vibe (passed to generated function)
  vibeScopeParams?: ScopeParam[];       // Scope parameters to pass to generated function
  vibeExpr?: AST.VibeExpression;        // Original vibe expression for caching
}

// Pending vibe code generation (for retry handling)
export interface PendingVibeGeneration {
  generatedCode: string;                // AI-generated code to parse/validate
  retryCount: number;                   // Current retry attempt
  maxRetries: number;                   // Maximum retry attempts
  lastError?: string;                   // Error from last attempt (for feedback)
  pendingAI: PendingAI;                 // Original pending AI request
}

// Pending TypeScript evaluation (inline ts block)
export interface PendingTS {
  params: string[];
  body: string;
  paramValues: unknown[];
}

// Pending imported TS function call
export interface PendingImportedTsCall {
  funcName: string;
  args: unknown[];
}

// Loaded TypeScript module
export interface TsModule {
  exports: Record<string, unknown>;  // Exported functions/values
}

// Loaded Vibe module
export interface VibeModule {
  exports: Record<string, ExportedItem>;
  program: AST.Program;
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
  pendingTS: PendingTS | null;
  pendingImportedTsCall: PendingImportedTsCall | null;
  pendingToolCall: PendingToolCall | null;
  pendingVibeGeneration: PendingVibeGeneration | null;  // Pending vibe code generation

  // Vibe code generation cache (for cached vibe expressions)
  vibeCache: Record<string, {
    func: AST.FunctionDeclaration;    // Cached generated function
    timestamp: number;                 // When it was generated
  }>;

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
  | { op: 'declare_var'; name: string; isConst: boolean; type: string | null; location: SourceLocation }
  | { op: 'assign_var'; name: string; location: SourceLocation }

  // Function calls
  | { op: 'call_function'; funcName: string; argCount: number; location: SourceLocation }
  | { op: 'push_frame'; name: string; location: SourceLocation }
  | { op: 'pop_frame'; location: SourceLocation }
  | { op: 'return_value'; location: SourceLocation }

  // Block scoping
  | { op: 'enter_block'; savedKeys: string[]; location: SourceLocation }
  | { op: 'exit_block'; savedKeys: string[]; location: SourceLocation }

  // AI operations (pause points)
  | { op: 'ai_do'; model: string; context: AST.ContextSpecifier; location: SourceLocation }
  | { op: 'ai_ask'; model: string; context: AST.ContextSpecifier; location: SourceLocation }
  | {
      op: 'ai_vibe';
      vibeExpr: AST.VibeExpression;       // Original vibe expression (for caching)
      modelName: string;                   // Model identifier name (resolved at runtime)
      location: SourceLocation;
    }

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
  | { op: 'while_iterate'; stmt: AST.WhileStatement; savedKeys: string[]; contextMode?: AST.ContextMode; label: string; entryIndex: number; location: SourceLocation }
  | { op: 'while_check'; stmt: AST.WhileStatement; savedKeys: string[]; contextMode?: AST.ContextMode; label: string; entryIndex: number; location: SourceLocation }

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

  // Tool operations
  | { op: 'exec_tool_declaration'; decl: AST.ToolDeclaration; location: SourceLocation }

  // Model declaration with tools (uses lastResult as tools array)
  | { op: 'declare_model'; stmt: AST.ModelDeclaration; location: SourceLocation }

  // AI tool call result (for context building)
  | { op: 'ai_tool_call_result'; toolName: string; args: unknown; result: unknown; error?: string; location: SourceLocation };
