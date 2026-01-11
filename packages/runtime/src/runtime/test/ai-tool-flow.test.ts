import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, type AIProvider, type AIExecutionResult } from '../index';
import { executeWithTools, type ToolRoundResult } from '../ai/tool-loop';
import type { AIRequest, AIResponse } from '../ai/types';
import type { VibeToolValue, ToolSchema } from '../tools/types';
import { formatContextForAI, buildLocalContext } from '../context';

/**
 * Tool calling flow tests with mocked AI responses.
 *
 * These tests verify the tool calling flow works correctly when an AI
 * response includes tool calls. The AI provider is mocked, but real tools
 * are registered and executed.
 *
 * The flow being tested:
 * 1. `do` command is executed
 * 2. Mocked AI provider returns tool calls
 * 3. Registered tools are actually executed
 * 4. Tool results are passed back to AI (mocked followup)
 * 5. Final response is returned to variable
 * 6. Context shows tool call history
 *
 * For tests that call real AI APIs, see tests/integration/
 */

// Track tool executions for verification
interface ToolExecution {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

/**
 * Create an AI provider that simulates tool calling by using executeWithTools
 * with a controllable mock backend.
 */
function createToolCallingAIProvider(
  mockResponses: AIResponse[],
  toolExecutions: ToolExecution[],
  testTools: VibeToolValue[]
): AIProvider {
  let callIndex = 0;

  // Wrap tool executors to track executions
  const trackedTools: VibeToolValue[] = testTools.map(tool => ({
    ...tool,
    executor: async (args: Record<string, unknown>) => {
      const result = await tool.executor(args, { rootDir: process.cwd() });
      toolExecutions.push({ name: tool.name, args, result });
      return result;
    },
  }));

  return {
    async execute(prompt: string): Promise<AIExecutionResult> {
      // Mock provider that returns responses in sequence
      const mockProviderExecutor = async (request: AIRequest): Promise<AIResponse> => {
        const response = mockResponses[callIndex] ?? mockResponses[mockResponses.length - 1];
        callIndex++;
        return response;
      };

      // Use executeWithTools to actually execute tools
      const { response, rounds } = await executeWithTools(
        {
          prompt,
          model: { name: 'mock', apiKey: 'mock', url: null },
          operationType: 'do',
          contextText: '',
          targetType: null,
        },
        trackedTools,
        process.cwd(),  // Test rootDir for path sandboxing
        mockProviderExecutor,
        { maxRounds: 10 }
      );

      return {
        value: response.parsedValue ?? response.content,
        usage: response.usage,
        toolRounds: rounds.length > 0 ? rounds : undefined,
      };
    },

    async generateCode(prompt: string): Promise<AIExecutionResult> {
      return { value: `// Generated for: ${prompt}` };
    },

    async askUser(prompt: string): Promise<string> {
      throw new Error('User input not implemented in test');
    },
  };
}

// Simple test tools that don't have side effects
function createTestTools(): VibeToolValue[] {
  return [
    {
      __vibeTool: true,
      name: 'add',
      schema: {
        name: 'add',
        description: 'Add two numbers',
        parameters: [
          { name: 'a', type: { type: 'number' }, required: true },
          { name: 'b', type: { type: 'number' }, required: true },
        ],
      },
      executor: async (args) => (args.a as number) + (args.b as number),
    },
    {
      __vibeTool: true,
      name: 'multiply',
      schema: {
        name: 'multiply',
        description: 'Multiply two numbers',
        parameters: [
          { name: 'a', type: { type: 'number' }, required: true },
          { name: 'b', type: { type: 'number' }, required: true },
        ],
      },
      executor: async (args) => (args.a as number) * (args.b as number),
    },
    {
      __vibeTool: true,
      name: 'getWeather',
      schema: {
        name: 'getWeather',
        description: 'Get weather for a city',
        parameters: [
          { name: 'city', type: { type: 'string' }, required: true },
        ],
      },
      executor: async (args) => {
        const city = args.city as string;
        // Return mock weather data based on city
        const weatherData: Record<string, { temp: number; condition: string }> = {
          'Seattle': { temp: 55, condition: 'rainy' },
          'San Francisco': { temp: 68, condition: 'sunny' },
          'New York': { temp: 45, condition: 'cloudy' },
        };
        return weatherData[city] ?? { temp: 70, condition: 'unknown' };
      },
    },
  ];
}

describe('AI Tool Calling Flow', () => {
  test('single tool call is executed and result returned to AI', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result: text = vibe "Calculate 5 + 3" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const testTools = createTestTools();

    // Mock responses: first returns tool call, second returns final answer
    const mockResponses: AIResponse[] = [
      {
        content: '',
        parsedValue: '',
        toolCalls: [
          { id: 'call_1', toolName: 'add', args: { a: 5, b: 3 } },
        ],
        stopReason: 'tool_use',
      },
      {
        content: 'The result of 5 + 3 is 8',
        parsedValue: 'The result of 5 + 3 is 8',
        stopReason: 'end',
      },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    const result = await runtime.run();

    // Verify tool was actually executed
    expect(toolExecutions).toHaveLength(1);
    expect(toolExecutions[0]).toEqual({
      name: 'add',
      args: { a: 5, b: 3 },
      result: 8,
    });

    // Verify final result
    expect(runtime.getValue('result')).toBe('The result of 5 + 3 is 8');
  });

  test('multiple tool calls in single response are all executed', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let weather: text = vibe "What's the weather in Seattle and SF?" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const testTools = createTestTools();

    // Mock responses: first returns two tool calls, second returns final answer
    const mockResponses: AIResponse[] = [
      {
        content: '',
        parsedValue: '',
        toolCalls: [
          { id: 'call_1', toolName: 'getWeather', args: { city: 'Seattle' } },
          { id: 'call_2', toolName: 'getWeather', args: { city: 'San Francisco' } },
        ],
        stopReason: 'tool_use',
      },
      {
        content: 'Seattle is 55°F and rainy, San Francisco is 68°F and sunny.',
        parsedValue: 'Seattle is 55°F and rainy, San Francisco is 68°F and sunny.',
        stopReason: 'end',
      },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    // Verify both tools were executed
    expect(toolExecutions).toHaveLength(2);
    expect(toolExecutions[0]).toEqual({
      name: 'getWeather',
      args: { city: 'Seattle' },
      result: { temp: 55, condition: 'rainy' },
    });
    expect(toolExecutions[1]).toEqual({
      name: 'getWeather',
      args: { city: 'San Francisco' },
      result: { temp: 68, condition: 'sunny' },
    });

    // Verify final result
    expect(runtime.getValue('weather')).toBe('Seattle is 55°F and rainy, San Francisco is 68°F and sunny.');
  });

  test('multiple rounds of tool calls are executed sequentially', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result: text = vibe "Calculate (2+3) * 4" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const testTools = createTestTools();

    // Mock responses: first round adds, second round multiplies, third is final
    const mockResponses: AIResponse[] = [
      {
        content: '',
        parsedValue: '',
        toolCalls: [
          { id: 'call_1', toolName: 'add', args: { a: 2, b: 3 } },
        ],
        stopReason: 'tool_use',
      },
      {
        content: '',
        parsedValue: '',
        toolCalls: [
          { id: 'call_2', toolName: 'multiply', args: { a: 5, b: 4 } },
        ],
        stopReason: 'tool_use',
      },
      {
        content: 'The result of (2+3) * 4 is 20',
        parsedValue: 'The result of (2+3) * 4 is 20',
        stopReason: 'end',
      },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    // Verify tools were executed in order
    expect(toolExecutions).toHaveLength(2);
    expect(toolExecutions[0]).toEqual({
      name: 'add',
      args: { a: 2, b: 3 },
      result: 5,
    });
    expect(toolExecutions[1]).toEqual({
      name: 'multiply',
      args: { a: 5, b: 4 },
      result: 20,
    });

    // Verify final result
    expect(runtime.getValue('result')).toBe('The result of (2+3) * 4 is 20');

    // Verify formatted context shows all tool calls in order
    const state = runtime.getState();
    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    expect(formatted.text).toBe(
      `  <entry> (current scope)
    --> vibe: "Calculate (2+3) * 4"
    [tool] add({"a":2,"b":3})
    [result] 5
    [tool] multiply({"a":5,"b":4})
    [result] 20
    <-- result (text): The result of (2+3) * 4 is 20`
    );
  });

  test('tool calls appear in context for subsequent AI calls', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let first: text = vibe "What's 2 + 2?" m default
      let second: text = vibe "What was the previous result?" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const testTools = createTestTools();

    // We need to track if context includes tool calls from first do
    let secondCallContext = '';

    const mockResponses: AIResponse[] = [
      // First do call - returns tool call
      {
        content: '',
        parsedValue: '',
        toolCalls: [
          { id: 'call_1', toolName: 'add', args: { a: 2, b: 2 } },
        ],
        stopReason: 'tool_use',
      },
      // First do call - final response
      {
        content: 'The result is 4',
        parsedValue: 'The result is 4',
        stopReason: 'end',
      },
      // Second do call - no tool calls
      {
        content: 'The previous result was 4',
        parsedValue: 'The previous result was 4',
        stopReason: 'end',
      },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    // Verify tool was executed
    expect(toolExecutions).toHaveLength(1);
    expect(toolExecutions[0].result).toBe(4);

    // Verify both results assigned correctly
    expect(runtime.getValue('first')).toBe('The result is 4');
    expect(runtime.getValue('second')).toBe('The previous result was 4');

    // Get state and check that tool calls are embedded in prompt entries
    const state = runtime.getState();
    const frame = state.callStack[state.callStack.length - 1];

    // Find prompt entries that have toolCalls
    const promptEntries = frame.orderedEntries.filter(e => e.kind === 'prompt');
    expect(promptEntries).toHaveLength(2); // first and second do calls

    // First prompt should have the tool call embedded
    const firstPrompt = promptEntries[0];
    expect(firstPrompt.kind).toBe('prompt');
    if (firstPrompt.kind === 'prompt') {
      expect(firstPrompt.toolCalls).toHaveLength(1);
      expect(firstPrompt.toolCalls![0]).toEqual({
        toolName: 'add',
        args: { a: 2, b: 2 },
        result: 4,
      });
    }
  });

  test('AI call with no tool calls works normally', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let greeting: text = vibe "Say hello" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const testTools = createTestTools();

    // Mock response with no tool calls
    const mockResponses: AIResponse[] = [
      {
        content: 'Hello, world!',
        parsedValue: 'Hello, world!',
        stopReason: 'end',
      },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    // No tools should be executed
    expect(toolExecutions).toHaveLength(0);

    // Verify result
    expect(runtime.getValue('greeting')).toBe('Hello, world!');
  });

  test('tool call errors are captured and passed to AI', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result: text = vibe "Try to do something that fails" m default
    `);

    const toolExecutions: ToolExecution[] = [];

    // Create a tool that throws an error
    const testTools: VibeToolValue[] = [
      {
        __vibeTool: true,
        name: 'failingTool',
        schema: {
          name: 'failingTool',
          description: 'A tool that always fails',
          parameters: [],
        },
        executor: async () => {
          throw new Error('Tool execution failed!');
        },
      },
    ];

    // Mock responses: first returns tool call, AI handles error, then final response
    const mockResponses: AIResponse[] = [
      {
        content: '',
        parsedValue: '',
        toolCalls: [
          { id: 'call_1', toolName: 'failingTool', args: {} },
        ],
        stopReason: 'tool_use',
      },
      {
        content: 'I tried to use a tool but it failed. Let me handle that gracefully.',
        parsedValue: 'I tried to use a tool but it failed. Let me handle that gracefully.',
        stopReason: 'end',
      },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    // Tool execution was attempted (even though it failed)
    // Note: Our tracking wrapper won't capture failed executions, but the flow should complete
    expect(runtime.getValue('result')).toBe('I tried to use a tool but it failed. Let me handle that gracefully.');
  });
});

describe('AI Tool Calling - Do Command (Single Round)', () => {
  test('do command with tool calls shows tool history in context for second do call', async () => {
    // This test verifies that when using `do`:
    // 1. First `do` call triggers tool execution (single round)
    // 2. Second `do` call can see the tool calls and results from the first `do` in its context
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let first: text = do "Calculate 5 + 3 and 2 * 4" m default
      let second: text = do "What were the previous calculations?" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const testTools = createTestTools();

    // Mock responses:
    // First do call - returns two tool calls, then final response (single round for do)
    // Second do call - just returns a response (no tools)
    const mockResponses: AIResponse[] = [
      // First do: AI requests two tool calls
      {
        content: '',
        parsedValue: '',
        toolCalls: [
          { id: 'call_1', toolName: 'add', args: { a: 5, b: 3 } },
          { id: 'call_2', toolName: 'multiply', args: { a: 2, b: 4 } },
        ],
        stopReason: 'tool_use',
      },
      // First do: Final response after tools execute
      {
        content: '5 + 3 = 8 and 2 * 4 = 8',
        parsedValue: '5 + 3 = 8 and 2 * 4 = 8',
        stopReason: 'end',
      },
      // Second do: Response referencing previous context
      {
        content: 'Previously: add(5,3)=8 and multiply(2,4)=8',
        parsedValue: 'Previously: add(5,3)=8 and multiply(2,4)=8',
        stopReason: 'end',
      },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    // Verify both tools were executed in the first do call
    expect(toolExecutions).toHaveLength(2);
    expect(toolExecutions[0]).toEqual({
      name: 'add',
      args: { a: 5, b: 3 },
      result: 8,
    });
    expect(toolExecutions[1]).toEqual({
      name: 'multiply',
      args: { a: 2, b: 4 },
      result: 8,
    });

    // Verify both results assigned correctly
    expect(runtime.getValue('first')).toBe('5 + 3 = 8 and 2 * 4 = 8');
    expect(runtime.getValue('second')).toBe('Previously: add(5,3)=8 and multiply(2,4)=8');

    // Get state and verify context structure
    const state = runtime.getState();
    const frame = state.callStack[state.callStack.length - 1];

    // Find prompt entries
    const promptEntries = frame.orderedEntries.filter(e => e.kind === 'prompt');
    expect(promptEntries).toHaveLength(2); // first and second do calls

    // First prompt should have the two tool calls embedded
    const firstPrompt = promptEntries[0];
    expect(firstPrompt.kind).toBe('prompt');
    if (firstPrompt.kind === 'prompt') {
      expect(firstPrompt.aiType).toBe('do');
      expect(firstPrompt.toolCalls).toHaveLength(2);
      expect(firstPrompt.toolCalls![0]).toEqual({
        toolName: 'add',
        args: { a: 5, b: 3 },
        result: 8,
      });
      expect(firstPrompt.toolCalls![1]).toEqual({
        toolName: 'multiply',
        args: { a: 2, b: 4 },
        result: 8,
      });
      expect(firstPrompt.response).toBe('5 + 3 = 8 and 2 * 4 = 8');
    }

    // Second prompt should have no tool calls
    const secondPrompt = promptEntries[1];
    if (secondPrompt.kind === 'prompt') {
      expect(secondPrompt.aiType).toBe('do');
      expect(secondPrompt.toolCalls).toBeUndefined();
      expect(secondPrompt.response).toBe('Previously: add(5,3)=8 and multiply(2,4)=8');
    }

    // Verify formatted context shows the complete history
    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    expect(formatted.text).toBe(
      `  <entry> (current scope)
    --> do: "Calculate 5 + 3 and 2 * 4"
    [tool] add({"a":5,"b":3})
    [result] 8
    [tool] multiply({"a":2,"b":4})
    [result] 8
    <-- first (text): 5 + 3 = 8 and 2 * 4 = 8
    --> do: "What were the previous calculations?"
    <-- second (text): Previously: add(5,3)=8 and multiply(2,4)=8`
    );
  });
});

describe('AI Tool Calling - Formatted Context Output', () => {
  test('formatted context shows tool calls and results', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result: text = vibe "Calculate 5 + 3" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const testTools = createTestTools();

    const mockResponses: AIResponse[] = [
      {
        content: '',
        parsedValue: '',
        toolCalls: [
          { id: 'call_1', toolName: 'add', args: { a: 5, b: 3 } },
        ],
        stopReason: 'tool_use',
      },
      {
        content: 'The answer is 8',
        parsedValue: 'The answer is 8',
        stopReason: 'end',
      },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    // Get the formatted context
    const state = runtime.getState();
    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    // Verify formatted output shows: AI call → tool calls → response (via variable)
    expect(formatted.text).toBe(
      `  <entry> (current scope)
    --> vibe: "Calculate 5 + 3"
    [tool] add({"a":5,"b":3})
    [result] 8
    <-- result (text): The answer is 8`
    );
  });

  test('formatted context shows multiple tool calls in sequence', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let weather: text = vibe "Weather in Seattle and NYC?" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const testTools = createTestTools();

    const mockResponses: AIResponse[] = [
      {
        content: '',
        parsedValue: '',
        toolCalls: [
          { id: 'call_1', toolName: 'getWeather', args: { city: 'Seattle' } },
          { id: 'call_2', toolName: 'getWeather', args: { city: 'New York' } },
        ],
        stopReason: 'tool_use',
      },
      {
        content: 'Seattle: 55F rainy, NYC: 45F cloudy',
        parsedValue: 'Seattle: 55F rainy, NYC: 45F cloudy',
        stopReason: 'end',
      },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    const state = runtime.getState();
    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    expect(formatted.text).toBe(
      `  <entry> (current scope)
    --> vibe: "Weather in Seattle and NYC?"
    [tool] getWeather({"city":"Seattle"})
    [result] {"temp":55,"condition":"rainy"}
    [tool] getWeather({"city":"New York"})
    [result] {"temp":45,"condition":"cloudy"}
    <-- weather (text): Seattle: 55F rainy, NYC: 45F cloudy`
    );
  });

  test('formatted context shows tool call error', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result: text = vibe "Try the failing tool" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const failingTools: VibeToolValue[] = [
      {
        __vibeTool: true,
        name: 'riskyOperation',
        schema: {
          name: 'riskyOperation',
          description: 'A risky operation',
          parameters: [],
        },
        executor: async () => {
          throw new Error('Operation failed: insufficient permissions');
        },
      },
    ];

    const mockResponses: AIResponse[] = [
      {
        content: '',
        parsedValue: '',
        toolCalls: [
          { id: 'call_1', toolName: 'riskyOperation', args: {} },
        ],
        stopReason: 'tool_use',
      },
      {
        content: 'The operation failed due to permissions',
        parsedValue: 'The operation failed due to permissions',
        stopReason: 'end',
      },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, failingTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    const state = runtime.getState();
    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    expect(formatted.text).toBe(
      `  <entry> (current scope)
    --> vibe: "Try the failing tool"
    [tool] riskyOperation({})
    [error] Operation failed: insufficient permissions
    <-- result (text): The operation failed due to permissions`
    );
  });
});

describe('AI Tool Calling - Context Modes (forget/verbose)', () => {
  test('tool calls inside loop with forget mode are removed from context', async () => {
    // Tool calls inside a loop with 'forget' should not appear in context after loop exits
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let sum = 0
      for i in [1, 2] {
        let partial: number = vibe "Add {i} to running total" m default
        sum = sum + partial
      } forget
      let final: text = vibe "What is the final sum?" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const testTools = createTestTools();

    // Mock responses for: loop iter 1 (with tool), loop iter 2 (with tool), final do
    const mockResponses: AIResponse[] = [
      // First iteration - AI calls add tool
      {
        content: '',
        parsedValue: '',
        toolCalls: [{ id: 'call_1', toolName: 'add', args: { a: 0, b: 1 } }],
        stopReason: 'tool_use',
      },
      { content: '1', parsedValue: 1, stopReason: 'end' },
      // Second iteration - AI calls add tool
      {
        content: '',
        parsedValue: '',
        toolCalls: [{ id: 'call_2', toolName: 'add', args: { a: 1, b: 2 } }],
        stopReason: 'tool_use',
      },
      { content: '3', parsedValue: 3, stopReason: 'end' },
      // Final do call - no tools
      { content: 'The final sum is 3', parsedValue: 'The final sum is 3', stopReason: 'end' },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    // Verify tools were executed during the loop
    expect(toolExecutions).toHaveLength(2);

    // Get context after loop with forget - tool calls should NOT appear
    const state = runtime.getState();
    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    // With 'forget', the loop's tool calls, iterations, and scope markers are removed
    // Only variables declared outside the loop and what happens after remain
    expect(formatted.text).toBe(
      `  <entry> (current scope)
    - sum (number): 0
    --> vibe: "What is the final sum?"
    <-- final (text): The final sum is 3`
    );
  });

  test('tool calls inside loop with verbose mode are preserved in context', async () => {
    // Tool calls inside a loop with 'verbose' should appear in context
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let sum = 0
      for i in [1, 2] {
        let partial: number = vibe "Add {i}" m default
        sum = sum + partial
      } verbose
      let final: text = vibe "What is sum?" m default
    `);

    const toolExecutions: ToolExecution[] = [];
    const testTools = createTestTools();

    const mockResponses: AIResponse[] = [
      // First iteration with tool
      {
        content: '',
        parsedValue: '',
        toolCalls: [{ id: 'call_1', toolName: 'add', args: { a: 0, b: 1 } }],
        stopReason: 'tool_use',
      },
      { content: '1', parsedValue: 1, stopReason: 'end' },
      // Second iteration with tool
      {
        content: '',
        parsedValue: '',
        toolCalls: [{ id: 'call_2', toolName: 'add', args: { a: 1, b: 2 } }],
        stopReason: 'tool_use',
      },
      { content: '3', parsedValue: 3, stopReason: 'end' },
      // Final do
      { content: 'Sum is 3', parsedValue: 'Sum is 3', stopReason: 'end' },
    ];

    const aiProvider = createToolCallingAIProvider(mockResponses, toolExecutions, testTools);
    const runtime = new Runtime(ast, aiProvider);
    await runtime.run();

    // Verify tools were executed
    expect(toolExecutions).toHaveLength(2);

    // Get context - with verbose, tool calls should be preserved
    const state = runtime.getState();
    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    // With 'verbose', the loop preserves all history including tool calls and scope markers
    // Note: sum = 0 + 1 = 1, then sum = 1 + 3 = 4
    // Order: AI call → tool calls → response (via variable assignment)
    expect(formatted.text).toBe(
      `  <entry> (current scope)
    - sum (number): 0
    ==> for i
    - i (number): 1
    --> vibe: "Add 1"
    [tool] add({"a":0,"b":1})
    [result] 1
    <-- partial (number): 1
    - sum (number): 1
    - i (number): 2
    --> vibe: "Add 2"
    [tool] add({"a":1,"b":2})
    [result] 3
    <-- partial (number): 3
    - sum (number): 4
    <== for i
    --> vibe: "What is sum?"
    <-- final (text): Sum is 3`
    );
  });
});

// Note: Function context modes (verbose/forget) were removed.
// Functions always forget their internal context on exit, like traditional callstacks.
// If you need data visible outside a function, return it and assign to a variable.
