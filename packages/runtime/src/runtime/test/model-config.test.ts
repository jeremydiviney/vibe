import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, type AIProvider } from '../index';

describe('Runtime - Model Config Value Resolution', () => {
  const mockProvider: AIProvider = {
    execute: async (prompt: string) => ({ value: prompt }),
    generateCode: async () => ({ value: '' }),
    askUser: async () => '',
  };

  function createRuntime(code: string): Runtime {
    const ast = parse(code);
    return new Runtime(ast, mockProvider);
  }

  // ============================================================================
  // Literal Values
  // ============================================================================

  test('model config with string literals', async () => {
    const runtime = createRuntime(`
model testModel = {
  name: "gpt-4",
  apiKey: "sk-test-key",
  provider: "openai"
}

let modelInfo = ts(testModel) {
  return { name: testModel.name, apiKey: testModel.apiKey, provider: testModel.provider };
}
`);
    await runtime.run();
    expect(runtime.getValue('modelInfo')).toEqual({
      name: 'gpt-4',
      apiKey: 'sk-test-key',
      provider: 'openai',
    });
  });

  test('model config with url literal', async () => {
    const runtime = createRuntime(`
model testModel = {
  name: "custom-model",
  apiKey: "key",
  url: "https://api.example.com/v1"
}

let url = ts(testModel) {
  return testModel.url;
}
`);
    await runtime.run();
    expect(runtime.getValue('url')).toBe('https://api.example.com/v1');
  });

  // ============================================================================
  // Variable References
  // ============================================================================

  test('model config with variable reference for apiKey', async () => {
    const runtime = createRuntime(`
const myKey = ts() {
  return "resolved-api-key";
}

model testModel = {
  name: "gpt-4",
  apiKey: myKey,
  provider: "openai"
}

let resolvedKey = ts(testModel) {
  return testModel.apiKey;
}
`);
    await runtime.run();
    expect(runtime.getValue('resolvedKey')).toBe('resolved-api-key');
  });

  test('model config with variable reference for name', async () => {
    const runtime = createRuntime(`
let modelName = "claude-3-opus"

model testModel = {
  name: modelName,
  apiKey: "key",
  provider: "anthropic"
}

let resolvedName = ts(testModel) {
  return testModel.name;
}
`);
    await runtime.run();
    expect(runtime.getValue('resolvedName')).toBe('claude-3-opus');
  });

  test('model config with variable reference for provider', async () => {
    const runtime = createRuntime(`
let myProvider = "anthropic"

model testModel = {
  name: "claude",
  apiKey: "key",
  provider: myProvider
}

let resolvedProvider = ts(testModel) {
  return testModel.provider;
}
`);
    await runtime.run();
    expect(runtime.getValue('resolvedProvider')).toBe('anthropic');
  });

  test('model config with multiple variable references', async () => {
    const runtime = createRuntime(`
let myName = "gpt-4"
let myKey = "sk-secret"
let myProvider = "openai"
let myUrl = "https://custom.api.com"

model testModel = {
  name: myName,
  apiKey: myKey,
  provider: myProvider,
  url: myUrl
}

let config = ts(testModel) {
  return {
    name: testModel.name,
    apiKey: testModel.apiKey,
    provider: testModel.provider,
    url: testModel.url
  };
}
`);
    await runtime.run();
    expect(runtime.getValue('config')).toEqual({
      name: 'gpt-4',
      apiKey: 'sk-secret',
      provider: 'openai',
      url: 'https://custom.api.com',
    });
  });

  // ============================================================================
  // Const vs Let Variables
  // ============================================================================

  test('model config with const variable reference', async () => {
    const runtime = createRuntime(`
const API_KEY = "const-api-key"

model testModel = {
  name: "test",
  apiKey: API_KEY,
  provider: "test"
}

let key = ts(testModel) {
  return testModel.apiKey;
}
`);
    await runtime.run();
    expect(runtime.getValue('key')).toBe('const-api-key');
  });

  test('model config with let variable reference', async () => {
    const runtime = createRuntime(`
let dynamicKey = "dynamic-key"

model testModel = {
  name: "test",
  apiKey: dynamicKey,
  provider: "test"
}

let key = ts(testModel) {
  return testModel.apiKey;
}
`);
    await runtime.run();
    expect(runtime.getValue('key')).toBe('dynamic-key');
  });

  // ============================================================================
  // TS Block Results as Config Values
  // ============================================================================

  test('model config with ts block result', async () => {
    const runtime = createRuntime(`
const computedKey = ts() {
  return "computed-" + "key";
}

model testModel = {
  name: "test",
  apiKey: computedKey,
  provider: "test"
}

let key = ts(testModel) {
  return testModel.apiKey;
}
`);
    await runtime.run();
    expect(runtime.getValue('key')).toBe('computed-key');
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  test('model config with empty string', async () => {
    const runtime = createRuntime(`
model testModel = {
  name: "",
  apiKey: "key",
  provider: "test"
}

let name = ts(testModel) {
  return testModel.name;
}
`);
    await runtime.run();
    expect(runtime.getValue('name')).toBe('');
  });

  test('model config with special characters in strings', async () => {
    const runtime = createRuntime(`
model testModel = {
  name: "model-with-dashes",
  apiKey: "sk_test_key_123",
  url: "https://api.example.com/v1/chat?param=value"
}

let info = ts(testModel) {
  return { name: testModel.name, apiKey: testModel.apiKey, url: testModel.url };
}
`);
    await runtime.run();
    expect(runtime.getValue('info')).toEqual({
      name: 'model-with-dashes',
      apiKey: 'sk_test_key_123',
      url: 'https://api.example.com/v1/chat?param=value',
    });
  });

  // ============================================================================
  // CallExpression in Model Config - Currently Broken
  // These tests FAIL with current implementation - they define expected behavior.
  // ============================================================================

  test('model config with env() function call', async () => {
    process.env.TEST_MODEL_API_KEY = 'env-api-key-value';

    const runtime = createRuntime(`
import { env } from "system"

model testModel = {
  name: "test",
  apiKey: env("TEST_MODEL_API_KEY"),
  provider: "test"
}

let key = ts(testModel) {
  return testModel.apiKey;
}
`);
    await runtime.run();
    expect(runtime.getValue('key')).toBe('env-api-key-value');

    delete process.env.TEST_MODEL_API_KEY;
  });

  test('model config with inline ts block', async () => {
    const runtime = createRuntime(`
model testModel = {
  name: "test",
  apiKey: ts() { return "inline-key"; },
  provider: "test"
}

let key = ts(testModel) {
  return testModel.apiKey;
}
`);
    await runtime.run();
    expect(runtime.getValue('key')).toBe('inline-key');
  });

  test('model config with vibe function call', async () => {
    const runtime = createRuntime(`
function getKey(): text {
  return "function-key"
}

model testModel = {
  name: "test",
  apiKey: getKey(),
  provider: "test"
}

let key = ts(testModel) {
  return testModel.apiKey;
}
`);
    await runtime.run();
    expect(runtime.getValue('key')).toBe('function-key');
  });

  // ============================================================================
  // Workaround Tests - Assign to variable first, then use in model
  // ============================================================================

  test('workaround: ts block result assigned to variable then used in model', async () => {
    const runtime = createRuntime(`
const apiKey = ts() {
  return process.env.TEST_KEY || "fallback-key";
}

model testModel = {
  name: "test",
  apiKey: apiKey,
  provider: "test"
}

let key = ts(testModel) {
  return testModel.apiKey;
}
`);
    await runtime.run();
    expect(runtime.getValue('key')).toBe('fallback-key');
  });
});
