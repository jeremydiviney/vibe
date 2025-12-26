import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, RuntimeStatus, AIProvider } from '../index';

// Mock AI provider for testing
class MockAIProvider implements AIProvider {
  public askUserCalls: string[] = [];
  public askUserResponse = 'mock response';

  async execute(prompt: string): Promise<string> {
    return `[AI Response to: ${prompt}]`;
  }

  async generateCode(prompt: string): Promise<string> {
    return `let result = "generated"`;
  }

  async askUser(prompt: string): Promise<string> {
    this.askUserCalls.push(prompt);
    return this.askUserResponse;
  }
}

describe('Runtime - Ask Expression', () => {
  // ============================================================================
  // Basic ask execution
  // ============================================================================

  test('ask expression returns user response', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let answer = ask "What is your name?" myModel default
`);
    const provider = new MockAIProvider();
    provider.askUserResponse = 'Alice';

    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(provider.askUserCalls).toHaveLength(1);
    expect(provider.askUserCalls[0]).toBe('What is your name?');
  });

  test('ask expression result can be used', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let name = ask "What is your name?" myModel default
name
`);
    const provider = new MockAIProvider();
    provider.askUserResponse = 'Bob';

    const runtime = new Runtime(ast, provider);
    const result = await runtime.run();

    expect(result).toBe('Bob');
  });

  test('multiple ask expressions', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let first = ask "First?" myModel default
let second = ask "Second?" myModel default
`);
    const provider = new MockAIProvider();

    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(provider.askUserCalls).toHaveLength(2);
    expect(provider.askUserCalls[0]).toBe('First?');
    expect(provider.askUserCalls[1]).toBe('Second?');
  });

  // ============================================================================
  // Ask with string interpolation
  // ============================================================================

  test('ask with interpolated prompt', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let name = "Alice"
let answer = ask "Hello {name}, how are you?" myModel default
`);
    const provider = new MockAIProvider();

    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(provider.askUserCalls).toHaveLength(1);
    expect(provider.askUserCalls[0]).toBe('Hello Alice, how are you?');
  });

  // ============================================================================
  // Ask in function
  // ============================================================================

  test('ask inside function', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
function getInput(message: text): text {
  return ask message myModel default
}
let result = getInput("Enter value:")
result
`);
    const provider = new MockAIProvider();
    provider.askUserResponse = 'user input';

    const runtime = new Runtime(ast, provider);
    const result = await runtime.run();

    expect(provider.askUserCalls).toHaveLength(1);
    expect(provider.askUserCalls[0]).toBe('Enter value:');
    expect(result).toBe('user input');
  });

  // ============================================================================
  // Runtime state tracking
  // ============================================================================

  test('runtime status changes to AWAITING_USER_INPUT', async () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
let x = ask "test" m default
`);

    const provider: AIProvider = {
      async execute(prompt: string) {
        return '';
      },
      async generateCode(prompt: string) {
        return '';
      },
      async askUser(prompt: string) {
        return 'response';
      },
    };

    const runtime = new Runtime(ast, provider);
    await runtime.run();

    const state = runtime.getState();
    expect(state.status).toBe(RuntimeStatus.COMPLETED);
  });

  // ============================================================================
  // AI history tracking
  // ============================================================================

  test('ask operations are recorded in aiHistory', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let a = ask "Question 1" myModel default
let b = ask "Question 2" myModel default
`);
    const provider = new MockAIProvider();
    provider.askUserResponse = 'answer';

    const runtime = new Runtime(ast, provider);
    await runtime.run();

    const state = runtime.getState();
    expect(state.aiHistory).toHaveLength(2);
    expect(state.aiHistory[0]).toMatchObject({
      type: 'ask',
      prompt: 'Question 1',
      response: 'answer',
    });
    expect(state.aiHistory[1]).toMatchObject({
      type: 'ask',
      prompt: 'Question 2',
      response: 'answer',
    });
  });

  // ============================================================================
  // Ask with other expressions
  // ============================================================================

  test('ask combined with do expression', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let userQuestion = ask "What do you want to know?" myModel default
let aiAnswer = do userQuestion myModel default
`);
    const provider = new MockAIProvider();
    provider.askUserResponse = 'Tell me about AI';

    const runtime = new Runtime(ast, provider);
    await runtime.run();

    const state = runtime.getState();
    expect(state.aiHistory).toHaveLength(2);
    expect(state.aiHistory[0].type).toBe('ask');
    expect(state.aiHistory[1].type).toBe('do');
    expect(state.aiHistory[1].prompt).toBe('Tell me about AI');
  });

  // ============================================================================
  // Ask with different context specifiers
  // ============================================================================

  test('ask with local context', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = ask "Question?" myModel local
`);
    const provider = new MockAIProvider();
    provider.askUserResponse = 'local answer';

    const runtime = new Runtime(ast, provider);
    const result = await runtime.run();

    expect(provider.askUserCalls).toHaveLength(1);
  });

  test('ask with variable context', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let myContext = "some context"
let x = ask "Question?" myModel myContext
x
`);
    const provider = new MockAIProvider();
    provider.askUserResponse = 'contextual answer';

    const runtime = new Runtime(ast, provider);
    const result = await runtime.run();

    expect(result).toBe('contextual answer');
  });
});
