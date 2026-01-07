// Tool Execution Loop for AI-Initiated Tool Calling
// Handles multi-turn conversations where AI calls tools

import type { AIRequest, AIResponse, AIToolCall, AIToolResult } from './types';
import type { VibeToolValue } from '../tools/types';

/** Options for the tool execution loop */
export interface ToolLoopOptions {
  /** Maximum number of tool calling rounds (default: 10) */
  maxRounds?: number;
  /** Callback when a tool call is executed */
  onToolCall?: (call: AIToolCall, result: unknown, error?: string) => void;
}

/** Result of a tool execution round */
export interface ToolRoundResult {
  /** The tool calls that were executed */
  toolCalls: AIToolCall[];
  /** The results of each tool call */
  results: AIToolResult[];
}

/**
 * Execute a single round of tool calls.
 * Takes the tool calls from an AI response and executes them.
 *
 * @param toolCalls - Tool calls from the AI response
 * @param tools - Array of available tools
 * @param rootDir - Root directory for file operation sandboxing
 * @param onToolCall - Optional callback for each tool execution
 * @returns Results of all tool calls
 */
export async function executeToolCalls(
  toolCalls: AIToolCall[],
  tools: VibeToolValue[],
  rootDir: string,
  onToolCall?: (call: AIToolCall, result: unknown, error?: string) => void
): Promise<AIToolResult[]> {
  const results: AIToolResult[] = [];
  const context = { rootDir };

  // Build a lookup map for quick tool access
  const toolMap = new Map(tools.map(t => [t.name, t]));

  for (const call of toolCalls) {
    const tool = toolMap.get(call.toolName);

    if (!tool) {
      const error = `Tool '${call.toolName}' not found`;
      results.push({ toolCallId: call.id, error, duration: 0 });
      onToolCall?.(call, undefined, error);
      continue;
    }

    const startTime = Date.now();
    try {
      const result = await tool.executor(call.args, context);
      const duration = Date.now() - startTime;
      results.push({ toolCallId: call.id, result, duration });
      onToolCall?.(call, result);
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);
      results.push({ toolCallId: call.id, error, duration });
      onToolCall?.(call, undefined, error);
    }
  }

  return results;
}

/**
 * Execute an AI request with tool calling support.
 * Continues making follow-up calls until the AI returns a final response.
 *
 * @param initialRequest - The initial AI request
 * @param tools - Array of available tools (from model)
 * @param rootDir - Root directory for file operation sandboxing
 * @param executeProvider - Function to execute AI requests
 * @param options - Tool loop options
 * @returns Final AI response after all tool calls are complete
 */
export async function executeWithTools(
  initialRequest: AIRequest,
  tools: VibeToolValue[],
  rootDir: string,
  executeProvider: (request: AIRequest) => Promise<AIResponse>,
  options: ToolLoopOptions = {}
): Promise<{ response: AIResponse; rounds: ToolRoundResult[] }> {
  const { maxRounds = 10, onToolCall } = options;
  const rounds: ToolRoundResult[] = [];

  let request = initialRequest;
  let response = await executeProvider(request);
  let roundCount = 0;

  // Continue while there are tool calls to execute
  while (response.toolCalls?.length && roundCount < maxRounds) {
    roundCount++;

    // Execute all tool calls in this round
    const results = await executeToolCalls(response.toolCalls, tools, rootDir, onToolCall);

    // Record this round
    rounds.push({
      toolCalls: response.toolCalls,
      results,
    });

    // Make follow-up request with tool results
    request = {
      ...request,
      previousToolCalls: response.toolCalls,
      toolResults: results,
    };
    response = await executeProvider(request);
  }

  // Warn if we hit max rounds
  if (roundCount >= maxRounds && response.toolCalls?.length) {
    console.warn(`Tool loop hit max rounds (${maxRounds}), stopping with pending tool calls`);
  }

  return { response, rounds };
}

/**
 * Check if an AI response requires tool execution.
 */
export function requiresToolExecution(response: AIResponse): boolean {
  return (response.toolCalls?.length ?? 0) > 0;
}
