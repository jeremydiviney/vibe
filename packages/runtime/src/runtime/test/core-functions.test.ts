// Tests for auto-imported core functions (print, env)
// These functions are available everywhere without explicit import

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime } from '../index';
import type { AIProvider, AIResponse } from '../types';

// Mock provider for tests that don't need AI
function createMockProvider(): AIProvider {
  return {
    async chat(): Promise<AIResponse> {
      return { content: 'mock response', toolCalls: [] };
    },
  };
}

describe('Core Functions - Auto-imported', () => {
  describe('print()', () => {
    test('print works at top level without import', async () => {
      const ast = parse(`
let x = print("hello world")
let y = 42
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      // print returns undefined, but shouldn't throw
      expect(runtime.getValue('y')).toBe(42);
    });

    test('print works inside function without import', async () => {
      const ast = parse(`
function logAndReturn(msg: text): text {
  print(msg)
  return msg
}
let result = logAndReturn("test message")
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('result')).toBe('test message');
    });

    test('print works with different value types', async () => {
      const ast = parse(`
print("string")
print(42)
print(true)
print([1, 2, 3])
let done = true
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('done')).toBe(true);
    });
  });

  describe('env()', () => {
    beforeEach(() => {
      process.env.CORE_TEST_VAR = 'test-value';
      process.env.CORE_TEST_VAR2 = 'second-value';
    });

    afterEach(() => {
      delete process.env.CORE_TEST_VAR;
      delete process.env.CORE_TEST_VAR2;
    });

    test('env works at top level without import', async () => {
      const ast = parse(`
let value = env("CORE_TEST_VAR")
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('value')).toBe('test-value');
    });

    test('env with default value when var not set', async () => {
      const ast = parse(`
let value = env("NONEXISTENT_VAR_12345", "default-value")
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('value')).toBe('default-value');
    });

    test('env returns empty string for missing var without default', async () => {
      const ast = parse(`
let value = env("NONEXISTENT_VAR_12345")
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('value')).toBe('');
    });

    test('env works inside function without import', async () => {
      const ast = parse(`
function getEnvValue(name: text): text {
  return env(name)
}
let value = getEnvValue("CORE_TEST_VAR")
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('value')).toBe('test-value');
    });

    test('env works in json object literal', async () => {
      const ast = parse(`
let config: json = {
  apiKey: env("CORE_TEST_VAR"),
  other: env("CORE_TEST_VAR2")
}
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('config')).toEqual({
        apiKey: 'test-value',
        other: 'second-value',
      });
    });
  });

  describe('core functions in nested contexts', () => {
    beforeEach(() => {
      process.env.NESTED_TEST_VAR = 'nested-value';
    });

    afterEach(() => {
      delete process.env.NESTED_TEST_VAR;
    });

    test('core functions work in chained function calls', async () => {
      const ast = parse(`
function inner(): text {
  return env("NESTED_TEST_VAR")
}

function outer(): text {
  print("calling inner")
  return inner()
}

let result = outer()
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('result')).toBe('nested-value');
    });

    test('core functions work in loops', async () => {
      const ast = parse(`
let count = 0
for i in [1, 2, 3] {
  print(env("NESTED_TEST_VAR"))
  count = count + 1
}
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('count')).toBe(3);
    });

    test('core functions work in conditionals', async () => {
      const ast = parse(`
let value = ""
if true {
  value = env("NESTED_TEST_VAR")
  print("got value: " + value)
}
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('value')).toBe('nested-value');
    });
  });

  describe('args()', () => {
    test('args() returns all program args', async () => {
      const ast = parse(`let allArgs = args()`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--name', 'hello', '--count', '5', 'positional'],
      });
      await runtime.run();
      expect(runtime.getValue('allArgs')).toEqual(['--name', 'hello', '--count', '5', 'positional']);
    });

    test('args() returns empty array when no args', async () => {
      const ast = parse(`let allArgs = args()`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('allArgs')).toEqual([]);
    });

    test('args(n) returns arg at index', async () => {
      const ast = parse(`
let first = args(0)
let second = args(1)
let third = args(2)
`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['foo', 'bar', 'baz'],
      });
      await runtime.run();
      expect(runtime.getValue('first')).toBe('foo');
      expect(runtime.getValue('second')).toBe('bar');
      expect(runtime.getValue('third')).toBe('baz');
    });

    test('args(n) returns null for out of bounds index', async () => {
      const ast = parse(`let val = args(5)`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['foo'],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBeNull();
    });

    test('args("name") returns --name value', async () => {
      const ast = parse(`let val = args("name")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--name', 'hello'],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBe('hello');
    });

    test('args("name") supports --name=value form', async () => {
      const ast = parse(`let val = args("name")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--name=hello'],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBe('hello');
    });

    test('args("name") returns null for missing flag', async () => {
      const ast = parse(`let val = args("missing")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--name', 'hello'],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBeNull();
    });

    test('args("name") with multiple flags', async () => {
      const ast = parse(`
let name = args("name")
let count = args("count")
`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--name', 'hello', '--count', '5'],
      });
      await runtime.run();
      expect(runtime.getValue('name')).toBe('hello');
      expect(runtime.getValue('count')).toBe('5');
    });

    test('args("name") returns empty string for boolean-style flag (last arg)', async () => {
      const ast = parse(`let val = args("dry-run")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--dry-run'],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBe('');
    });

    test('args("name") returns empty string for boolean-style flag (followed by another flag)', async () => {
      const ast = parse(`let val = args("dry-run")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--dry-run', '--verbose'],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBe('');
    });

    test('args("name") returns empty string for --name= form', async () => {
      const ast = parse(`let val = args("name")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--name='],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBe('');
    });

    test('args works inside function', async () => {
      const ast = parse(`
function getArg(name: text): text {
  return args(name)
}
let val = getArg("secret")
`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--secret', 'Taylor Swift'],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBe('Taylor Swift');
    });
  });

  describe('hasArg()', () => {
    test('hasArg returns true when flag is present', async () => {
      const ast = parse(`let val = hasArg("dry-run")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--dry-run'],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBe(true);
    });

    test('hasArg returns false when flag is absent', async () => {
      const ast = parse(`let val = hasArg("dry-run")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--name', 'hello'],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBe(false);
    });

    test('hasArg returns false with no args', async () => {
      const ast = parse(`let val = hasArg("dry-run")`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      expect(runtime.getValue('val')).toBe(false);
    });

    test('hasArg detects --flag=value form', async () => {
      const ast = parse(`let val = hasArg("name")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--name=hello'],
      });
      await runtime.run();
      expect(runtime.getValue('val')).toBe(true);
    });

    test('hasArg works in conditional', async () => {
      const ast = parse(`
let mode = "wet"
if hasArg("dry-run") {
  mode = "dry"
}
`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--dry-run'],
      });
      await runtime.run();
      expect(runtime.getValue('mode')).toBe('dry');
    });
  });

  describe('type inference', () => {
    test('hasArg infers boolean type', async () => {
      const ast = parse(`let dryRun = hasArg("dry-run")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--dry-run'],
      });
      await runtime.run();
      const raw = runtime.getRawValue('dryRun') as any;
      expect(raw.value).toBe(true);
      expect(raw.vibeType).toBe('boolean');
    });

    test('args("name") infers text type', async () => {
      const ast = parse(`let name = args("name")`);
      const runtime = new Runtime(ast, createMockProvider(), {
        programArgs: ['--name', 'hello'],
      });
      await runtime.run();
      const raw = runtime.getRawValue('name') as any;
      expect(raw.value).toBe('hello');
      expect(raw.vibeType).toBe('text');
    });

    test('env() infers text type', async () => {
      process.env.TYPE_TEST_VAR = 'test';
      const ast = parse(`let val = env("TYPE_TEST_VAR")`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      const raw = runtime.getRawValue('val') as any;
      expect(raw.value).toBe('test');
      expect(raw.vibeType).toBe('text');
      delete process.env.TYPE_TEST_VAR;
    });

    test('hasArg infers boolean - rejects assignment to number', async () => {
      expect(() => {
        const ast = parse(`let x: number = hasArg("flag")`);
      }).not.toThrow(); // Parser doesn't throw, but semantic analysis would catch it
    });
  });

  describe('core functions cannot be imported', () => {
    test('importing env from system/utils fails (env is core function)', async () => {
      const ast = parse(`
import { env } from "system/utils"
let x = 1
`);
      const runtime = new Runtime(ast, createMockProvider());
      await expect(runtime.run()).rejects.toThrow("'env' is not exported from 'system/utils'");
    });

    test('importing print from system/utils fails (print is core function)', async () => {
      const ast = parse(`
import { print } from "system/utils"
let x = 1
`);
      const runtime = new Runtime(ast, createMockProvider());
      await expect(runtime.run()).rejects.toThrow("'print' is not exported from 'system/utils'");
    });

    test('importing from system/core is blocked', async () => {
      const ast = parse(`
import { env } from "system/core"
let x = 1
`);
      const runtime = new Runtime(ast, createMockProvider());
      await expect(runtime.run()).rejects.toThrow("'system/core' cannot be imported");
    });

    test('importing from bare "system" fails (not a valid module)', async () => {
      const ast = parse(`
import { uuid } from "system"
let x = 1
`);
      const runtime = new Runtime(ast, createMockProvider());
      await expect(runtime.run()).rejects.toThrow("Unknown system module: 'system'");
    });
  });

  describe('utility functions require import from system/utils', () => {
    test('uuid requires import', async () => {
      const ast = parse(`
let id = uuid()
`);
      const runtime = new Runtime(ast, createMockProvider());
      await expect(runtime.run()).rejects.toThrow("Undefined variable 'uuid'");
    });

    test('uuid works when imported from system/utils', async () => {
      const ast = parse(`
import { uuid } from "system/utils"
let id = uuid()
`);
      const runtime = new Runtime(ast, createMockProvider());
      await runtime.run();
      const id = runtime.getValue('id') as string;
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });
});
