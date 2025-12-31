// Basic AI Integration Tests
// Tests real API calls with OpenAI, Anthropic, and Google for all return types

import { describe, test, expect } from 'vitest';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';

// API Keys from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Provider configurations
const providers = [
  {
    name: 'OpenAI',
    hasKey: !!OPENAI_API_KEY,
    modelConfig: `
model testModel = {
  name: "gpt-5-mini",
  apiKey: "${OPENAI_API_KEY}",
  url: "https://api.openai.com/v1",
  provider: "openai"
}
`,
  },
  {
    name: 'Anthropic',
    hasKey: !!ANTHROPIC_API_KEY,
    modelConfig: `
model testModel = {
  name: "claude-haiku-4-5",
  apiKey: "${ANTHROPIC_API_KEY}",
  url: "https://api.anthropic.com",
  provider: "anthropic"
}
`,
  },
  {
    name: 'Google',
    hasKey: !!GOOGLE_API_KEY,
    modelConfig: `
model testModel = {
  name: "gemini-3-flash-preview",
  apiKey: "${GOOGLE_API_KEY}",
  provider: "google"
}
`,
  },
];

// Shared Vibe code for each test case
const testCases = [
  {
    name: 'returns text response',
    vibeCode: `let result = do "Reply with exactly: PONG" testModel default`,
    assert: (runtime: Runtime) => {
      const result = runtime.getValue('result') as string;
      expect(typeof result).toBe('string');
      expect(result.toUpperCase()).toContain('PONG');
    },
  },
  {
    name: 'returns number response',
    vibeCode: `let result: number = do "What is 2 + 2? Reply with just the number." testModel default`,
    assert: (runtime: Runtime) => {
      const result = runtime.getValue('result');
      expect(typeof result).toBe('number');
      expect(result).toBe(4);
    },
  },
  {
    name: 'returns boolean response',
    vibeCode: `let result: boolean = do "Is 5 greater than 3? Reply with true or false only." testModel default`,
    assert: (runtime: Runtime) => {
      const result = runtime.getValue('result');
      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    },
  },
  {
    name: 'returns json response',
    vibeCode: `let result: json = do "Return a JSON object with name set to Alice and age set to 30" testModel default`,
    assert: (runtime: Runtime) => {
      const result = runtime.getValue('result') as Record<string, unknown>;
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
      expect(result.name).toBe('Alice');
      expect(result.age).toBe(30);
    },
  },
  {
    name: 'returns text[] response',
    vibeCode: `let result: text[] = do "Return a JSON array of 3 colors: red, green, blue" testModel default`,
    assert: (runtime: Runtime) => {
      const result = runtime.getValue('result') as string[];
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(result).toContain('red');
      expect(result).toContain('green');
      expect(result).toContain('blue');
    },
  },
  {
    name: 'returns number[] response',
    vibeCode: `let result: number[] = do "Return a JSON array of the first 5 prime numbers" testModel default`,
    assert: (runtime: Runtime) => {
      const result = runtime.getValue('result') as number[];
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(5);
      expect(result).toEqual([2, 3, 5, 7, 11]);
    },
  },
  {
    name: 'returns boolean[] response',
    vibeCode: `let result: boolean[] = do "Return a JSON array: [true, false, true]" testModel default`,
    assert: (runtime: Runtime) => {
      const result = runtime.getValue('result') as boolean[];
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([true, false, true]);
    },
  },
];

async function runVibe(modelConfig: string, vibeCode: string, logAi = true): Promise<Runtime> {
  const program = parse(modelConfig + vibeCode);
  const runtime = new Runtime(
    program,
    createRealAIProvider(() => runtime.getState()),
    { logAiInteractions: logAi }
  );
  await runtime.run();

  if (logAi) {
    const interactions = runtime.getAIInteractions();
    console.log('\n' + formatAIInteractions(interactions));
  }

  return runtime;
}

// Generate tests for each provider
for (const provider of providers) {
  describe.skipIf(!provider.hasKey)(`${provider.name} Integration - Return Types`, () => {
    for (const testCase of testCases) {
      test(testCase.name, async () => {
        const runtime = await runVibe(provider.modelConfig, testCase.vibeCode);
        testCase.assert(runtime);
      }, 30000);
    }
  });
}
