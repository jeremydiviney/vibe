import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, AIProvider } from '../index';

// Mock AI provider for testing
function createMockProvider(doResponse: string): AIProvider {
  return {
    async execute() {
      return { value: doResponse };
    },
    async generateCode() {
      return { value: `let result = "generated"` };
    },
    async askUser(): Promise<string> {
      return 'user input';
    },
  };
}

describe('Runtime - Basic 1', () => {
  test('vibe expression returns AI response into variable', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let answer = vibe "what is 2 + 2?" myModel default
answer
`);
    const provider = createMockProvider('4');
    const runtime = new Runtime(ast, provider);
    const result = await runtime.run();

    expect(result).toBe('4');
  });

  test('getValue returns variable value after run', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let answer = vibe "what is 2 + 2?" myModel default
`);
    const provider = createMockProvider('42');
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(runtime.getValue('answer')).toBe('42');
  });

  test('json variable with object literal used in prompt', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let userData: json = {name: "alice", role: "admin"}
let result = vibe "Process this user" myModel default
result
`);
    const provider = createMockProvider('User processed successfully');
    const runtime = new Runtime(ast, provider);
    const result = await runtime.run();

    // Verify the json variable was created correctly
    expect(runtime.getValue('userData')).toEqual({ name: 'alice', role: 'admin' });
    expect(result).toBe('User processed successfully');
  });

  test('AI returns JSON string parsed into json variable', async () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let response: json = vibe "Return user data as JSON" myModel default
`);
    // AI returns a JSON string
    const provider = createMockProvider('{"id": 123, "name": "bob", "active": true}');
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    // The json type should auto-parse the string into an object
    const response = runtime.getValue('response') as any;
    expect(response).toEqual({ id: 123, name: 'bob', active: true });
    expect(response.id).toBe(123);
    expect(response.name).toBe('bob');
  });

  test('full program: create data, call AI, store json result', async () => {
    const ast = parse(`
model gpt = { name: "gpt-4", apiKey: "sk-test", url: "https://api.example.com" }

let config: json = {
  maxItems: "10",
  filter: "active"
}

let users: json = vibe "fetch users with config" gpt default
`);
    // AI returns an array of users
    const provider = createMockProvider('[{"name": "alice"}, {"name": "bob"}]');
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    // Verify config object
    const config = runtime.getValue('config') as any;
    expect(config.maxItems).toBe('10');
    expect(config.filter).toBe('active');

    // Verify parsed JSON array from AI
    const users = runtime.getValue('users') as any;
    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('alice');
    expect(users[1].name).toBe('bob');
  });

  // Note: 'model config resolves variable references' test moved to model-config.test.ts

  test('complex json structure matches expected exactly', async () => {
    const ast = parse(`
model api = { name: "gpt-4", apiKey: "key", url: "https://api.test.com" }

let appState: json = {
  user: {
    id: "123",
    profile: {
      name: "alice",
      settings: {
        theme: "dark",
        notifications: true
      }
    },
    roles: ["admin", "editor"]
  },
  metadata: {
    version: "1.0",
    features: ["export", "import", "share"]
  }
}
`);
    const provider = createMockProvider('');
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    // Verify entire JSON structure matches expected
    expect(runtime.getValue('appState')).toEqual({
      user: {
        id: '123',
        profile: {
          name: 'alice',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
        roles: ['admin', 'editor'],
      },
      metadata: {
        version: '1.0',
        features: ['export', 'import', 'share'],
      },
    });
  });
});
