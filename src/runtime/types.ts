import * as AST from '../ast';
import type { SourceLocation } from '../errors';

// Runtime status
export type RuntimeStatus =
  | 'running'
  | 'paused'
  | 'awaiting_ai'
  | 'awaiting_user'
  | 'awaiting_ts'
  | 'completed'
  | 'error';

// Variable entry with mutability flag and optional type
export interface Variable {
  value: unknown;
  isConst: boolean;
  typeAnnotation: string | null;
}

// Variable in context (for AI calls)
// Note: Models are filtered out - they are config, not data for AI context
export interface ContextVariable {
  kind: 'variable';
  name: string;
  value: unknown;
  type: 'text' | 'json' | 'boolean' | 'number' | null;
  isConst: boolean;
  // Call stack location info (helps AI understand variable scope)
  frameName: string;      // Name of the function/scope (e.g., "main", "processData")
  frameDepth: number;     // 0 = deepest/current frame, higher = older frames
}

// Prompt in context (when AI function is called)
export interface ContextPrompt {
  kind: 'prompt';
  aiType: 'do' | 'ask' | 'vibe';
  prompt: string;
  frameName: string;
  frameDepth: number;
}

// Context entry - either a variable or a prompt
export type ContextEntry = ContextVariable | ContextPrompt;

// Ordered entry - tracks order of variable assignments and AI prompts in a frame
export type FrameEntry =
  | { kind: 'variable'; name: string }
  | { kind: 'prompt'; aiType: 'do' | 'ask' | 'vibe'; prompt: string };

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

// Detailed AI interaction for debugging/logging
// Captures the exact messages sent to the model
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
  };
  // The exact messages sent to the AI model
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  targetType: string | null;
  usage?: TokenUsage;
  durationMs?: number;
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
  type: 'do' | 'ask' | 'vibe';
  prompt: string;
  model: string;
  context: unknown[];
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
  | { op: 'ai_vibe'; model: string; context: AST.ContextSpecifier; location: SourceLocation }

  // TypeScript evaluation (pause point)
  | { op: 'ts_eval'; params: string[]; body: string; location: SourceLocation }

  // Imported TS function call (pause point)
  | { op: 'call_imported_ts'; funcName: string; argCount: number; location: SourceLocation }

  // Control flow
  | { op: 'if_branch'; consequent: AST.BlockStatement; alternate?: AST.Statement | null; location: SourceLocation }

  // For-in loop
  | { op: 'for_in_init'; stmt: AST.ForInStatement; location: SourceLocation }
  | { op: 'for_in_iterate'; variable: string; items: unknown[]; index: number; body: AST.BlockStatement; savedKeys: string[]; location: SourceLocation }

  // While loop
  | { op: 'while_init'; stmt: AST.WhileStatement; savedKeys: string[]; location: SourceLocation }
  | { op: 'while_iterate'; stmt: AST.WhileStatement; savedKeys: string[]; location: SourceLocation }

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
  | { op: 'method_call'; method: string; argCount: number; location: SourceLocation };
