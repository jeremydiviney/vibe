import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, AIProvider, AIExecutionResult } from '../index';

// Mock AI provider for testing
class MockAIProvider implements AIProvider {
  public executeCalls: string[] = [];

  async execute(prompt: string): Promise<AIExecutionResult> {
    this.executeCalls.push(prompt);
    return { value: `[Response to: ${prompt}]` };
  }

  async generateCode(prompt: string): Promise<AIExecutionResult> {
    // Vibe is now a synonym for do - generateCode just calls execute
    return this.execute(prompt);
  }

  async askUser(prompt: string): Promise<string> {
    return `[User input for: ${prompt}]`;
  }
}

describe('Runtime - Vibe Expression', () => {
  test('vibe expression works like vibe expression', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let result = vibe "hello world" myModel default
result
`);
    const provider = new MockAIProvider();
    const runtime = new Runtime(ast, provider);
    const result = await runtime.run();

    expect(provider.executeCalls).toHaveLength(1);
    expect(provider.executeCalls[0]).toBe('hello world');
    expect(result).toBe('[Response to: hello world]');
  });

  test('vibe expression with default context', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = 10
let result = vibe "what is x" myModel default
result
`);
    const provider = new MockAIProvider();
    const runtime = new Runtime(ast, provider);
    const result = await runtime.run();

    expect(provider.executeCalls).toHaveLength(1);
    expect(provider.executeCalls[0]).toBe('what is x');
  });
});
