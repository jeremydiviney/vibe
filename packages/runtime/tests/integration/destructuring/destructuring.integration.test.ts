// Destructuring Integration Tests
// Tests destructuring declarations with const and let using Google Gemini 3

import { describe, test, expect } from 'bun:test';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const modelConfig = `
model testModel = {
  name: "gemini-3-flash-preview",
  apiKey: "${GOOGLE_API_KEY}",
  provider: "google"
}
`;

async function runVibe(vibeCode: string, logAi = true): Promise<Runtime> {
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

describe.skipIf(!GOOGLE_API_KEY)('Google Gemini 3 - Destructuring Declarations', () => {
  test('const destructuring with multiple fields', async () => {
    const runtime = await runVibe(`
const {name: text, age: number} = do "Return a person named Alice who is 25 years old" testModel default
`);
    expect(runtime.getValue('name')).toBe('Alice');
    expect(runtime.getValue('age')).toBe(25);
  }, 30000);

  test('let destructuring with multiple fields', async () => {
    const runtime = await runVibe(`
let {city: text, population: number} = do "Return a city named Tokyo with population 14000000" testModel default
`);
    expect(runtime.getValue('city')).toBe('Tokyo');
    expect(runtime.getValue('population')).toBe(14000000);
  }, 30000);

  test('const destructuring with boolean field', async () => {
    const runtime = await runVibe(`
const {valid: boolean, message: text} = do "Return valid as true and message as OK" testModel default
`);
    expect(runtime.getValue('valid')).toBe(true);
    expect(runtime.getValue('message')).toBe('OK');
  }, 30000);

  test('let destructuring with array fields', async () => {
    const runtime = await runVibe(`
let {colors: text[], counts: number[]} = do "Return colors as [red, green, blue] and counts as [1, 2, 3]" testModel default
`);
    const colors = runtime.getValue('colors') as string[];
    const counts = runtime.getValue('counts') as number[];
    expect(Array.isArray(colors)).toBe(true);
    expect(colors).toEqual(['red', 'green', 'blue']);
    expect(Array.isArray(counts)).toBe(true);
    expect(counts).toEqual([1, 2, 3]);
  }, 30000);

  test('const destructuring with json field', async () => {
    const runtime = await runVibe(`
const {user: json, active: boolean} = do "Return user as an object with name Alice and role admin, and active as true" testModel default
`);
    const user = runtime.getValue('user') as Record<string, unknown>;
    expect(typeof user).toBe('object');
    expect(user.name).toBe('Alice');
    expect(user.role).toBe('admin');
    expect(runtime.getValue('active')).toBe(true);
  }, 30000);

  test('destructuring with three fields', async () => {
    const runtime = await runVibe(`
const {x: number, y: number, z: number} = do "Return x as 10, y as 20, z as 30" testModel default
`);
    expect(runtime.getValue('x')).toBe(10);
    expect(runtime.getValue('y')).toBe(20);
    expect(runtime.getValue('z')).toBe(30);
  }, 30000);
});
