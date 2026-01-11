import { describe, it, expect } from 'bun:test';
import {
  executeToolCalls,
  executeWithTools,
  requiresToolExecution,
} from '../tool-loop';
import type { AIToolCall, AIRequest, AIResponse } from '../types';
import type { VibeToolValue } from '../../tools/types';

// Test rootDir for tool context
const TEST_ROOT_DIR = process.cwd();

// Helper to create a simple tool
function createTool(name: string, executor: (args: Record<string, unknown>) => Promise<unknown>): VibeToolValue {
  return {
    __vibeTool: true,
    name,
    schema: {
      name,
      description: `Test tool: ${name}`,
      parameters: [],
    },
    executor: async (args) => executor(args),
  };
}

describe('executeToolCalls', () => {
  it('should execute a single tool call successfully', async () => {
    const tools = [
      createTool('add', async (args) => (args.a as number) + (args.b as number)),
    ];

    const toolCalls: AIToolCall[] = [
      { id: 'call_1', toolName: 'add', args: { a: 2, b: 3 } },
    ];

    const results = await executeToolCalls(toolCalls, tools, TEST_ROOT_DIR);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ toolCallId: 'call_1', result: 5 });
    expect(typeof results[0].duration).toBe('number');
  });

  it('should execute multiple tool calls', async () => {
    const tools = [
      createTool('add', async (args) => (args.a as number) + (args.b as number)),
      createTool('multiply', async (args) => (args.a as number) * (args.b as number)),
    ];

    const toolCalls: AIToolCall[] = [
      { id: 'call_1', toolName: 'add', args: { a: 2, b: 3 } },
      { id: 'call_2', toolName: 'multiply', args: { a: 4, b: 5 } },
    ];

    const results = await executeToolCalls(toolCalls, tools, TEST_ROOT_DIR);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ toolCallId: 'call_1', result: 5 });
    expect(results[1]).toMatchObject({ toolCallId: 'call_2', result: 20 });
  });

  it('should return error for unknown tool', async () => {
    const tools: VibeToolValue[] = [];

    const toolCalls: AIToolCall[] = [
      { id: 'call_1', toolName: 'unknown', args: {} },
    ];

    const results = await executeToolCalls(toolCalls, tools, TEST_ROOT_DIR);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      toolCallId: 'call_1',
      error: "Tool 'unknown' not found",
    });
    expect(results[0].duration).toBe(0);  // No execution time for unknown tool
  });

  it('should return error when tool throws', async () => {
    const tools = [
      createTool('failing', async () => {
        throw new Error('Tool failed');
      }),
    ];

    const toolCalls: AIToolCall[] = [
      { id: 'call_1', toolName: 'failing', args: {} },
    ];

    const results = await executeToolCalls(toolCalls, tools, TEST_ROOT_DIR);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      toolCallId: 'call_1',
      error: 'Tool failed',
    });
    expect(typeof results[0].duration).toBe('number');
  });

  it('should call onToolCall callback for each tool', async () => {
    const tools = [
      createTool('echo', async (args) => args.message),
    ];

    const toolCalls: AIToolCall[] = [
      { id: 'call_1', toolName: 'echo', args: { message: 'hello' } },
    ];

    const callbacks: Array<{ call: AIToolCall; result: unknown; error?: string }> = [];

    await executeToolCalls(toolCalls, tools, TEST_ROOT_DIR, (call, result, error) => {
      callbacks.push({ call, result, error });
    });

    expect(callbacks).toHaveLength(1);
    expect(callbacks[0].call).toEqual(toolCalls[0]);
    expect(callbacks[0].result).toBe('hello');
    expect(callbacks[0].error).toBeUndefined();
  });
});

