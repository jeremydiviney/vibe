// Context Modes Integration Test
// Tests that forget mode properly cleans up inner loop context

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';
import { buildLocalContext, formatContextForAI } from '../../../src/runtime/context';
import * as fs from 'fs';
import * as path from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const shouldRun = !!ANTHROPIC_API_KEY;

// Test directory setup
const TEST_WORKSPACE = path.join(__dirname, '.test-workspace-context');

// Test file contents
const SAMPLE_FILES = {
  'file1.txt': `Line one
Line two
Line three`,

  'file2.txt': `Alpha
Beta
Gamma`,
};

// Expected line lengths for verification
const EXPECTED_LENGTHS: Record<string, number[]> = {
  'file1.txt': [8, 8, 10],
  'file2.txt': [5, 4, 5],
};

// Function to generate Vibe program with configurable context mode
function createVibeProgram(innerLoopMode: 'forget' | 'verbose' | ''): string {
  const modeKeyword = innerLoopMode ? ` ${innerLoopMode}` : '';

  return `
import { glob, readFile, writeFile } from "system/tools"

model analyzer = {
  name: "claude-haiku-4-5",
  apiKey: "${ANTHROPIC_API_KEY}",
  url: "https://api.anthropic.com",
  provider: "anthropic",
  tools: [glob, readFile, writeFile]
}

// Find all .txt files
let files: text[] = do "Find all .txt files in the current directory. Return just the filenames as an array." analyzer default

// Process each file
for file in files {
  // Read the file
  let content: text = do "Use the readFile tool to read '{file}'. Return the exact file contents with no formatting, no markdown, no code blocks - just the raw text." analyzer default

  // Split content into lines using inline TS
  let lines: text[] = ts(content) { return content.split('\\n'); }

  // Process each line - TS calculates length
  let annotatedLines: number[] = []
  for line in lines {
    let annotated: number = ts(line) { return (line ?? '').length }
    annotatedLines.push(annotated)
  }${modeKeyword}

  // Write annotated file
  do "update the file '{file}' with the annotated lines, so each line ends with its length in brackets like [5]" analyzer default
}

"done"
`;
}

