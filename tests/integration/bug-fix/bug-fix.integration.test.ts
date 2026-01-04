// Bug Fix Integration Test
// Tests that AI can use tools to find and fix bugs in real code

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';
import * as fs from 'fs';
import * as path from 'path';

// API Keys from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Test directory setup
const BASE_WORKSPACE = path.join(__dirname, '.test-workspace');

// The buggy code - sumArray has an off-by-one error (starts at index 1 instead of 0)
const BUGGY_CODE = `// Array utilities module

export function sumArray(numbers: number[]): number {
  // Bug: loop starts at index 1, skipping the first element
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
  // This function is correct - starts at 1 because max is initialized with numbers[0]
  let max = numbers[0];
  for (let j = 1; j < numbers.length; j++) {
    if (numbers[j] > max) {
      max = numbers[j];
    }
  }
  return max;
}
`;

// Generate Vibe program with provider-specific model config
function createVibeProgram(modelConfig: string): string {
  return `
import { readFile, edit } from "system/tools"

${modelConfig}

let result: text = vibe "There's a file 'buggy-code.ts' with array utility functions.

A test is failing: sumArray([1, 2, 3, 4, 5]) returns 14 but should return 15.

Read the file, find the bug, and fix it. After fixing, respond with 'FIXED'." fixer default

result
`;
}

// Core test function that runs the bug fix test for a given provider
async function runBugFixTest(
  providerName: string,
  modelConfig: string,
  workspace: string
): Promise<void> {
  const buggyFile = path.join(workspace, 'buggy-code.ts');

  // Ensure workspace exists and reset the buggy file
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(buggyFile, BUGGY_CODE);

  // Verify the code is buggy
  const buggyModule = await import(`${buggyFile}?t=${Date.now()}`);
  const buggyResult = buggyModule.sumArray([1, 2, 3, 4, 5]);
  console.log(`\n[${providerName}] Buggy sumArray([1,2,3,4,5]) = ${buggyResult} (expected 15)`);
  expect(buggyResult).toBe(14);

  // Run the Vibe program
  const program = parse(createVibeProgram(modelConfig));
  const runtime = new Runtime(
    program,
    createRealAIProvider(() => runtime.getState()),
    { logAiInteractions: true, rootDir: workspace }
  );

  await runtime.run();

  // Log AI interactions
  const state = runtime.getState();
  console.log('\n' + formatAIInteractions(state.aiInteractions));

  // Verify tool calls were made
  const hasToolCalls = state.callStack.some(frame =>
    frame.orderedEntries.some(entry =>
      entry.kind === 'prompt' && entry.toolCalls && entry.toolCalls.length > 0
    )
  );
  console.log(`\n[${providerName}] Tool calls made: ${hasToolCalls}`);
  expect(hasToolCalls).toBe(true);

  // Verify the fix
  const fixedCode = fs.readFileSync(buggyFile, 'utf-8');
  console.log(`\n[${providerName}] Fixed code:\n`, fixedCode);
  expect(fixedCode).toContain('i = 0');

  // Test the fixed code
  const fixedModule = await import(`${buggyFile}?t=${Date.now()}`);
  const fixedResult = fixedModule.sumArray([1, 2, 3, 4, 5]);
  console.log(`[${providerName}] Fixed sumArray([1,2,3,4,5]) = ${fixedResult}`);
  expect(fixedResult).toBe(15);
}

// Test findMax still works after fix
async function testFindMaxAfterFix(workspace: string): Promise<void> {
  const buggyFile = path.join(workspace, 'buggy-code.ts');
  const fixedModule = await import(`${buggyFile}?t=${Date.now()}`);
  expect(fixedModule.findMax([3, 1, 4, 1, 5, 9, 2, 6])).toBe(9);
  expect(fixedModule.findMax([1])).toBe(1);
  expect(fixedModule.findMax([])).toBe(0);
}

// Cleanup workspace
function cleanupWorkspace(workspace: string): void {
  if (fs.existsSync(workspace)) {
    fs.rmSync(workspace, { recursive: true });
  }
}

// OpenAI Tests
describe.skipIf(!OPENAI_API_KEY)('Bug Fix Integration - OpenAI', () => {
  const workspace = path.join(BASE_WORKSPACE, 'openai');
  const modelConfig = `
model fixer = {
  name: "gpt-5-mini",
  apiKey: "${OPENAI_API_KEY}",
  url: "https://api.openai.com/v1",
  provider: "openai",
  tools: [readFile, edit]
}
`;

  afterAll(() => cleanupWorkspace(workspace));

  test('AI diagnoses and fixes bug using tools', async () => {
    await runBugFixTest('OpenAI', modelConfig, workspace);
  }, 120000);

  test('findMax function still works after fix', async () => {
    await testFindMaxAfterFix(workspace);
  }, 10000);
});

// Anthropic Tests
describe.skipIf(!ANTHROPIC_API_KEY)('Bug Fix Integration - Anthropic', () => {
  const workspace = path.join(BASE_WORKSPACE, 'anthropic');
  const modelConfig = `
model fixer = {
  name: "claude-haiku-4-5",
  apiKey: "${ANTHROPIC_API_KEY}",
  url: "https://api.anthropic.com",
  provider: "anthropic",
  tools: [readFile, edit]
}
`;

  afterAll(() => cleanupWorkspace(workspace));

  test('AI diagnoses and fixes bug using tools', async () => {
    await runBugFixTest('Anthropic', modelConfig, workspace);
  }, 120000);

  test('findMax function still works after fix', async () => {
    await testFindMaxAfterFix(workspace);
  }, 10000);
});

// Google Tests
describe.skipIf(!GOOGLE_API_KEY)('Bug Fix Integration - Google', () => {
  const workspace = path.join(BASE_WORKSPACE, 'google');
  const modelConfig = `
model fixer = {
  name: "gemini-3-flash-preview",
  apiKey: "${GOOGLE_API_KEY}",
  provider: "google",
  tools: [readFile, edit]
}
`;

  afterAll(() => cleanupWorkspace(workspace));

  test('AI diagnoses and fixes bug using tools', async () => {
    await runBugFixTest('Google', modelConfig, workspace);
  }, 120000);

  test('findMax function still works after fix', async () => {
    await testFindMaxAfterFix(workspace);
  }, 10000);
});