describe('executeWithTools', () => {
  it('should return immediately if no tool calls', async () => {
    const tools: VibeToolValue[] = [];

    const request: AIRequest = {
      operationType: 'do',
      prompt: 'Hello',
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    const mockResponse: AIResponse = {
      content: 'Hello back!',
      parsedValue: 'Hello back!',
    };

    const executeProvider = async () => mockResponse;

    const { response, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider
    );

    expect(response).toEqual(mockResponse);
    expect(rounds).toHaveLength(0);
  });

  it('should execute tool calls and make follow-up request', async () => {
    const tools = [
      createTool('getWeather', async () => ({ temp: 72, condition: 'sunny' })),
    ];

    const request: AIRequest = {
      operationType: 'do',
      prompt: "What's the weather?",
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    // First response has tool call, second is final
    let callCount = 0;
    const executeProvider = async (): Promise<AIResponse> => {
      callCount++;
      if (callCount === 1) {
        return {
          content: '',
          parsedValue: '',
          toolCalls: [
            { id: 'call_1', toolName: 'getWeather', args: {} },
          ],
          stopReason: 'tool_use',
        };
      }
      return {
        content: "It's 72°F and sunny!",
        parsedValue: "It's 72°F and sunny!",
        stopReason: 'end',
      };
    };

    const { response, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider
    );

    expect(callCount).toBe(2);
    expect(response.content).toBe("It's 72°F and sunny!");
    expect(rounds).toHaveLength(1);
    expect(rounds[0].toolCalls).toHaveLength(1);
    expect(rounds[0].toolCalls[0].toolName).toBe('getWeather');
    expect(rounds[0].results).toHaveLength(1);
    expect(rounds[0].results[0].result).toEqual({ temp: 72, condition: 'sunny' });
  });

  it('should handle multiple rounds of tool calls', async () => {
    const tools = [
      createTool('step1', async () => 'result1'),
      createTool('step2', async () => 'result2'),
    ];

    const request: AIRequest = {
      operationType: 'do',
      prompt: 'Do two steps',
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    let callCount = 0;
    const executeProvider = async (): Promise<AIResponse> => {
      callCount++;
      if (callCount === 1) {
        return {
          content: '',
          parsedValue: '',
          toolCalls: [{ id: 'call_1', toolName: 'step1', args: {} }],
          stopReason: 'tool_use',
        };
      }
      if (callCount === 2) {
        return {
          content: '',
          parsedValue: '',
          toolCalls: [{ id: 'call_2', toolName: 'step2', args: {} }],
          stopReason: 'tool_use',
        };
      }
      return {
        content: 'Done!',
        parsedValue: 'Done!',
        stopReason: 'end',
      };
    };

    const { response, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider
    );

    expect(callCount).toBe(3);
    expect(response.content).toBe('Done!');
    expect(rounds).toHaveLength(2);
    expect(rounds[0].toolCalls[0].toolName).toBe('step1');
    expect(rounds[1].toolCalls[0].toolName).toBe('step2');
  });

  it('should respect maxRounds limit', async () => {
    const tools = [
      createTool('infinite', async () => 'loop'),
    ];

    const request: AIRequest = {
      operationType: 'do',
      prompt: 'Loop forever',
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    // Always returns tool call
    const executeProvider = async (): Promise<AIResponse> => ({
      content: '',
      parsedValue: '',
      toolCalls: [{ id: 'call_1', toolName: 'infinite', args: {} }],
      stopReason: 'tool_use',
    });

    const { rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { maxRounds: 3 }
    );

    // Should stop at maxRounds
    expect(rounds).toHaveLength(3);
  });
});

describe('requiresToolExecution', () => {
  it('should return true when response has tool calls', () => {
    const response: AIResponse = {
      content: '',
      parsedValue: '',
      toolCalls: [{ id: 'call_1', toolName: 'test', args: {} }],
    };

    expect(requiresToolExecution(response)).toBe(true);
  });

  it('should return false when response has no tool calls', () => {
    const response: AIResponse = {
      content: 'Hello',
      parsedValue: 'Hello',
    };

    expect(requiresToolExecution(response)).toBe(false);
  });

  it('should return false when toolCalls is empty', () => {
    const response: AIResponse = {
      content: 'Hello',
      parsedValue: 'Hello',
      toolCalls: [],
    };

    expect(requiresToolExecution(response)).toBe(false);
  });
});
