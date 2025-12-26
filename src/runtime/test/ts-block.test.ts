import { describe, expect, test, beforeEach } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, AIProvider, clearFunctionCache, getFunctionCacheSize, TsBlockError } from '../index';

// Mock AI provider for testing
function createMockProvider(): AIProvider {
  return {
    async execute(prompt: string): Promise<string> {
      return 'ai response';
    },
    async generateCode(prompt: string): Promise<string> {
      return 'generated code';
    },
    async askUser(prompt: string): Promise<string> {
      return 'user input';
    },
  };
}

describe('Runtime - TypeScript Blocks', () => {
  beforeEach(() => {
    clearFunctionCache();
  });

  // ============================================================================
  // Basic arithmetic
  // ============================================================================

  test('ts block with simple return', async () => {
    const ast = parse('let x = ts() { return 42 }');
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('x')).toBe(42);
  });

  test('ts block with addition', async () => {
    const ast = parse(`
      let a = "5"
      let b = "3"
      let sum = ts(a, b) { return Number(a) + Number(b) }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('sum')).toBe(8);
  });

  test('ts block with multiplication', async () => {
    const ast = parse(`
      let x = "7"
      let doubled = ts(x) { return Number(x) * 2 }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('doubled')).toBe(14);
  });

  // ============================================================================
  // String operations
  // ============================================================================

  test('ts block string manipulation', async () => {
    const ast = parse(`
      let name = "alice"
      let upper = ts(name) { return name.toUpperCase() }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('upper')).toBe('ALICE');
  });

  test('ts block string concatenation', async () => {
    const ast = parse(`
      let first = "Hello"
      let second = "World"
      let result = ts(first, second) { return first + " " + second }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('result')).toBe('Hello World');
  });

  test('ts block template literal', async () => {
    const ast = parse(`
      let name = "Bob"
      let greeting = ts(name) { return \`Hello, \${name}!\` }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('greeting')).toBe('Hello, Bob!');
  });

  // ============================================================================
  // Array operations
  // ============================================================================

  test('ts block array map', async () => {
    const ast = parse(`
      let items:json = ["a", "b", "c"]
      let upper = ts(items) { return items.map(x => x.toUpperCase()) }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('upper')).toEqual(['A', 'B', 'C']);
  });

  test('ts block array filter', async () => {
    const ast = parse(`
      let numbers:json = ["1", "2", "3", "4", "5"]
      let evens = ts(numbers) { return numbers.filter(x => Number(x) % 2 === 0) }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('evens')).toEqual(['2', '4']);
  });

  test('ts block array reduce', async () => {
    const ast = parse(`
      let numbers:json = ["1", "2", "3", "4", "5"]
      let sum = ts(numbers) { return numbers.reduce((a, b) => a + Number(b), 0) }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('sum')).toBe(15);
  });

  // ============================================================================
  // Object operations
  // ============================================================================

  test('ts block returns object', async () => {
    const ast = parse(`
      let name = "alice"
      let age = "30"
      let user = ts(name, age) { return { name: name, age: Number(age) } }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('user')).toEqual({ name: 'alice', age: 30 });
  });

  test('ts block accesses object property', async () => {
    const ast = parse(`
      let user:json = {name: "bob", score: "100"}
      let userName = ts(user) { return user.name }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('userName')).toBe('bob');
  });

  test('ts block JSON stringify', async () => {
    const ast = parse(`
      let data:json = {key: "value"}
      let jsonStr = ts(data) { return JSON.stringify(data) }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('jsonStr')).toBe('{"key":"value"}');
  });

  // ============================================================================
  // Math operations
  // ============================================================================

  test('ts block Math.max', async () => {
    const ast = parse(`
      let a = "5"
      let b = "10"
      let max = ts(a, b) { return Math.max(Number(a), Number(b)) }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('max')).toBe(10);
  });

  test('ts block Math.round', async () => {
    const ast = parse(`
      let value = "3.7"
      let rounded = ts(value) { return Math.round(Number(value)) }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('rounded')).toBe(4);
  });

  // ============================================================================
  // Conditionals in ts block
  // ============================================================================

  test('ts block with ternary', async () => {
    const ast = parse(`
      let x = "5"
      let sign = ts(x) { return Number(x) > 0 ? "positive" : "non-positive" }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('sign')).toBe('positive');
  });

  test('ts block with if statement', async () => {
    const ast = parse(`
      let x = "-3"
      let abs = ts(x) {
        const n = Number(x)
        if (n < 0) { return -n }
        return n
      }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('abs')).toBe(3);
  });

  // ============================================================================
  // Multiple ts blocks in sequence
  // ============================================================================

  test('chained ts blocks', async () => {
    const ast = parse(`
      let x = "5"
      let doubled = ts(x) { return Number(x) * 2 }
      let squared = ts(doubled) { return doubled * doubled }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('doubled')).toBe(10);
    expect(runtime.getValue('squared')).toBe(100);
  });

  // ============================================================================
  // ts block with async/await
  // ============================================================================

  test('ts block with async operation', async () => {
    const ast = parse(`
      let result = ts() {
        return await Promise.resolve(42)
      }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('result')).toBe(42);
  });

  test('ts block with delayed async', async () => {
    const ast = parse(`
      let result = ts() {
        return await new Promise(resolve => setTimeout(() => resolve("done"), 10))
      }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('result')).toBe('done');
  });

  // ============================================================================
  // Function caching
  // ============================================================================

  test('function cache stores compiled functions', async () => {
    expect(getFunctionCacheSize()).toBe(0);

    const ast = parse(`
      let a = "1"
      let b = "2"
      let sum1 = ts(a, b) { return Number(a) + Number(b) }
      let sum2 = ts(a, b) { return Number(a) + Number(b) }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // Same function body should be cached and reused
    expect(getFunctionCacheSize()).toBe(1);
    expect(runtime.getValue('sum1')).toBe(3);
    expect(runtime.getValue('sum2')).toBe(3);
  });

  test('different function bodies create different cache entries', async () => {
    expect(getFunctionCacheSize()).toBe(0);

    const ast = parse(`
      let x = "5"
      let doubled = ts(x) { return Number(x) * 2 }
      let tripled = ts(x) { return Number(x) * 3 }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(getFunctionCacheSize()).toBe(2);
    expect(runtime.getValue('doubled')).toBe(10);
    expect(runtime.getValue('tripled')).toBe(15);
  });

  // ============================================================================
  // Error handling
  // ============================================================================

  test('ts block throws on undefined variable', async () => {
    const ast = parse(`
      let result = ts(undefinedVar) { return undefinedVar }
    `);
    const runtime = new Runtime(ast, createMockProvider());

    await expect(runtime.run()).rejects.toThrow("'undefinedVar' is not defined");
  });

  test('ts block can throw and catch errors', async () => {
    const ast = parse(`
      let result = ts() {
        try {
          throw new Error("test error")
        } catch (e) {
          return "caught"
        }
      }
    `);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('result')).toBe('caught');
  });

  // ============================================================================
  // Integration with AI calls
  // ============================================================================

  test('ts block processes AI response', async () => {
    const provider: AIProvider = {
      async execute(): Promise<string> {
        return '{"name": "alice", "score": 95}';
      },
      async generateCode(): Promise<string> {
        return '';
      },
      async askUser(): Promise<string> {
        return '';
      },
    };

    const ast = parse(`
      model gpt = { name: "gpt-4", apiKey: "key", url: "http://test" }
      let response = do "get user" gpt default
      let parsed:json = ts(response) { return JSON.parse(response) }
      let score = ts(parsed) { return parsed.score }
    `);
    const runtime = new Runtime(ast, provider);
    await runtime.run();

    expect(runtime.getValue('parsed')).toEqual({ name: 'alice', score: 95 });
    expect(runtime.getValue('score')).toBe(95);
  });

  // ============================================================================
  // TsBlockError - Enhanced error handling
  // ============================================================================

  test('ts block runtime error includes code snippet', async () => {
    const ast = parse(`
      let result = ts() { throw new Error("intentional error") }
    `);
    const runtime = new Runtime(ast, createMockProvider());

    try {
      await runtime.run();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TsBlockError);
      expect((error as TsBlockError).message).toContain('runtime error');
      expect((error as TsBlockError).message).toContain('intentional error');
      expect((error as TsBlockError).message).toContain('Code:');
    }
  });

  test('ts block syntax error provides helpful message', async () => {
    // Note: Vibe parser extracts raw TS body, so we need valid Vibe syntax
    // but invalid TS syntax. Using return with no semicolon and trailing content
    const ast = parse(`
      let result = ts() { return const const const }
    `);
    const runtime = new Runtime(ast, createMockProvider());

    try {
      await runtime.run();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TsBlockError);
      expect((error as TsBlockError).message).toContain('compilation error');
    }
  });

  test('TsBlockError preserves original error', async () => {
    const ast = parse(`
      let result = ts() { throw new TypeError("type mismatch") }
    `);
    const runtime = new Runtime(ast, createMockProvider());

    try {
      await runtime.run();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TsBlockError);
      const tsError = error as TsBlockError;
      expect(tsError.originalError).toBeDefined();
      expect(tsError.originalError.message).toBe('type mismatch');
    }
  });

  test('TsBlockError includes params and body', async () => {
    const ast = parse(`
      let x = "5"
      let result = ts(x) { return x.nonExistentMethod() }
    `);
    const runtime = new Runtime(ast, createMockProvider());

    try {
      await runtime.run();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TsBlockError);
      const tsError = error as TsBlockError;
      expect(tsError.params).toEqual(['x']);
      expect(tsError.body).toContain('nonExistentMethod');
    }
  });
});
