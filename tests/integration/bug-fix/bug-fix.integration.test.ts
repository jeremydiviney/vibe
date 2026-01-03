// Bug Fix Integration Test
// Tests that AI can use tools to find and fix bugs in real code

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';
import * as fs from 'fs';
import * as path from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const shouldRun = !!ANTHROPIC_API_KEY;

// Test directory setup - each test folder gets its own .test-workspace
const TEST_WORKSPACE = path.join(__dirname, '.test-workspace');
const BUGGY_FILE = path.join(TEST_WORKSPACE, 'buggy-code.ts');

// The buggy code - sumArray has an off-by-one error
const BUGGY_CODE = `// Array utilities module

export function sumArray(numbers: number[]): number {
  let total = 0;
  for (let i = 1; i < numbers.length; i++) {
    total += numbers[i];
  }
  return total;
}

export function findMax(numbers: number[]): number {
  if (numbers.length === 0) {
    return 0;
  }
  let max = numbers[0];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] > max) {
      max = numbers[i];
    }
  }
  return max;
}
`;

// Vibe program - AI uses tools to read file, diagnose, and fix
const VIBE_PROGRAM = `
model fixer = {
  name: "claude-haiku-4-5",
  apiKey: "${ANTHROPIC_API_KEY}",
  url: "https://api.anthropic.com",
  provider: "anthropic"
}

let result: text = do "There's a file 'buggy-code.ts' with array utility functions.

A test is failing: sumArray([1, 2, 3, 4, 5]) returns 14 but should return 15.

Read the file, find the bug, and fix it. After fixing, respond with 'FIXED'." fixer default

result
`;

describe.skipIf(!shouldRun)('Bug Fix Integration', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_WORKSPACE, { recursive: true });
    fs.writeFileSync(BUGGY_FILE, BUGGY_CODE);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_WORKSPACE)) {
      fs.rmSync(TEST_WORKSPACE, { recursive: true });
    }
  });

  test('AI diagnoses and fixes bug using tools', async () => {
    // Verify the code is buggy
    const buggyModule = await import(BUGGY_FILE);
    const buggyResult = buggyModule.sumArray([1, 2, 3, 4, 5]);
    console.log(`\nBuggy sumArray([1,2,3,4,5]) = ${buggyResult} (expected 15)`);
    expect(buggyResult).toBe(14);

    // Run the Vibe program
    const program = parse(VIBE_PROGRAM);
    const runtime = new Runtime(
      program,
      createRealAIProvider(() => runtime.getState()),
      { logAiInteractions: true, rootDir: TEST_WORKSPACE }
    );

    await runtime.run();

    // Log AI interactions
    console.log('\n' + formatAIInteractions(runtime.getAIInteractions()));

    // Verify tool calls were made
    const interactions = runtime.getAIInteractions();
    const hasToolCalls = interactions.some(
      (i) => i.toolRounds && i.toolRounds.length > 0
    );
    console.log(`\nTool calls made: ${hasToolCalls}`);
    expect(hasToolCalls).toBe(true);

    // Verify the fix
    const fixedCode = fs.readFileSync(BUGGY_FILE, 'utf-8');
    console.log('\nFixed code:\n', fixedCode);
    expect(fixedCode).toContain('i = 0');

    // Test the fixed code
    const fixedModule = await import(`${BUGGY_FILE}?t=${Date.now()}`);
    const fixedResult = fixedModule.sumArray([1, 2, 3, 4, 5]);
    console.log(`Fixed sumArray([1,2,3,4,5]) = ${fixedResult}`);
    expect(fixedResult).toBe(15);
  }, 120000);

  test('findMax function still works after fix', async () => {
    const fixedModule = await import(`${BUGGY_FILE}?t=${Date.now()}`);
    expect(fixedModule.findMax([3, 1, 4, 1, 5, 9, 2, 6])).toBe(9);
    expect(fixedModule.findMax([1])).toBe(1);
    expect(fixedModule.findMax([])).toBe(0);
  }, 10000);
});
