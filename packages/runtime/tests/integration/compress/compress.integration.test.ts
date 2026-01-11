// Compress Context Mode Integration Test
// Tests that compress mode calls AI to summarize loop context

import { describe, test, expect } from 'bun:test';
import { Runtime } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';
import { buildLocalContext, formatContextForAI } from '../../../src/runtime/context';

// Use Google's Gemini Flash for cheap/fast summarization
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const shouldRun = !!GOOGLE_API_KEY;

describe.skipIf(!shouldRun)('Compress Integration', () => {
  test(
    'compress summarizes loop iterations',
    async () => {
      const program = parse(`
        model m = {
          name: "gemini-3-flash-preview",
          apiKey: "${GOOGLE_API_KEY}",
          provider: "google"
        }

        // Simple loop that compress will summarize
        let results: number[] = []
        for i in [1, 2, 3, 4, 5] {
          let squared = ts(i) { return i * i }
          results.push(squared)
        } compress

        results
      `);

      const runtime = new Runtime(
        program,
        createRealAIProvider(() => runtime.getState()),
        { logAiInteractions: true }
      );

      const result = await runtime.run();

      // Verify the loop executed correctly
      expect(result).toEqual([1, 4, 9, 16, 25]);

      // Get final context
      const state = runtime.getState();
      const context = buildLocalContext(state);
      const formatted = formatContextForAI(context);

      console.log('\n=== FINAL CONTEXT ===');
      console.log(formatted.text);

      // Verify there's a summary in the context
      const summaryEntry = context.find(e => e.kind === 'summary');
      expect(summaryEntry).toBeDefined();
      console.log('\n=== SUMMARY ===');
      console.log((summaryEntry as { text: string }).text);

      // The summary should exist and be non-empty
      expect((summaryEntry as { text: string }).text.length).toBeGreaterThan(0);
    },
    60000
  );

  test(
    'compress with custom prompt',
    async () => {
      const program = parse(`
        model m = {
          name: "gemini-3-flash-preview",
          apiKey: "${GOOGLE_API_KEY}",
          provider: "google"
        }

        let items: text[] = []
        for word in ["apple", "banana", "cherry"] {
          let upper: text = ts(word) { return word.toUpperCase() }
          items.push(upper)
        } compress("List the fruits that were processed")

        items
      `);

      const runtime = new Runtime(
        program,
        createRealAIProvider(() => runtime.getState()),
        { logAiInteractions: true }
      );

      const result = await runtime.run();

      // Verify the loop executed correctly
      expect(result).toEqual(['APPLE', 'BANANA', 'CHERRY']);

      // Get final context and verify summary
      const state = runtime.getState();
      const context = buildLocalContext(state);
      const summaryEntry = context.find(e => e.kind === 'summary');

      expect(summaryEntry).toBeDefined();
      const summaryText = (summaryEntry as { text: string }).text.toLowerCase();
      console.log('\n=== SUMMARY ===');
      console.log((summaryEntry as { text: string }).text);

      // Summary should mention the fruits
      expect(
        summaryText.includes('apple') ||
        summaryText.includes('banana') ||
        summaryText.includes('cherry') ||
        summaryText.includes('fruit')
      ).toBe(true);
    },
    60000
  );

  test(
    'compress with explicit model',
    async () => {
      const program = parse(`
        model main = {
          name: "gemini-3-flash-preview",
          apiKey: "${GOOGLE_API_KEY}",
          provider: "google"
        }

        model summarizer = {
          name: "gemini-3-flash-preview",
          apiKey: "${GOOGLE_API_KEY}",
          provider: "google"
        }

        let total = 0
        for n in [10, 20, 30] {
          total = total + n
        } compress(summarizer)

        total
      `);

      const runtime = new Runtime(
        program,
        createRealAIProvider(() => runtime.getState()),
        { logAiInteractions: true }
      );

      const result = await runtime.run();

      // Verify the loop executed correctly
      expect(result).toBe(60);

      // Verify summary exists
      const state = runtime.getState();
      const context = buildLocalContext(state);
      const summaryEntry = context.find(e => e.kind === 'summary');

      expect(summaryEntry).toBeDefined();
      console.log('\n=== SUMMARY ===');
      console.log((summaryEntry as { text: string }).text);
    },
    60000
  );

  test(
    'while loop with compress',
    async () => {
      const program = parse(`
        model m = {
          name: "gemini-3-flash-preview",
          apiKey: "${GOOGLE_API_KEY}",
          provider: "google"
        }

        let count = 0
        let sum = 0
        while (count < 4) {
          count = count + 1
          sum = sum + count
        } compress

        sum
      `);

      const runtime = new Runtime(
        program,
        createRealAIProvider(() => runtime.getState()),
        { logAiInteractions: true }
      );

      const result = await runtime.run();

      // sum = 1 + 2 + 3 + 4 = 10
      expect(result).toBe(10);

      // Verify summary exists
      const state = runtime.getState();
      const context = buildLocalContext(state);
      const summaryEntry = context.find(e => e.kind === 'summary');

      expect(summaryEntry).toBeDefined();
      console.log('\n=== SUMMARY ===');
      console.log((summaryEntry as { text: string }).text);
    },
    60000
  );
});
