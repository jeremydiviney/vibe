import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../../parser/parse';
import { createInitialState } from '../state';
import { runWithMockAI } from './helpers';

// Helper to load and run a vibe script file
function runVibeScript(
  filename: string,
  aiMockResponses: string | Record<string, string>
) {
  const scriptPath = join(process.cwd(), 'tests', 'fixtures', filename);
  const source = readFileSync(scriptPath, 'utf-8');
  const ast = parse(source);
  const state = createInitialState(ast);
  return runWithMockAI(state, aiMockResponses);
}

describe('End-to-End Vibe Scripts', () => {
  test('simple-greeting.vibe - basic AI call with interpolation', () => {
    const finalState = runVibeScript('simple-greeting.vibe', {
      'Generate a friendly greeting for Alice': 'Hello Alice! Welcome!',
    });

    expect(finalState.status).toBe('completed');
    expect(finalState.lastResult).toBe('Hello Alice! Welcome!');
  });

  test('function-call.vibe - functions with multiple AI calls', () => {
    const finalState = runVibeScript('function-call.vibe', {
      'Write a short story about a brave knight':
        'Once upon a time, a brave knight saved the kingdom.',
      'Summarize this: Once upon a time, a brave knight saved the kingdom.':
        'Knight saves kingdom.',
    });

    expect(finalState.status).toBe('completed');
    expect(finalState.lastResult).toBe('Knight saves kingdom.');
  });

  test('conditional-logic.vibe - if statement with AI call', () => {
    const finalState = runVibeScript('conditional-logic.vibe', {
      'Generate a premium greeting': 'Welcome, valued premium member!',
    });

    expect(finalState.status).toBe('completed');
    expect(finalState.lastResult).toBe('Welcome, valued premium member!');
  });

  test('template-literals.vibe - template literal interpolation with AI', () => {
    const finalState = runVibeScript('template-literals.vibe', {
      'Generate a welcome message for John Doe':
        'Welcome to our platform, John Doe!',
    });

    expect(finalState.status).toBe('completed');
    expect(finalState.lastResult).toBe('Welcome to our platform, John Doe!');
  });

  test('multiple-ai-calls.vibe - sequential AI calls with data flow', () => {
    const finalState = runVibeScript('multiple-ai-calls.vibe', {
      'Give a one-sentence overview of machine learning':
        'Machine learning is AI that learns from data.',
      'Expand on this: Machine learning is AI that learns from data.':
        'Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.',
      'Summarize in 5 words: Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.':
        'AI learns from data automatically',
    });

    expect(finalState.status).toBe('completed');
    expect(finalState.lastResult).toBe('AI learns from data automatically');
  });
});
