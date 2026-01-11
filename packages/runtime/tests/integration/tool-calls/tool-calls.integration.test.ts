// Tool Calls Integration Test
// Tests that AIResultObject.toolCalls captures tool execution history

import { describe, test, expect } from 'bun:test';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const VIBE_PROGRAM = `
// Define tool first so it exists when referenced
tool randomNumber(min: number, max: number): number
  @description "Generate a random number between min and max (inclusive)"
{
  ts(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
}

model m = {
  name: "gemini-3-flash-preview",
  apiKey: "${GOOGLE_API_KEY}",
  provider: "google",
  tools: [randomNumber]
}

// Ask AI to use the tool twice and return the largest
let result = vibe "Use the randomNumber tool twice: once with min=1 max=100, and once with min=1 max=100. Then return ONLY the larger of the two numbers as a single integer." m default

// Access the tool calls and the result value
let toolCallCount = result.toolCalls.len()
let largestNumber = result
`;

async function runTest(): Promise<Runtime> {
  const program = parse(VIBE_PROGRAM);
  const runtime = new Runtime(
    program,
    createRealAIProvider(() => runtime.getState()),
    { logAiInteractions: true }
  );
  await runtime.run();
  console.log('\n' + formatAIInteractions(runtime.getState().aiInteractions));
  return runtime;
}

describe.skipIf(!GOOGLE_API_KEY)('Google - AIResultObject.toolCalls Integration', () => {
  test('toolCalls array captures tool execution history', async () => {
    const runtime = await runTest();

    // Verify tool call count from Vibe code
    const toolCallCount = runtime.getValue('toolCallCount') as number;
    expect(toolCallCount).toBe(2);

    // Access the raw result to check structure
    const state = runtime.getState();
    const resultVar = state.callStack[0].locals['result'];
    expect(resultVar.value).toHaveProperty('toolCalls');
    expect(Array.isArray(resultVar.value.toolCalls)).toBe(true);
    expect(resultVar.value.toolCalls).toHaveLength(2);

    // Get the two random numbers from tool calls
    const num1 = Number(resultVar.value.toolCalls[0].result);
    const num2 = Number(resultVar.value.toolCalls[1].result);
    const expectedLargest = Math.max(num1, num2);

    // Verify the AI returned the largest number
    const largestNumber = Number(runtime.getValue('largestNumber'));
    expect(largestNumber).toBe(expectedLargest);

    // Each tool call should have the expected structure
    for (const call of resultVar.value.toolCalls) {
      expect(call).toHaveProperty('toolName');
      expect(call).toHaveProperty('args');
      expect(call).toHaveProperty('result');
      expect(call).toHaveProperty('duration');
      expect(call.toolName).toBe('randomNumber');
      expect(typeof call.duration).toBe('number');
    }
  }, 60000);
});
