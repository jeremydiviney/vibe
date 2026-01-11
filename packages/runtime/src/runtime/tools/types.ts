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

// Context passed to tool executors
export interface ToolContext {
  rootDir: string;  // Root directory for path sandboxing
}

// Tool executor function signature
export type ToolExecutor = (
  args: Record<string, unknown>,
  context?: ToolContext
) => Promise<unknown>;

// Pending tool call (when runtime is paused)
export interface PendingToolCall {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  executor: ToolExecutor;  // The tool's executor function
  // For multi-turn AI tool calling (deferred for now)
  aiConversationState?: unknown;
}

// Tool execution result
export interface ToolResult {
  value: unknown;
  error?: string;
}

// Tool as a first-class Vibe value (like VibeModelValue)
// This is the value stored when a tool declaration is executed
export interface VibeToolValue {
  __vibeTool: true;           // Type guard marker
  name: string;
  schema: ToolSchema;
  executor: ToolExecutor;
}

// Type guard for VibeToolValue
export function isVibeToolValue(value: unknown): value is VibeToolValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__vibeTool' in value &&
    (value as VibeToolValue).__vibeTool === true
  );
}

// Registered tool in the registry
export interface RegisteredTool {
  name: string;
  kind: 'builtin' | 'user';
  schema: ToolSchema;
  executor: ToolExecutor;
}

// Tool registry interface
export interface ToolRegistry {
  register(tool: RegisteredTool): void;
  registerAll(tools: RegisteredTool[]): void;
  get(name: string): RegisteredTool | undefined;
  has(name: string): boolean;
  list(): RegisteredTool[];
  getSchemas(): ToolSchema[];
}
