// Client tests

import { describe, test, expect } from 'bun:test';
import { detectProvider, getProviderExecutor, buildAIRequest } from '../client';
import { executeOpenAI } from '../providers/openai';
import { executeAnthropic } from '../providers/anthropic';
import { executeGoogle } from '../providers/google';

describe('detectProvider', () => {
  test('defaults to openai for null URL', () => {
    expect(detectProvider(null)).toBe('openai');
  });

  test('defaults to openai for unknown URL', () => {
    expect(detectProvider('https://custom-api.com')).toBe('openai');
    expect(detectProvider('https://api.example.com')).toBe('openai');
  });

  test('detects anthropic from URL', () => {
    expect(detectProvider('https://api.anthropic.com')).toBe('anthropic');
    expect(detectProvider('https://api.anthropic.com/v1/messages')).toBe('anthropic');
    expect(detectProvider('http://ANTHROPIC.example.com')).toBe('anthropic');
  });

  test('detects google from URL', () => {
    expect(detectProvider('https://generativelanguage.googleapis.com')).toBe('google');
    expect(detectProvider('https://GOOGLE.ai/api')).toBe('google');
  });
});

describe('getProviderExecutor', () => {
  test('returns openai executor for openai provider', () => {
    expect(getProviderExecutor('openai')).toBe(executeOpenAI);
  });

  test('returns anthropic executor for anthropic provider', () => {
    expect(getProviderExecutor('anthropic')).toBe(executeAnthropic);
  });

  test('returns google executor for google provider', () => {
    expect(getProviderExecutor('google')).toBe(executeGoogle);
  });
});

describe('buildAIRequest', () => {
  const model = {
    name: 'test-model',
    apiKey: 'test-key',
    url: 'https://api.test.com',
  };

  test('builds request with all fields', () => {
    const request = buildAIRequest(model, 'Hello', 'Context text', 'do', 'text');

    expect(request).toEqual({
      operationType: 'do',
      prompt: 'Hello',
      contextText: 'Context text',
      targetType: 'text',
      model,
    });
  });

  test('builds request with null target type', () => {
    const request = buildAIRequest(model, 'Hello', '', 'ask', null);

    expect(request.targetType).toBeNull();
    expect(request.operationType).toBe('ask');
  });

  test('preserves model config', () => {
    const fullModel = {
      name: 'claude-3',
      apiKey: 'sk-test',
      url: 'https://api.anthropic.com',
      provider: 'anthropic' as const,
      maxRetriesOnError: 5,
    };

    const request = buildAIRequest(fullModel, 'Test', '', 'do', 'json');
    expect(request.model).toEqual(fullModel);
  });
});
