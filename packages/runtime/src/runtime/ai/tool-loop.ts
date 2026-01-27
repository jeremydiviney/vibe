// Tool Execution Loop for AI-Initiated Tool Calling
// Handles multi-turn conversations where AI calls tools

import type { AIRequest, AIResponse, AIToolCall, AIToolResult, TokenUsage } from './types';
import type { VibeToolValue } from '../tools/types';
import { isReturnToolCall } from './return-tools';

/**
 * Accumulate token usage from multiple API responses.
 */
function accumulateUsage(total: TokenUsage, next?: TokenUsage): TokenUsage {
  if (!next) return total;
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    thinkingTokens: (total.thinkingTokens ?? 0) + (next.thinkingTokens ?? 0) || undefined,
    cachedInputTokens: (total.cachedInputTokens ?? 0) + (next.cachedInputTokens ?? 0) || undefined,
    cacheCreationTokens: (total.cacheCreationTokens ?? 0) + (next.cacheCreationTokens ?? 0) || undefined,
  };
}

/** Options for the tool execution loop */
export interface ToolLoopOptions {
  /** Maximum number of tool calling rounds (default: 10) */
  maxRounds?: number;
  /** Callback when a tool call is executed */
  onToolCall?: (call: AIToolCall, result: unknown, error?: string) => void;
  /** Expected return tool name (if set, AI must call this tool to return a value) */
  expectedReturnTool?: string;
  /** Expected field names that must ALL be returned via the return tool */
  expectedFieldNames?: string[];
}

/** A retry attempt where AI didn't call tools */
export interface RetryAttempt {
  /** The AI's response that triggered the retry (text response without tool calls) */
  aiResponse: string;
  /** Raw API response that triggered the retry (for debugging) */
  rawResponse?: string;
  /** The follow-up message sent to the AI */
  followUpMessage: string;
  /** The AI's response to the follow-up */
  followUpResponse: string;
  /** Raw API response to the follow-up (for debugging) */
  rawFollowUpResponse?: string;
}

/** Result of the tool execution loop */
export interface ToolLoopResult {
  /** Final AI response */
  response: AIResponse;
  /** Tool execution rounds */
  rounds: ToolRoundResult[];
  /** All values from return tool calls (for multi-field destructuring) */
  returnFieldResults?: unknown[];
  /** Whether execution completed via return tool */
  completedViaReturnTool?: boolean;
  /** Retry attempts where AI didn't call tools (for debugging) */
  retryAttempts?: RetryAttempt[];
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
): Promise<ToolLoopResult> {
  const { maxRounds = 10, onToolCall, expectedReturnTool, expectedFieldNames } = options;
  const rounds: ToolRoundResult[] = [];

  let request = initialRequest;
  let response = await executeProvider(request);
  let roundCount = 0;
  let returnFieldResults: unknown[] = [];
  let completedViaReturnTool = false;
  const retryAttempts: RetryAttempt[] = [];

  // Accumulate token usage across all rounds
  let totalUsage: TokenUsage = response.usage ?? { inputTokens: 0, outputTokens: 0 };

  // Track which expected fields have been collected
  const collectedFields = new Set<string>();

  // Continue while there are tool calls to execute (or we need to retry for missing return tool)
  while (roundCount < maxRounds) {
    // Case 1: AI called tools
    if (response.toolCalls?.length) {
      roundCount++;

      // Execute all tool calls in this round
      const results = await executeToolCalls(response.toolCalls, tools, rootDir, onToolCall);

      // Record this round
      rounds.push({
        toolCalls: response.toolCalls,
        results,
      });

      // Collect all return tool results from this round
      for (const call of response.toolCalls) {
        if (isReturnToolCall(call.toolName)) {
          const result = results.find((r) => r.toolCallId === call.id);
          if (result && result.error === undefined) {
            // Return tool succeeded - collect result
            returnFieldResults.push(result.result);
            completedViaReturnTool = true;
            // Track which field was returned (default to 'value' for single-value returns)
            const fieldName = typeof call.args?.field === 'string' ? call.args.field : 'value';
            collectedFields.add(fieldName);
          }
          // If return tool errored, error flows back to AI for retry
        }
      }

      // Check if all expected fields have been collected
      if (completedViaReturnTool && expectedFieldNames?.length) {
        const missingFields = expectedFieldNames.filter(f => !collectedFields.has(f));
        if (missingFields.length > 0) {
          // Not all fields returned - ask AI to provide the missing ones
          const missingList = missingFields.map(f => `"${f}"`).join(', ');
          const followUpMessage = `You are missing required fields. Use the appropriate __vibe_return_* tool for each of: ${missingList}`;

          request = {
            ...request,
            previousToolCalls: response.toolCalls,
            toolResults: results,
            followUpMessage,
          };
          response = await executeProvider(request);
          totalUsage = accumulateUsage(totalUsage, response.usage);
          continue;
        }
      }

      // All expected fields collected (or no specific fields expected) - we're done
      if (completedViaReturnTool) {
        break;
      }

      // Make follow-up request with tool results
      request = {
        ...request,
        previousToolCalls: response.toolCalls,
        toolResults: results,
        followUpMessage: undefined,
      };
      response = await executeProvider(request);
      totalUsage = accumulateUsage(totalUsage, response.usage);
    }
    // Case 2: AI didn't call any tools but we expected a return tool
    else if (expectedReturnTool && !completedViaReturnTool) {
      roundCount++;

      // Capture the AI's response that triggered this retry
      const aiResponse = response.content ?? '';
      const rawResponse = response.rawResponse;

      // Send follow-up message asking AI to use the tool
      const followUpMessage = `You must use the ${expectedReturnTool}* tools (e.g., __vibe_return_text, __vibe_return_boolean, etc.) to return your answer. Do not respond with plain text.`;
      request = {
        ...request,
        previousToolCalls: undefined,
        toolResults: undefined,
        followUpMessage,
      };
      response = await executeProvider(request);
      totalUsage = accumulateUsage(totalUsage, response.usage);

      // Track retry attempt for debugging
      retryAttempts.push({
        aiResponse,
        rawResponse,
        followUpMessage,
        followUpResponse: response.content ?? '',
        rawFollowUpResponse: response.rawResponse,
      });
    }
    // Case 3: No tool calls and no expected return tool - we're done
    else {
      break;
    }
  }

  // Warn if we hit max rounds
  if (roundCount >= maxRounds && !completedViaReturnTool && expectedReturnTool) {
    console.warn(
      `Tool loop hit max rounds (${maxRounds}) without receiving expected return tool call`
    );
  } else if (roundCount >= maxRounds && response.toolCalls?.length) {
    console.warn(`Tool loop hit max rounds (${maxRounds}), stopping with pending tool calls`);
  }

  // Set aggregated usage on the response (includes all rounds)
  response.usage = totalUsage.inputTokens > 0 ? totalUsage : undefined;

  return {
    response,
    rounds,
    returnFieldResults: returnFieldResults.length > 0 ? returnFieldResults : undefined,
    completedViaReturnTool,
    retryAttempts: retryAttempts.length > 0 ? retryAttempts : undefined,
  };
}

/**
 * Check if an AI response requires tool execution.
 */
export function requiresToolExecution(response: AIResponse): boolean {
  return (response.toolCalls?.length ?? 0) > 0;
}
