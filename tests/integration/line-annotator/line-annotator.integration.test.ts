// Line Annotator Integration Test
// Tests tool calling, Vibe loops, and TS functions working together

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';
import * as fs from 'fs';
import * as path from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const shouldRun = !!ANTHROPIC_API_KEY;

// Test directory setup
const TEST_WORKSPACE = path.join(__dirname, '.test-workspace');

// Test file contents (simplified for initial testing)
const SAMPLE_FILES = {
  'sample1.txt': `Hello world
Short
End`,

  'sample2.txt': `Apple
Banana
Cherry`,
};

// Expected line lengths for verification
const EXPECTED_LENGTHS: Record<string, number[]> = {
  'sample1.txt': [11, 5, 3],
  'sample2.txt': [5, 6, 6],
};

// Vibe program that processes files
const VIBE_PROGRAM = `
import { glob, readFile, writeFile } from "system/tools"

model analyzer = {
  name: "claude-haiku-4-5",
  apiKey: "${ANTHROPIC_API_KEY}",
  url: "https://api.anthropic.com",
  provider: "anthropic",
  tools: [glob, readFile, writeFile]
}

// Find all .txt files
let files: text[] = vibe "Find all .txt files in the current directory. Return just the filenames as an array." analyzer default

// Process each file
for file in files {
  // Read the file
  let content: text = vibe "Use the readFile tool to read '{file}'. Return the exact file contents with no formatting, no markdown, no code blocks - just the raw text." analyzer default

  // Split content into lines using inline TS
  let lines: text[] = ts(content) { return content.split('\\n'); }

  // Process each line - TS calculates length and annotates
  let annotatedLines: number[] = []
  for line in lines {
    let annotated: number = ts(line) {return (line ?? '').length }
    annotatedLines.push(annotated)
  }
  vibe "update the file '{file}' with the annotated lines, so each line ends with its length in brackets like [5]" analyzer default
}

"done"
`;

describe.skipIf(!shouldRun)('Line Annotator Integration', () => {
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
    'AI annotates each line with its length using nested loops',
    async () => {
      // Verify initial files exist
      for (const filename of Object.keys(SAMPLE_FILES)) {
        expect(fs.existsSync(path.join(TEST_WORKSPACE, filename))).toBe(true);
      }

      // Run the Vibe program
      const program = parse(VIBE_PROGRAM);
      const runtime = new Runtime(program, createRealAIProvider(() => runtime.getState()), {
        logAiInteractions: true,
        rootDir: TEST_WORKSPACE,
      });

      await runtime.run();

      // Log AI interactions
      const state = runtime.getState();
      console.log('\n' + formatAIInteractions(state.aiInteractions));

      // Verify tool calls were made
      const hasToolCalls = state.callStack.some((frame) =>
        frame.orderedEntries.some(
          (entry) => entry.kind === 'prompt' && entry.toolCalls && entry.toolCalls.length > 0
        )
      );
      console.log(`\nTool calls made: ${hasToolCalls}`);
      expect(hasToolCalls).toBe(true);

      // Verify each file was annotated correctly
      for (const [filename, expectedLengths] of Object.entries(EXPECTED_LENGTHS)) {
        const filePath = path.join(TEST_WORKSPACE, filename);
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        const lines = content.split('\n');

        console.log(`\n--- ${filename} ---`);
        console.log(content);

        // Check line count matches
        expect(lines.length).toBe(expectedLengths.length);

        // Check each line ends with correct length annotation
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const expectedLength = expectedLengths[i];

          // Line should end with [N] where N is the expected length
          const match = line.match(/\[(\d+)\]$/);
          expect(match).not.toBeNull();

          if (match) {
            const actualLength = parseInt(match[1], 10);
            expect(actualLength).toBe(expectedLength);
          }
        }
      }

      // Program completed successfully
      console.log('\nAll files annotated successfully!');
    },
    300000
  ); // 5 minute timeout for many AI calls
});
