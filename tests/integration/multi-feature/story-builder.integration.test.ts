// Story Builder Integration Test
// Tests loops, conditionals, arrays, functions, and iterative AI context

import { describe, test, expect } from 'vitest';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Only run if API key is available
const shouldRun = !!ANTHROPIC_API_KEY;

const VIBE_PROGRAM = `
model writer = {
  name: "claude-haiku-4-5",
  apiKey: "${ANTHROPIC_API_KEY}",
  url: "https://api.anthropic.com",
  provider: "anthropic"
}

// Story configuration
let genre: text = "sci-fi"
let maxParagraphs: number = 3

// Get initial story elements from AI
let elements: json = do "Generate a JSON object with fields: protagonist (a character name), setting (a place), conflict (a problem to solve). Keep each field to 5-10 words. Be creative for a {genre} story." writer default

// Initialize story building
let paragraphs: text[] = []
let paragraphCount: number = 0
let storyComplete: boolean = false

// Build story iteratively with a while loop
while paragraphCount < maxParagraphs and not storyComplete {
  // Determine what part of story to write
  let storyPhase: text = "middle"
  if paragraphCount == 0 {
    storyPhase = "opening"
  }
  if paragraphCount == maxParagraphs - 1 {
    storyPhase = "conclusion"
  }

  // Generate next paragraph - AI can see previous paragraphs in context
  let paragraph: text = do "Write a single {storyPhase} paragraph (2-3 sentences) for a {genre} story. Use the elements from context. If there are previous paragraphs, continue the narrative coherently. Return ONLY the paragraph text, no JSON or formatting." writer default

  // Add to collection
  paragraphs.push(paragraph)
  paragraphCount = paragraphCount + 1

  // Check if story should end early (AI decides based on narrative)
  if paragraphCount >= 2 {
    let shouldEnd: boolean = do "Based on the story so far, is the narrative complete? Answer true only if the conflict is fully resolved, otherwise false." writer default
    if shouldEnd {
      storyComplete = true
    }
  }
}

// Get word count estimate for each paragraph
let wordCounts: number[] = []
for p in paragraphs {
  // Simple word count approximation (spaces + 1)
  let words: number = do "Count the words in this text and return just the number: {p}" writer default
  wordCounts.push(words)
}

// Calculate total words
let totalWords: number = 0
for count in wordCounts {
  totalWords = totalWords + count
}

// Get final summary from AI - tests that AI sees full context
let summary: text = do "In one sentence, summarize what happened in this {genre} story about {elements.protagonist}." writer default
`;

async function runStoryBuilder(logAi = true): Promise<Runtime> {
  const program = parse(VIBE_PROGRAM);
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

describe.skipIf(!shouldRun)('Story Builder Integration', () => {
  test('builds story iteratively with loops and AI context', async () => {
    const runtime = await runStoryBuilder();

    // Check elements were generated
    const elements = runtime.getValue('elements') as Record<string, string>;
    expect(typeof elements).toBe('object');
    expect(elements).toHaveProperty('protagonist');
    expect(elements).toHaveProperty('setting');
    expect(elements).toHaveProperty('conflict');

    // Check paragraphs were collected
    const paragraphs = runtime.getValue('paragraphs') as string[];
    expect(Array.isArray(paragraphs)).toBe(true);
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(paragraphs.length).toBeLessThanOrEqual(3);

    // Each paragraph should be non-empty text
    for (const p of paragraphs) {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(20);
    }

    // Check word counts were calculated
    const wordCounts = runtime.getValue('wordCounts') as number[];
    expect(Array.isArray(wordCounts)).toBe(true);
    expect(wordCounts.length).toBe(paragraphs.length);

    // Each word count should be a reasonable number
    for (const count of wordCounts) {
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(5);
      expect(count).toBeLessThan(200);
    }

    // Total words should be sum of counts
    const totalWords = runtime.getValue('totalWords') as number;
    expect(typeof totalWords).toBe('number');
    expect(totalWords).toBeGreaterThan(20);

    // Summary should reference the story
    const summary = runtime.getValue('summary') as string;
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(20);

    // Log results for debugging
    console.log('\n=== Story Builder Results ===');
    console.log('Elements:', JSON.stringify(elements, null, 2));
    console.log('Paragraphs:', paragraphs.length);
    console.log('Word counts:', wordCounts);
    console.log('Total words:', totalWords);
    console.log('Summary:', summary);
    console.log('\n--- Full Story ---');
    paragraphs.forEach((p, i) => console.log(`[${i + 1}] ${p}\n`));
  }, 180000); // 3 minute timeout for multiple AI calls
});
