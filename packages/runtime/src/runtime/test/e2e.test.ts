import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../../parser/parse';
import { createInitialState } from '../state';
import { runWithMockAI } from './helpers';

// Get the package root directory (relative to this test file)
// src/runtime/test -> runtime -> src -> runtime (package root)
const packageRoot = join(import.meta.dir, '..', '..', '..');

// Helper to load and run a vibe script file
function runVibeScript(
  filename: string,
  aiMockResponses: string | Record<string, string>
) {
  const scriptPath = join(packageRoot, 'tests', 'fixtures', filename);
  const source = readFileSync(scriptPath, 'utf-8');
  const ast = parse(source);
  const state = createInitialState(ast);
  return runWithMockAI(state, aiMockResponses);
}

describe('End-to-End Vibe Scripts', () => {
  test('simple-greeting.vibe - basic AI call with interpolation', () => {
    // With unified interpolation, {name} in prompt strings is left as a reference
    // The AI sees the literal {name} and gets the value through context
    const finalState = runVibeScript('simple-greeting.vibe', {
      'Generate a friendly greeting for {name}': 'Hello Alice! Welcome!',
    });

    expect(finalState.status).toBe('completed');
    // AI results are AIResultObject - access .value for primitive
    expect(finalState.lastResult.value).toBe('Hello Alice! Welcome!');
  });

  test('function-call.vibe - functions with multiple AI calls', () => {
    // First prompt: aiPrompt is a regular string variable, {topic} expands to value
    // Second prompt: directly in vibe expression, {content} is left as reference
    const finalState = runVibeScript('function-call.vibe', {
      'Write a short story about a brave knight':
        'Once upon a time, a brave knight saved the kingdom.',
      'Summarize this: {content}': 'Knight saves kingdom.',
    });

    expect(finalState.status).toBe('completed');
    // AI results are AIResultObject - access .value for primitive
    expect(finalState.lastResult.value).toBe('Knight saves kingdom.');
  });

  test('conditional-logic.vibe - if statement with AI call', () => {
    const finalState = runVibeScript('conditional-logic.vibe', {
      'Generate a premium greeting': 'Welcome, valued premium member!',
    });

    expect(finalState.status).toBe('completed');
    // VibeValue: access .value for the primitive
    expect(finalState.lastResult.value).toBe('Welcome, valued premium member!');
  });

  test('template-literals.vibe - template literal interpolation with AI', () => {
    // {fullName} is left as reference in prompt (vibe expression)
    const finalState = runVibeScript('template-literals.vibe', {
      'Generate a welcome message for {fullName}':
        'Welcome to our platform, John Doe!',
    });

    expect(finalState.status).toBe('completed');
    // AI results are AIResultObject - access .value for primitive
    expect(finalState.lastResult.value).toBe('Welcome to our platform, John Doe!');
  });

  test('multiple-ai-calls.vibe - sequential AI calls with data flow', () => {
    // {topic}, {overview}, {details} are left as references in prompts
    const finalState = runVibeScript('multiple-ai-calls.vibe', {
      'Give a one-sentence overview of {topic}':
        'Machine learning is AI that learns from data.',
      'Expand on this: {overview}':
        'Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.',
      'Summarize in 5 words: {details}':
        'AI learns from data automatically',
    });

    expect(finalState.status).toBe('completed');
    // AI results are AIResultObject - access .value for primitive
    expect(finalState.lastResult.value).toBe('AI learns from data automatically');
  });
});
