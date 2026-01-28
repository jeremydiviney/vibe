/**
 * Test fixture for TS block type inference with imports
 * Tests that ts blocks can infer types from imported constants
 */

// Record type - should allow indexing and return string
export const API_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
};

// Record with number values
export const PORTS: Record<string, number> = {
  http: 80,
  https: 443,
  dev: 3000,
};

// Simple object type (not Record)
export const CONFIG = {
  name: "test-app",
  version: 1,
  enabled: true,
};

// Array of strings
export const PROVIDERS: string[] = ["openai", "anthropic", "google"];

// Interface-based config
export interface ModelConfig {
  name: string;
  provider: string;
  apiKey: string;
}

export const DEFAULT_MODEL: ModelConfig = {
  name: "gpt-4",
  provider: "openai",
  apiKey: "sk-test",
};

// Helper function that uses the constants
export function getApiKey(provider: string): string {
  return API_KEYS[provider] ?? "";
}

export function getPort(service: string): number {
  return PORTS[service] ?? 0;
}

// Function returning ModelConfig (for testing ts block with object parameter)
export function getModelConfig(id: string): ModelConfig | null {
  if (id === "default") return DEFAULT_MODEL;
  return null;
}
