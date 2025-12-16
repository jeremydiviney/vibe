import * as AST from '../ast';

// Runtime status
export type RuntimeStatus =
  | 'running'
  | 'paused'
  | 'awaiting_ai'
  | 'awaiting_user'
  | 'completed'
  | 'error';

// Variable entry with mutability flag and optional type
export interface Variable {
  value: unknown;
  isConst: boolean;
  typeAnnotation: string | null;
}

// Variable in context (for AI calls)
export interface ContextVariable {
  name: string;
  value: unknown;
  type: 'text' | 'json' | 'model' | null;
}

// Stack frame (serializable - uses Record instead of Map)
export interface StackFrame {
  name: string;
  locals: Record<string, Variable>;
  parentFrameIndex: number | null;  // Lexical parent frame for scope chain
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

// The complete runtime state (fully serializable)
export interface RuntimeState {
  status: RuntimeStatus;

  // The program
  program: AST.Program;
  functions: Record<string, AST.FunctionDeclaration>;

  // Execution state
  callStack: StackFrame[];
  instructionStack: Instruction[];
  valueStack: unknown[];  // For building complex values (objects, arrays, args)

  // Results
  lastResult: unknown;
  aiHistory: AIOperation[];
  executionLog: ExecutionEntry[];

  // Context (rebuilt before each instruction)
  localContext: ContextVariable[];
  globalContext: ContextVariable[];

  // Pending async operation
  pendingAI: PendingAI | null;

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

  // Control flow
  | { op: 'if_branch'; consequent: AST.BlockStatement; alternate?: AST.Statement | null }

  // Value building (for objects, arrays, function args)
  | { op: 'push_value' }  // Push lastResult to valueStack
  | { op: 'build_object'; keys: string[] }  // Pop N values, build object
  | { op: 'build_array'; count: number }  // Pop N values, build array
  | { op: 'collect_args'; count: number }  // Pop N values into array for function call

  // Literals
  | { op: 'literal'; value: unknown }

  // String interpolation
  | { op: 'interpolate_string'; template: string };
