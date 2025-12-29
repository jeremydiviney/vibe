// Formatter tests

import { describe, test, expect } from 'vitest';
import {
  buildSystemMessage,
  buildContextMessage,
  buildPromptMessage,
  buildMessages,
  extractTextContent,
  extractUsage,
} from '../formatters';

describe('buildSystemMessage', () => {
  test('returns a system message string', () => {
    const message = buildSystemMessage();
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain('Vibe');
  });
});

describe('buildContextMessage', () => {
  test('returns null for empty context', () => {
    expect(buildContextMessage('')).toBeNull();
    expect(buildContextMessage('   ')).toBeNull();
  });

  test('wraps context with header', () => {
    const message = buildContextMessage('Variable x = 5');
    expect(message).toContain('context');
    expect(message).toContain('Variable x = 5');
  });
});

describe('buildPromptMessage', () => {
  test('returns prompt as-is when no type instruction needed', () => {
    // Text type doesn't need instruction
    expect(buildPromptMessage('Hello', 'text', false)).toBe('Hello');
    // Structured output handles type
    expect(buildPromptMessage('Hello', 'number', true)).toBe('Hello');
  });

  test('appends type instruction for non-structured output', () => {
    const message = buildPromptMessage('Hello', 'number', false);
    expect(message).toContain('Hello');
    expect(message).toContain('number');
  });

  test('returns prompt as-is when null target type', () => {
    expect(buildPromptMessage('Hello', null, false)).toBe('Hello');
    expect(buildPromptMessage('Hello', null, true)).toBe('Hello');
  });
});

describe('buildMessages', () => {
  test('builds messages with system and prompt', () => {
    const messages = buildMessages('Hello', '', null, true);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('Hello');
  });

  test('includes context message when provided', () => {
    const messages = buildMessages('Hello', 'x = 5', null, true);

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('x = 5');
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toBe('Hello');
  });
});

describe('extractTextContent', () => {
  test('extracts from Anthropic format', () => {
    const response = {
      content: [{ type: 'text', text: 'Hello from Claude' }],
    };
    expect(extractTextContent(response)).toBe('Hello from Claude');
  });

  test('extracts from OpenAI format', () => {
    const response = {
      choices: [{ message: { content: 'Hello from GPT' } }],
    };
    expect(extractTextContent(response)).toBe('Hello from GPT');
  });

  test('extracts from Google format', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello from Gemini' }],
          },
        },
      ],
    };
    expect(extractTextContent(response)).toBe('Hello from Gemini');
  });

  test('throws for unknown format', () => {
    expect(() => extractTextContent({})).toThrow();
    expect(() => extractTextContent({ unknown: 'format' })).toThrow();
  });
});

describe('extractUsage', () => {
  test('extracts from Anthropic format', () => {
    const response = {
      usage: { input_tokens: 10, output_tokens: 20 },
    };
    expect(extractUsage(response)).toEqual({
      inputTokens: 10,
      outputTokens: 20,
    });
  });

  test('extracts from OpenAI format', () => {
    const response = {
      usage: { prompt_tokens: 15, completion_tokens: 25 },
    };
    expect(extractUsage(response)).toEqual({
      inputTokens: 15,
      outputTokens: 25,
    });
  });

  test('extracts from Google format', () => {
    const response = {
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 12 },
    };
    expect(extractUsage(response)).toEqual({
      inputTokens: 8,
      outputTokens: 12,
    });
  });

  test('returns undefined for missing usage', () => {
    expect(extractUsage({})).toBeUndefined();
    expect(extractUsage({ content: 'text' })).toBeUndefined();
  });
});