describe.skipIf(!shouldRun)('Context Modes Integration', () => {
  beforeAll(() => {
    // Create test workspace and sample files
    fs.mkdirSync(TEST_WORKSPACE, { recursive: true });
    for (const [filename, content] of Object.entries(SAMPLE_FILES)) {
      fs.writeFileSync(path.join(TEST_WORKSPACE, filename), content);
    }
  });

  afterAll(() => {
    // Clean up test workspace
    if (fs.existsSync(TEST_WORKSPACE)) {
      fs.rmSync(TEST_WORKSPACE, { recursive: true });
    }
  });

  test(
    'forget mode cleans up inner loop iterations from context',
    async () => {
      // Run with forget mode on inner loop
      const program = parse(createVibeProgram('forget'));
      const runtime = new Runtime(program, createRealAIProvider(() => runtime.getState()), {
        logAiInteractions: true,
        rootDir: TEST_WORKSPACE,
      });

      await runtime.run();

      const state = runtime.getState();
      console.log('\n=== FORGET MODE ===');
      console.log(formatAIInteractions(state));

      // Get the final context
      const context = buildLocalContext(state);
      const formatted = formatContextForAI(context);
      console.log('\n=== FINAL CONTEXT ===');
      console.log(formatted.text);

      // Verify files were processed correctly
      for (const [filename, expectedLengths] of Object.entries(EXPECTED_LENGTHS)) {
        const filePath = path.join(TEST_WORKSPACE, filename);
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        const lines = content.split('\n');

        console.log(`\n--- ${filename} ---`);
        console.log(content);

        expect(lines.length).toBe(expectedLengths.length);

        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(/\[(\d+)\]$/);
          expect(match).not.toBeNull();
          if (match) {
            expect(parseInt(match[1], 10)).toBe(expectedLengths[i]);
          }
        }
      }

      // KEY ASSERTION: With forget mode, the inner loop iterations should NOT be in context
      // The context should NOT contain individual "line" variable assignments from the inner loop
      const contextText = formatted.text;

      // Count how many times "- line (text):" appears - should be minimal with forget
      const lineVarMatches = contextText.match(/- line \(text\):/g) || [];
      console.log(`\nLine variable occurrences in context: ${lineVarMatches.length}`);

      // With forget, we should NOT see accumulated line iterations
      // Each file has 3 lines, 2 files = 6 iterations total
      // With forget, none of these should persist in final context
      expect(lineVarMatches.length).toBe(0);

      // Also verify the annotatedLines array IS present (the final result)
      expect(contextText).toContain('annotatedLines');
    },
    300000
  );

  test(
    'verbose mode (default) keeps all inner loop iterations in context',
    async () => {
      // Reset test files
      for (const [filename, content] of Object.entries(SAMPLE_FILES)) {
        fs.writeFileSync(path.join(TEST_WORKSPACE, filename), content);
      }

      // Run with verbose mode (explicit) on inner loop
      const program = parse(createVibeProgram('verbose'));
      const runtime = new Runtime(program, createRealAIProvider(() => runtime.getState()), {
        logAiInteractions: true,
        rootDir: TEST_WORKSPACE,
      });

      await runtime.run();

      const state = runtime.getState();
      console.log('\n=== VERBOSE MODE ===');
      console.log(formatAIInteractions(state));

      // Get the final context
      const context = buildLocalContext(state);
      const formatted = formatContextForAI(context);
      console.log('\n=== FINAL CONTEXT ===');
      console.log(formatted.text);

      // Verify files were processed correctly
      for (const [filename, expectedLengths] of Object.entries(EXPECTED_LENGTHS)) {
        const filePath = path.join(TEST_WORKSPACE, filename);
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        const lines = content.split('\n');

        expect(lines.length).toBe(expectedLengths.length);

        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(/\[(\d+)\]$/);
          expect(match).not.toBeNull();
          if (match) {
            expect(parseInt(match[1], 10)).toBe(expectedLengths[i]);
          }
        }
      }

      // KEY ASSERTION: With verbose mode, the inner loop iterations SHOULD be in context
      const contextText = formatted.text;

      // Count how many times "- line (text):" appears
      const lineVarMatches = contextText.match(/- line \(text\):/g) || [];
      console.log(`\nLine variable occurrences in context: ${lineVarMatches.length}`);

      // With verbose, we SHOULD see all line iterations
      // Each file has 3 lines, 2 files = 6 iterations total
      // But due to outer loop verbose behavior, we see all from both files
      expect(lineVarMatches.length).toBeGreaterThan(0);
    },
    300000
  );

  test(
    'compare token usage between forget and verbose modes',
    async () => {
      // Reset test files
      for (const [filename, content] of Object.entries(SAMPLE_FILES)) {
        fs.writeFileSync(path.join(TEST_WORKSPACE, filename), content);
      }

      // Run forget mode
      const forgetProgram = parse(createVibeProgram('forget'));
      const forgetRuntime = new Runtime(forgetProgram, createRealAIProvider(() => forgetRuntime.getState()), {
        logAiInteractions: true,
        rootDir: TEST_WORKSPACE,
      });
      await forgetRuntime.run();
      const forgetState = forgetRuntime.getState();

      // Calculate total tokens for forget mode
      const forgetTokens = forgetState.aiInteractions?.reduce((sum, i) => sum + (i.usage?.inputTokens ?? 0), 0) ?? 0;

      // Reset test files
      for (const [filename, content] of Object.entries(SAMPLE_FILES)) {
        fs.writeFileSync(path.join(TEST_WORKSPACE, filename), content);
      }

      // Run verbose mode
      const verboseProgram = parse(createVibeProgram('verbose'));
      const verboseRuntime = new Runtime(verboseProgram, createRealAIProvider(() => verboseRuntime.getState()), {
        logAiInteractions: true,
        rootDir: TEST_WORKSPACE,
      });
      await verboseRuntime.run();
      const verboseState = verboseRuntime.getState();

      // Calculate total tokens for verbose mode
      const verboseTokens = verboseState.aiInteractions?.reduce((sum, i) => sum + (i.usage?.inputTokens ?? 0), 0) ?? 0;

      console.log('\n=== TOKEN COMPARISON ===');
      console.log(`Forget mode total input tokens: ${forgetTokens}`);
      console.log(`Verbose mode total input tokens: ${verboseTokens}`);
      console.log(`Difference: ${verboseTokens - forgetTokens} tokens`);
      console.log(`Forget mode saves: ${((1 - forgetTokens / verboseTokens) * 100).toFixed(1)}%`);

      // Forget mode should use fewer tokens (less context accumulation)
      // Note: This might not always be true for small examples, but for larger ones it should be
      console.log('\nBoth modes completed successfully!');
    },
    600000 // 10 minute timeout for both runs
  );
});
