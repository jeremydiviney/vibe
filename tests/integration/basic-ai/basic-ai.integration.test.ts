// Basic AI Integration Tests
// Tests real API calls with OpenAI gpt-5-mini for all return types

import { describe, test, expect } from 'vitest';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const hasOpenAIKey = !!OPENAI_API_KEY;

const MODEL_CONFIG = `
model testModel = {
  name: "gpt-5-mini",
  apiKey: "${OPENAI_API_KEY}",
  url: "https://api.openai.com/v1",
  provider: "openai"
}
`;

interface RunVibeOptions {
  logAiInteractions?: boolean;
}

async function runVibe(source: string, options?: RunVibeOptions): Promise<Runtime> {
  const program = parse(MODEL_CONFIG + source);
  const runtime = new Runtime(
    program,
    createRealAIProvider(() => runtime.getState()),
    { logAiInteractions: options?.logAiInteractions }
  );
  await runtime.run();
  return runtime;
}

describe.skipIf(!hasOpenAIKey)('OpenAI Integration - Return Types', () => {
  // Text (default)
  test('returns text response', async () => {
    const runtime = await runVibe(`
      let result = do "Reply with exactly: PONG" testModel default
    `);
    const result = runtime.getValue('result') as string;
    expect(typeof result).toBe('string');
    expect(result.toUpperCase()).toContain('PONG');
  }, 30000);

  // Number
  test('returns number response', async () => {
    const runtime = await runVibe(`
      let result: number = do "What is 2 + 2? Reply with just the number." testModel default
    `);
    const result = runtime.getValue('result');
    expect(typeof result).toBe('number');
    expect(result).toBe(4);
  }, 30000);

  // Boolean
  test('returns boolean response', async () => {
    const runtime = await runVibe(`
      let result: boolean = do "Is 5 greater than 3? Reply with true or false only." testModel default
    `);
    const result = runtime.getValue('result');
    expect(typeof result).toBe('boolean');
    expect(result).toBe(true);
  }, 30000);

  // JSON
  test('returns json response', async () => {
    const runtime = await runVibe(`
      let result: json = do "Return a JSON object with name set to Alice and age set to 30" testModel default
    `);
    const result = runtime.getValue('result') as Record<string, unknown>;
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  }, 30000);

  // Text array
  test('returns text[] response', async () => {
    const runtime = await runVibe(`
      let result: text[] = do "Return a JSON array of 3 colors: red, green, blue" testModel default
    `);
    const result = runtime.getValue('result') as string[];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect(result).toContain('red');
    expect(result).toContain('green');
    expect(result).toContain('blue');
  }, 30000);

  // Number array
  test('returns number[] response', async () => {
    const runtime = await runVibe(`
      let result: number[] = do "Return a JSON array of the first 5 prime numbers" testModel default
    `);
    const result = runtime.getValue('result') as number[];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(5);
    expect(result).toEqual([2, 3, 5, 7, 11]);
  }, 30000);

  // Boolean array
  test('returns boolean[] response', async () => {
    const runtime = await runVibe(`
      let result: boolean[] = do "Return a JSON array: [true, false, true]" testModel default
    `);
    const result = runtime.getValue('result') as boolean[];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([true, false, true]);
  }, 30000);

  // JSON array
  test('returns json[] response', async () => {
    const runtime = await runVibe(`
      let result: json[] = do "Return a JSON array with 2 objects: {id: 1, name: 'A'} and {id: 2, name: 'B'}" testModel default
    `);
    const result = runtime.getValue('result') as Record<string, unknown>[];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 1, name: 'A' });
    expect(result[1]).toEqual({ id: 2, name: 'B' });
  }, 30000);
});
