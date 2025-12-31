// Number Analyzer Integration Test
// Tests multiple Vibe features working together with real AI calls
// Importantly tests that AI can see variables from context

import { describe, test, expect } from 'vitest';
import { Runtime, formatAIInteractions } from '../../../src/runtime';
import { createRealAIProvider } from '../../../src/runtime/ai-provider';
import { parse } from '../../../src/parser/parse';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const hasOpenAIKey = !!OPENAI_API_KEY;

const SOURCE = `
// Number Analyzer - Comprehensive Integration Test
// Tests: model, variables, types, AI calls, loops, conditionals, functions, arrays, operators, context

model analyzer = {
  name: "gpt-4o-mini",
  apiKey: "${OPENAI_API_KEY}",
  url: "https://api.openai.com/v1",
  provider: "openai"
}

// Function to check if a number is even
function isEven(n: number): boolean {
  return n % 2 == 0
}

// Function to categorize a number
function categorize(n: number): text {
  if n < 0 {
    return "negative"
  }
  if n == 0 {
    return "zero"
  }
  if n > 100 {
    return "large"
  }
  return "small"
}

// Get a list of numbers from AI
let numbers: number[] = do "Return a JSON array of exactly 5 integers between -50 and 150. Mix of negative, zero, and positive." analyzer default

// Initialize counters and result arrays
let evenCount: number = 0
let oddCount: number = 0
let categories: text[] = []

// Process each number
for num in numbers {
  // Check even/odd
  if isEven(num) {
    evenCount = evenCount + 1
  } else {
    oddCount = oddCount + 1
  }

  // Get category and add to list
  let cat = categorize(num)
  categories.push(cat)
}

// Calculate total
let total: number = evenCount + oddCount

// Get AI summary - reference variables by name, AI sees them in context
let summary: text = do "Using the variables total, evenCount, oddCount, and categories from context, write a one-sentence summary of the number analysis." analyzer default

// Final result - AI should read variable values from context
let result: json = do "Return a JSON object with fields: analyzed, evenCount, oddCount, summary. Use the values from context variables: total for analyzed, evenCount, oddCount, and summary." analyzer default
`;

async function runVibe(source: string, logAi = true): Promise<Runtime> {
  const program = parse(source);
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

describe.skipIf(!hasOpenAIKey)('Multi-Feature Integration', () => {
  test('number analyzer - full workflow with context', async () => {
    const runtime = await runVibe(SOURCE);

    // Check numbers array was populated
    const numbers = runtime.getValue('numbers') as number[];
    expect(Array.isArray(numbers)).toBe(true);
    expect(numbers).toHaveLength(5);
    numbers.forEach(n => {
      expect(typeof n).toBe('number');
      expect(n).toBeGreaterThanOrEqual(-50);
      expect(n).toBeLessThanOrEqual(150);
    });

    // Check counters
    const evenCount = runtime.getValue('evenCount') as number;
    const oddCount = runtime.getValue('oddCount') as number;
    expect(typeof evenCount).toBe('number');
    expect(typeof oddCount).toBe('number');
    expect(evenCount + oddCount).toBe(5);

    // Verify even/odd counting is correct
    const actualEven = numbers.filter(n => n % 2 === 0).length;
    const actualOdd = numbers.filter(n => n % 2 !== 0).length;
    expect(evenCount).toBe(actualEven);
    expect(oddCount).toBe(actualOdd);

    // Check categories array
    const categories = runtime.getValue('categories') as string[];
    expect(Array.isArray(categories)).toBe(true);
    expect(categories).toHaveLength(5);

    // Verify categories match the categorize function logic
    numbers.forEach((n, i) => {
      const expectedCat = n < 0 ? 'negative' : n === 0 ? 'zero' : n > 100 ? 'large' : 'small';
      expect(categories[i]).toBe(expectedCat);
    });

    // Check total
    const total = runtime.getValue('total') as number;
    expect(total).toBe(5);

    // Check summary is a non-empty string
    const summary = runtime.getValue('summary') as string;
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(10);

    // Check final result object - AI should have read values from context
    const result = runtime.getValue('result') as Record<string, unknown>;
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();

    // The AI should have correctly read these values from context
    expect(result.analyzed).toBe(5);
    expect(result.evenCount).toBe(evenCount);
    expect(result.oddCount).toBe(oddCount);
    expect(typeof result.summary).toBe('string');
  }, 60000);
});
