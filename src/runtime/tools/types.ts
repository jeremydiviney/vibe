import type { SourceLocation } from '../../errors';
import type * as AST from '../../ast';

// JSON Schema type for tool parameters
export interface JsonSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean;
}

// Tool parameter schema for AI function calling
export interface ToolParameterSchema {
  name: string;
  type: JsonSchema;
  description?: string;
  required: boolean;
}

// Tool schema for AI function calling
export interface ToolSchema {
  name: string;
  description?: string;
  parameters: ToolParameterSchema[];
  returns?: JsonSchema;
}

// Tool executor function signature
export type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

// Registered tool (built-in or user-defined)
export interface RegisteredTool {
  name: string;
  kind: 'builtin' | 'user';
  schema: ToolSchema;
  executor: ToolExecutor;
  declaration?: AST.ToolDeclaration; // For user-defined tools
  location?: SourceLocation;
}

// Tool registry interface
export interface ToolRegistry {
  register(tool: RegisteredTool): void;
  get(name: string): RegisteredTool | undefined;
  has(name: string): boolean;
  list(): RegisteredTool[];
  getSchemas(): ToolSchema[];
}

// Pending tool call (when runtime is paused)
export interface PendingToolCall {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  // For multi-turn AI tool calling (deferred for now)
  aiConversationState?: unknown;
}

// Tool execution result
export interface ToolResult {
  value: unknown;
  error?: string;
}
