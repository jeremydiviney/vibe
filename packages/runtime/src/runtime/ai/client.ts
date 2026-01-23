// AI Client - Main orchestration for AI API calls

import type { AIProviderType, AIRequest, AIResponse, TargetType, ModelConfig, ProviderExecutor, ModelUsageRecord } from './types';
import type { VibeToolValue } from '../tools/types';
import { withRetry } from './retry';
import { executeOpenAI } from './providers/openai';
import { executeAnthropic } from './providers/anthropic';
import { executeGoogle } from './providers/google';
import { RuntimeError } from '../../errors';

/**
 * Detect provider from URL.
 * Returns 'openai' as default for unknown/custom endpoints.
 */
export function detectProvider(url: string | null): AIProviderType {
  if (!url) return 'openai';

  const u = url.toLowerCase();
  if (u.includes('anthropic')) return 'anthropic';
  if (u.includes('google') || u.includes('generativelanguage')) return 'google';
  return 'openai';
}

/**
 * Get the provider executor function for a given provider type.
 */
export function getProviderExecutor(provider: AIProviderType): ProviderExecutor {
  switch (provider) {
    case 'anthropic':
      return executeAnthropic;
    case 'google':
      return executeGoogle;
    case 'openai':
    default:
      return executeOpenAI;
  }
}

/**
 * Build an AI request from the given parameters.
 */
export function buildAIRequest(
  model: ModelConfig,
  prompt: string,
  contextText: string,
  operationType: 'do' | 'vibe',
  targetType: TargetType
): AIRequest {
  return {
    operationType,
    prompt,
    contextText,
    targetType,
    model,
  };
}

/** Model value as stored in runtime locals */
export interface VibeModelValue {
  name: string | null;
  apiKey: string | null;
  url: string | null;
  provider?: AIProviderType | null;
  maxRetriesOnError?: number | null;
  tools?: VibeToolValue[];  // Tools available to this model for AI calls
  usage: ModelUsageRecord[];  // Accumulated usage records from all AI calls
}

/**
 * Execute an AI request with the appropriate provider.
 * Handles provider detection, request building, and retry logic.
 */
export async function executeAI(
  modelValue: VibeModelValue,
  prompt: string,
  contextText: string,
  operationType: 'do' | 'vibe',
  targetType: TargetType
): Promise<AIResponse> {
  // Validate model config
  if (!modelValue.name) {
    throw new RuntimeError('Model name is required');
  }
  if (!modelValue.apiKey) {
    throw new RuntimeError('API key is required');
  }

  // Determine provider (explicit or auto-detect)
  const provider: AIProviderType =
    (modelValue.provider as AIProviderType) ?? detectProvider(modelValue.url);

  // Build model config
  const model: ModelConfig = {
    name: modelValue.name,
    apiKey: modelValue.apiKey,
    url: modelValue.url,
    provider,
    maxRetriesOnError: modelValue.maxRetriesOnError ?? undefined,
  };

  // Build request
  const request = buildAIRequest(model, prompt, contextText, operationType, targetType);

  // Get provider executor
  const execute = getProviderExecutor(provider);

  // Execute with retry logic
  const maxRetries = modelValue.maxRetriesOnError ?? 3;
  return withRetry(() => execute(request), { maxRetries });
}
