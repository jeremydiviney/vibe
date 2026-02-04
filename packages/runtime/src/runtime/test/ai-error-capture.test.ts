import { describe, it, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, AIProvider } from '../index';
import type { AIExecutionResult } from '../index';

// Mock provider that always throws (simulates exhausted retries, network errors, etc.)
function createFailingProvider(error: Error | string): AIProvider {
  return {
    async execute(): Promise<AIExecutionResult> {
      throw error;
    },
    async generateCode(): Promise<AIExecutionResult> {
      throw error;
    },
    async askUser(): Promise<string> {
      return 'user input';
    },
  };
}

// Mock provider that succeeds on some calls and fails on others
function createConditionalProvider(responses: Array<{ value: string } | { error: Error }>): AIProvider {
  let callIndex = 0;
  return {
    async execute(): Promise<AIExecutionResult> {
      const entry = responses[callIndex++];
      if (!entry) throw new Error('No more mock responses');
      if ('error' in entry) throw entry.error;
      return entry;
    },
    async generateCode(): Promise<AIExecutionResult> {
      return { value: 'generated' };
    },
    async askUser(): Promise<string> {
      return 'user input';
    },
  };
}

describe('AI Error Capture into .err', () => {
  it('do command captures provider error into .err instead of crashing', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result = do "test prompt" m default
    `);
    const provider = createFailingProvider(new Error('API overloaded (529)'));
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    const state = runtime.getState();
    expect(state.status).toBe('completed');

    const vibeValue = state.callStack[0].locals['result'];
    expect(vibeValue.err).toBe(true);
    expect(vibeValue.errDetails?.message).toBe('API overloaded (529)');
    expect(vibeValue.value).toBe(null);
    expect(vibeValue.source).toBe('ai');
  });

  it('vibe command captures provider error into .err', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result = vibe "test prompt" m default
    `);
    const provider = createFailingProvider(new Error('Rate limit exceeded (429)'));
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    const state = runtime.getState();
    expect(state.status).toBe('completed');

    const vibeValue = state.callStack[0].locals['result'];
    expect(vibeValue.err).toBe(true);
    expect(vibeValue.errDetails?.message).toBe('Rate limit exceeded (429)');
    expect(vibeValue.source).toBe('ai');
  });

  it('error VibeValue .err is checkable in if statement', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result = do "test prompt" m default
      let hadError = false
      if result.err {
        hadError = true
      }
    `);
    const provider = createFailingProvider(new Error('Connection timeout'));
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(runtime.getValue('hadError')).toBe(true);
  });

  it('error VibeValue .errDetails.message contains the error message', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result = do "test prompt" m default
      let msg = result.errDetails.message
    `);
    const provider = createFailingProvider(new Error('Server error 500'));
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(runtime.getValue('msg')).toBe('Server error 500');
  });

  it('program continues after AI error when error is handled', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result = do "test prompt" m default
      let status = "ok"
      if result.err {
        status = "failed"
      }
    `);
    const provider = createFailingProvider(new Error('Network error'));
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(runtime.getValue('status')).toBe('failed');
  });

  it('subsequent AI calls work after a failed one', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let first = do "prompt1" m default
      let second = do "prompt2" m default
    `);
    const provider = createConditionalProvider([
      { error: new Error('First call fails') },
      { value: 'second succeeds' },
    ]);
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    const state = runtime.getState();
    expect(state.status).toBe('completed');

    const first = state.callStack[0].locals['first'];
    expect(first.err).toBe(true);
    expect(first.errDetails?.message).toBe('First call fails');

    const second = state.callStack[0].locals['second'];
    expect(second.err).toBe(false);
    expect(second.value).toBe('second succeeds');
  });

  it('captures non-Error thrown values (strings)', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result = do "test" m default
    `);
    const provider = createFailingProvider('raw string error');
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    const state = runtime.getState();
    expect(state.status).toBe('completed');

    const vibeValue = state.callStack[0].locals['result'];
    expect(vibeValue.err).toBe(true);
    expect(vibeValue.errDetails?.message).toBe('raw string error');
  });

  it('.err is checkable on typed do result (text)', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      const result: text = do "test prompt" m
      let hadError = false
      if result.err {
        hadError = true
      }
    `);
    const provider = createFailingProvider(new Error('API error'));
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(runtime.getValue('hadError')).toBe(true);
  });

  it('.err is checkable on typed do result (custom type)', async () => {
    const ast = parse(`
      type MyResult {
        answer: text
        score: number
      }
      model m = { name: "test", apiKey: "key", url: "http://test" }
      const result: MyResult = do "test prompt" m
      let hadError = false
      if result.err {
        hadError = true
      }
    `);
    const provider = createFailingProvider(new Error('Rate limit'));
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(runtime.getValue('hadError')).toBe(true);
  });

  it('.errDetails.message accessible on typed do result', async () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      const result: text = do "test prompt" m
      let msg = ""
      if result.err {
        msg = result.errDetails.message
      }
    `);
    const provider = createFailingProvider(new Error('Overloaded 529'));
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(runtime.getValue('msg')).toBe('Overloaded 529');
  });

  it('error preserves Error class name in errDetails.type', async () => {
    class CustomAPIError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomAPIError';
      }
    }

    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let result = do "test" m default
    `);
    const provider = createFailingProvider(new CustomAPIError('custom error'));
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    const vibeValue = runtime.getState().callStack[0].locals['result'];
    expect(vibeValue.err).toBe(true);
    expect(vibeValue.errDetails?.type).toBe('CustomAPIError');
  });
});
