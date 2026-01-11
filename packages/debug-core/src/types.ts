/**
 * Shared debug types for Vibe debugger
 */

// Source location in Vibe code
export interface SourceLocation {
  file: string;
  line: number;    // 1-based
  column: number;  // 1-based
}

// Breakpoint definition
export interface Breakpoint {
  id: number;
  file: string;
  line: number;
  verified: boolean;
  condition?: string;  // For conditional breakpoints (Phase 4)
}

// Stack frame for call stack visualization
export interface StackFrame {
  id: number;
  name: string;           // Function/tool name
  source: SourceLocation;
  isVibeCode: boolean;    // true = Vibe, false = TypeScript
}

// Variable for inspection
export interface Variable {
  name: string;
  value: string;          // Display value
  type: string;           // Vibe type (text, number, json, etc.)
  variablesReference: number;  // Non-zero if has children (for objects/arrays)

  // Vibe-specific
  hasError?: boolean;     // true if .err is set
  errorMessage?: string;  // The error message if hasError
  hasToolCalls?: boolean; // true if has .toolCalls
  toolCallCount?: number; // Number of tool calls
}

// Tool call record for VibeValue inspection
export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  error: string | null;
  duration: number;  // ms
}

// Context entry for context visualization
export interface ContextEntry {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
  toolName?: string;  // For tool role
}

// Debug state
export type StepMode = 'none' | 'into' | 'over' | 'out';

export type StopReason =
  | 'entry'        // Stopped on program entry
  | 'breakpoint'   // Hit a breakpoint
  | 'step'         // Completed a step
  | 'pause'        // User requested pause
  | 'exception';   // Exception thrown

export interface DebugState {
  running: boolean;
  paused: boolean;
  pausedAt: SourceLocation | null;
  stopReason: StopReason | null;
  stepMode: StepMode;
}

// Scope types for variable grouping
export type ScopeType =
  | 'local'        // Local function variables
  | 'global'       // Global variables
  | 'context'      // AI context (default or local)
  | 'closure';     // Closure variables

export interface Scope {
  name: string;
  type: ScopeType;
  variablesReference: number;
  expensive: boolean;  // true if fetching variables is expensive
}
