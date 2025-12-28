import * as AST from '../ast';

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

  // Context (rebuilt before each instruction)
  localContext: ContextEntry[];
  globalContext: ContextEntry[];

  // Pending async operation
  pendingAI: PendingAI | null;
  pendingTS: PendingTS | null;
  pendingImportedTsCall: PendingImportedTsCall | null;

  // Error info
  error: string | null;
}

// Instructions - what to execute next
export type Instruction =
  // Execute AST nodes
  | { op: 'exec_statement'; stmt: AST.Statement }
  | { op: 'exec_expression'; expr: AST.Expression }
  | { op: 'exec_statements'; stmts: AST.Statement[]; index: number }

  // Variable operations (use lastResult)
  | { op: 'declare_var'; name: string; isConst: boolean; type: string | null }
  | { op: 'assign_var'; name: string }

  // Function calls
  | { op: 'call_function'; funcName: string; argCount: number }
  | { op: 'push_frame'; name: string }
  | { op: 'pop_frame' }
  | { op: 'return_value' }

  // Block scoping
  | { op: 'enter_block'; savedKeys: string[] }
  | { op: 'exit_block'; savedKeys: string[] }

  // AI operations (pause points)
  | { op: 'ai_do'; model: string; context: AST.ContextSpecifier }
  | { op: 'ai_ask'; model: string; context: AST.ContextSpecifier }
  | { op: 'ai_vibe'; model: string; context: AST.ContextSpecifier }

  // TypeScript evaluation (pause point)
  | { op: 'ts_eval'; params: string[]; body: string }

  // Imported TS function call (pause point)
  | { op: 'call_imported_ts'; funcName: string; argCount: number }

  // Control flow
  | { op: 'if_branch'; consequent: AST.BlockStatement; alternate?: AST.Statement | null }

  // For-in loop
  | { op: 'for_in_init'; stmt: AST.ForInStatement }
  | { op: 'for_in_iterate'; variable: string; items: unknown[]; index: number; body: AST.BlockStatement; savedKeys: string[] }

  // While loop
  | { op: 'while_init'; stmt: AST.WhileStatement; savedKeys: string[] }
  | { op: 'while_iterate'; stmt: AST.WhileStatement; savedKeys: string[] }

  // Value building (for objects, arrays, function args)
  | { op: 'push_value' }  // Push lastResult to valueStack
  | { op: 'build_object'; keys: string[] }  // Pop N values, build object
  | { op: 'build_array'; count: number }  // Pop N values, build array
  | { op: 'build_range' }  // Pop end, pop start, build inclusive range array
  | { op: 'collect_args'; count: number }  // Pop N values into array for function call

  // Literals
  | { op: 'literal'; value: unknown }

  // String interpolation
  | { op: 'interpolate_string'; template: string }

  // Template literal interpolation (${var} syntax)
  | { op: 'interpolate_template'; template: string }

  // Binary operators
  | { op: 'binary_op'; operator: string }

  // Unary operators
  | { op: 'unary_op'; operator: string }

  // Array access
  | { op: 'index_access' }
  | { op: 'slice_access'; hasStart: boolean; hasEnd: boolean }

  // Method call on object (built-in methods)
  | { op: 'method_call'; method: string; argCount: number };
