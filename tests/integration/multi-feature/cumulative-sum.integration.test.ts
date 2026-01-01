// Cumulative Sum Integration Test
// Simple test: AI adds numbers one at a time in a loop

import { describe, test, expect } from 'vitest';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const shouldRun = !!ANTHROPIC_API_KEY;

// Generate random integers for the test
const numbers = Array.from({ length: 5 }, () => Math.floor(Math.random() * 20) - 5);
const expectedSum = numbers.reduce((a, b) => a + b, 0);

const VIBE_PROGRAM = `
model calc = {
  name: "claude-haiku-4-5",
  apiKey: "${ANTHROPIC_API_KEY}",
  url: "https://api.anthropic.com",
  provider: "anthropic"
}

let numbers: number[] = [${numbers.join(', ')}]
let sum: number = 0

for n in numbers {
  let result: number = do "Add n to sum. Return only the number." calc default
  sum = result
}
`;

async function runTest(logAi = true): Promise<Runtime> {
  const program = parse(VIBE_PROGRAM);
  const runtime = new Runtime(
    program,
    createRealAIProvider(() => runtime.getState()),
    { logAiInteractions: logAi }
  );
  await runtime.run();

  if (logAi) {
    console.log('\n' + formatAIInteractions(runtime.getAIInteractions()));
  }

  return runtime;
}

describe.skipIf(!shouldRun)('Cumulative Sum Integration', () => {
  test('AI adds numbers correctly in a loop', async () => {
    console.log(`\nTest numbers: [${numbers.join(', ')}]`);
    console.log(`Expected sum: ${expectedSum}`);

    const runtime = await runTest();

    const finalSum = runtime.getValue('sum') as number;
    console.log(`AI computed sum: ${finalSum}`);

    // AI should compute the correct sum
    expect(finalSum).toBe(expectedSum);

    // Verify we made the right number of AI calls
    const interactions = runtime.getAIInteractions();
    expect(interactions.length).toBe(numbers.length);

    // Each interaction should be a number response
    for (const interaction of interactions) {
      expect(interaction.targetType).toBe('number');
    }
  }, 120000);
});
