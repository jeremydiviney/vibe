import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, type AIProvider } from '../index';
import { createInitialState, resumeWithAIResponse } from '../state';
import { runUntilPause } from '../step';

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

    // env() is auto-imported, no import needed
    const runtime = createRuntime(`
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

  // ============================================================================
  // Model as Function Parameter
  // ============================================================================

  test('function with model parameter - access model properties', async () => {
    const runtime = createRuntime(`
model myModel = {
  name: "gpt-4",
  apiKey: "test-key",
  provider: "openai"
}

function getModelName(m: model): text {
  return ts(m) { return m.name; }
}

let name = getModelName(myModel)
`);
    await runtime.run();
    expect(runtime.getValue('name')).toBe('gpt-4');
  });

  test('function with multiple model parameters', async () => {
    const runtime = createRuntime(`
model guesserModel = {
  name: "claude-sonnet-4-20250514",
  apiKey: "key1",
  provider: "anthropic"
}

model answererModel = {
  name: "gpt-4",
  apiKey: "key2",
  provider: "openai"
}

function getModelNames(guesser: model, answerer: model): text {
  let g = ts(guesser) { return guesser.name; }
  let a = ts(answerer) { return answerer.name; }
  return g + " vs " + a
}

let result = getModelNames(guesserModel, answererModel)
`);
    await runtime.run();
    expect(runtime.getValue('result')).toBe('claude-sonnet-4-20250514 vs gpt-4');
  });

  test('function with model and other parameters', async () => {
    const runtime = createRuntime(`
model testModel = {
  name: "test-model",
  apiKey: "key",
  provider: "test"
}

function processWithModel(m: model, data: text): text {
  let modelName = ts(m) { return m.name; }
  return modelName + ": " + data
}

let output = processWithModel(testModel, "hello")
`);
    await runtime.run();
    expect(runtime.getValue('output')).toBe('test-model: hello');
  });

  test('function with model parameter used in do expression', () => {
    const ast = parse(`
model myModel = {
  name: "gpt-4",
  apiKey: "key",
  provider: "openai"
}

function askQuestion(m: model, question: text): text {
  return do question m default
}

let answer = askQuestion(myModel, "What is 2+2?")
`);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // Should be waiting for AI response
    expect(state.status).toBe('awaiting_ai');
    expect(state.pendingAI?.prompt).toBe('What is 2+2?');
    expect(state.pendingAI?.model).toBe('m'); // Model param name inside function

    // Resume with mock response
    state = resumeWithAIResponse(state, 'The answer is 4');
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['answer']?.value).toBe('The answer is 4');
  });

  test('function with two model parameters used in different do expressions', () => {
    const ast = parse(`
model guesser = {
  name: "claude-sonnet-4-20250514",
  apiKey: "key1",
  provider: "anthropic"
}

model answerer = {
  name: "gpt-4",
  apiKey: "key2",
  provider: "openai"
}

function playRound(g: model, a: model, category: text): text {
  let question = do "Ask a question about {category}" g default
  let answer = do "Answer: {question}" a default
  return answer
}

let result = playRound(guesser, answerer, "animals")
`);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // First AI call uses guesser model (param name 'g')
    expect(state.status).toBe('awaiting_ai');
    expect(state.pendingAI?.model).toBe('g');

    state = resumeWithAIResponse(state, 'Is a penguin a bird?');
    state = runUntilPause(state);

    // Second AI call uses answerer model (param name 'a')
    expect(state.status).toBe('awaiting_ai');
    expect(state.pendingAI?.model).toBe('a');

    state = resumeWithAIResponse(state, 'Yes, a penguin is a bird.');
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result']?.value).toBe('Yes, a penguin is a bird.');
  });
});
