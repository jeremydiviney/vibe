import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, type AIProvider, type AIExecutionResult } from '../index';

describe('AI provider state visibility', () => {
  test('provider can see pendingAI during execute() call', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      const result = do "hello" m
    `);

    let seenPendingAI: unknown = 'not-called';

    // Create a runtime with a provider that checks state visibility
    const runtime: Runtime = new Runtime(ast, {
      async execute(prompt: string): Promise<AIExecutionResult> {
        // This is the critical check: the provider should be able to see
        // the pendingAI field when it's called during execution
        const state = runtime.getState();
        seenPendingAI = state.pendingAI;
        return { value: 'response' };
      },
      async generateCode(): Promise<AIExecutionResult> {
        return { value: '' };
      },
      async askUser(): Promise<string> {
        return '';
      },
    });

    await runtime.run();

    // The provider should have seen pendingAI with the correct model and prompt
    expect(seenPendingAI).not.toBeNull();
    expect((seenPendingAI as any)?.model).toBe('m');
    expect((seenPendingAI as any)?.prompt).toBe('hello');
  });

  test('provider can see pendingAI when do is inside a function', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      function ask(msg: text): text {
        const answer: text = do msg m
        return answer
      }
      let result = ask("what is 2+2?")
    `);

    let seenPendingAI: unknown = 'not-called';

    const runtime: Runtime = new Runtime(ast, {
      async execute(prompt: string): Promise<AIExecutionResult> {
        const state = runtime.getState();
        seenPendingAI = state.pendingAI;
        return { value: 'four' };
      },
      async generateCode(): Promise<AIExecutionResult> {
        return { value: '' };
      },
      async askUser(): Promise<string> {
        return '';
      },
    });

    await runtime.run();

    expect(seenPendingAI).not.toBeNull();
    expect((seenPendingAI as any)?.prompt).toBe('what is 2+2?');
    expect(runtime.getValue('result')).toBe('four');
  });
});
