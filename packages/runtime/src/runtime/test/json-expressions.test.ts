import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, type AIProvider } from '../index';

describe('Runtime - JSON Objects with Expressions', () => {
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
  // JSON with ts() expressions
  // ============================================================================

  test('json object with ts() expression value', async () => {
    const runtime = createRuntime(`
let obj:json = {
  key: ts() { return "computed-value"; }
}
`);
    await runtime.run();
    expect(runtime.getValue('obj')).toEqual({ key: 'computed-value' });
  });

  test('json object with multiple ts() expression values', async () => {
    const runtime = createRuntime(`
let obj:json = {
  a: ts() { return "value-a"; },
  b: ts() { return "value-b"; },
  c: "literal"
}
`);
    await runtime.run();
    expect(runtime.getValue('obj')).toEqual({
      a: 'value-a',
      b: 'value-b',
      c: 'literal',
    });
  });

  test('nested json with ts() expression', async () => {
    const runtime = createRuntime(`
let obj:json = {
  outer: {
    inner: ts() { return "nested-computed"; }
  }
}
`);
    await runtime.run();
    expect(runtime.getValue('obj')).toEqual({
      outer: { inner: 'nested-computed' },
    });
  });

  // ============================================================================
  // JSON with env() function calls
  // ============================================================================

  test('json object with env() function call', async () => {
    process.env.TEST_JSON_VAR = 'env-value';

    const runtime = createRuntime(`
import { env } from "system"

let obj:json = {
  fromEnv: env("TEST_JSON_VAR")
}
`);
    await runtime.run();
    expect(runtime.getValue('obj')).toEqual({ fromEnv: 'env-value' });

    delete process.env.TEST_JSON_VAR;
  });

  test('json object with env() and default value', async () => {
    const runtime = createRuntime(`
import { env } from "system"

let obj:json = {
  value: env("NONEXISTENT_VAR", "default-value")
}
`);
    await runtime.run();
    expect(runtime.getValue('obj')).toEqual({ value: 'default-value' });
  });

  // ============================================================================
  // JSON with vibe function calls
  // ============================================================================

  test('json object with vibe function call', async () => {
    const runtime = createRuntime(`
function getValue(): text {
  return "from-function"
}

let obj:json = {
  key: getValue()
}
`);
    await runtime.run();
    expect(runtime.getValue('obj')).toEqual({ key: 'from-function' });
  });

  test('json object with parameterized function call', async () => {
    const runtime = createRuntime(`
function format(prefix: text, value: text): text {
  return ts(prefix, value) { return prefix + "-" + value; }
}

let obj:json = {
  formatted: format("pre", "val")
}
`);
    await runtime.run();
    expect(runtime.getValue('obj')).toEqual({ formatted: 'pre-val' });
  });

  // ============================================================================
  // JSON arrays with expressions
  // ============================================================================

  test('json array with ts() expression elements', async () => {
    const runtime = createRuntime(`
let arr:json = [
  ts() { return "first"; },
  "literal",
  ts() { return "third"; }
]
`);
    await runtime.run();
    expect(runtime.getValue('arr')).toEqual(['first', 'literal', 'third']);
  });

  test('json array with function call elements', async () => {
    const runtime = createRuntime(`
function item(n: number): text {
  return ts(n) { return "item-" + n; }
}

let arr:json = [item(1), item(2), item(3)]
`);
    await runtime.run();
    expect(runtime.getValue('arr')).toEqual(['item-1', 'item-2', 'item-3']);
  });

  // ============================================================================
  // Mixed scenarios
  // ============================================================================

  test('json with variable references and expressions', async () => {
    const runtime = createRuntime(`
let prefix = "hello"

let obj:json = {
  static: prefix,
  computed: ts(prefix) { return prefix.toUpperCase(); }
}
`);
    await runtime.run();
    expect(runtime.getValue('obj')).toEqual({
      static: 'hello',
      computed: 'HELLO',
    });
  });

  test('complex nested json with mixed expressions', async () => {
    process.env.TEST_NESTED_VAR = 'from-env';

    const runtime = createRuntime(`
import { env } from "system"

function getVersion(): text {
  return "1.0.0"
}

let config:json = {
  meta: {
    version: getVersion(),
    env: env("TEST_NESTED_VAR")
  },
  computed: ts() { return 42; },
  literal: "plain"
}
`);
    await runtime.run();
    expect(runtime.getValue('config')).toEqual({
      meta: {
        version: '1.0.0',
        env: 'from-env',
      },
      computed: 42,
      literal: 'plain',
    });

    delete process.env.TEST_NESTED_VAR;
  });

  test('deeply nested object with env() at leaf level', async () => {
    process.env.DEEP_SECRET = 'secret-value';

    const runtime = createRuntime(`
import { env } from "system"

let config:json = {
  level1: {
    level2: {
      level3: {
        secret: env("DEEP_SECRET"),
        computed: ts() { return "deep-computed"; }
      }
    }
  }
}
`);
    await runtime.run();
    expect(runtime.getValue('config')).toEqual({
      level1: {
        level2: {
          level3: {
            secret: 'secret-value',
            computed: 'deep-computed',
          },
        },
      },
    });

    delete process.env.DEEP_SECRET;
  });
});
