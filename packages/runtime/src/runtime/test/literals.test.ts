import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, type AIProvider } from '../index';

describe('Runtime - Object and Array Literals', () => {
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
  // Object Literals
  // ============================================================================

  test('empty object literal', async () => {
    const runtime = createRuntime('let x = {}');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({});
  });

  test('object literal with properties', async () => {
    const runtime = createRuntime('let x = {name: "test", active: true}');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ name: 'test', active: true });
  });

  test('nested object literal', async () => {
    const runtime = createRuntime('let x = {user: {name: "alice", role: "admin"}}');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({
      user: { name: 'alice', role: 'admin' },
    });
  });

  test('object literal with variable reference', async () => {
    const runtime = createRuntime(`
      let name = "test"
      let x = {title: name}
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ title: 'test' });
  });

  // ============================================================================
  // Array Literals
  // ============================================================================

  test('empty array literal', async () => {
    const runtime = createRuntime('let x = []');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual([]);
  });

  test('array literal with elements', async () => {
    const runtime = createRuntime('let x = ["a", "b", "c"]');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual(['a', 'b', 'c']);
  });

  test('array literal with mixed types', async () => {
    const runtime = createRuntime('let x = ["text", true, false]');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual(['text', true, false]);
  });

  test('nested array literal', async () => {
    const runtime = createRuntime('let x = [["a"], ["b", "c"]]');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual([['a'], ['b', 'c']]);
  });

  test('array literal with variable reference', async () => {
    const runtime = createRuntime(`
      let item = "first"
      let x = [item, "second"]
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual(['first', 'second']);
  });

  // ============================================================================
  // Combined
  // ============================================================================

  test('array of objects', async () => {
    const runtime = createRuntime('let x = [{name: "alice"}, {name: "bob"}]');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual([
      { name: 'alice' },
      { name: 'bob' },
    ]);
  });

  test('object with array property', async () => {
    const runtime = createRuntime('let x = {items: ["a", "b"], count: "2"}');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({
      items: ['a', 'b'],
      count: '2',
    });
  });

  // ============================================================================
  // With json type annotation
  // ============================================================================

  test('json type with object literal', async () => {
    const runtime = createRuntime('let x: json = {name: "test"}');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({ name: 'test' });
  });

  test('json type with array literal', async () => {
    const runtime = createRuntime('let x: json = ["a", "b"]');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual(['a', 'b']);
  });

  test('json type with complex nested structure', async () => {
    const runtime = createRuntime(`
      let x: json = {
        users: [
          {name: "alice", roles: ["admin", "user"]},
          {name: "bob", roles: ["user"]}
        ],
        meta: {version: "1"}
      }
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({
      users: [
        { name: 'alice', roles: ['admin', 'user'] },
        { name: 'bob', roles: ['user'] },
      ],
      meta: { version: '1' },
    });
  });

  test('const json with object literal', async () => {
    const runtime = createRuntime('const config: json = {debug: true}');
    await runtime.run();
    expect(runtime.getValue('config')).toEqual({ debug: true });
  });

  // ============================================================================
  // Deep nesting (2+ levels)
  // ============================================================================

  test('3-level nested objects', async () => {
    const runtime = createRuntime(`
      let x = {
        level1: {
          level2: {
            level3: "deep"
          }
        }
      }
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({
      level1: { level2: { level3: 'deep' } },
    });
  });

  test('3-level nested arrays', async () => {
    const runtime = createRuntime('let x = [[["a", "b"], ["c"]], [["d"]]]');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual([[['a', 'b'], ['c']], [['d']]]);
  });

  test('objects inside arrays inside objects', async () => {
    const runtime = createRuntime(`
      let x = {
        groups: [
          {
            members: [
              {name: "alice"},
              {name: "bob"}
            ]
          },
          {
            members: [
              {name: "charlie"}
            ]
          }
        ]
      }
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({
      groups: [
        { members: [{ name: 'alice' }, { name: 'bob' }] },
        { members: [{ name: 'charlie' }] },
      ],
    });
  });

  test('arrays inside objects inside arrays', async () => {
    const runtime = createRuntime(`
      let x = [
        {tags: ["a", "b"], scores: ["1", "2"]},
        {tags: ["c"], scores: ["3", "4", "5"]}
      ]
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual([
      { tags: ['a', 'b'], scores: ['1', '2'] },
      { tags: ['c'], scores: ['3', '4', '5'] },
    ]);
  });

  test('mixed deep nesting with variables', async () => {
    const runtime = createRuntime(`
      let name = "test"
      let x = {
        config: {
          items: [
            {label: name, values: ["v1", "v2"]}
          ]
        }
      }
    `);
    await runtime.run();
    expect(runtime.getValue('x')).toEqual({
      config: {
        items: [{ label: 'test', values: ['v1', 'v2'] }],
      },
    });
  });

  test('4-level deep structure', async () => {
    const runtime = createRuntime(`
      let x = {
        a: {
          b: {
            c: {
              d: "four levels"
            }
          }
        }
      }
    `);
    await runtime.run();
    const val = runtime.getValue('x') as any;
    expect(val.a.b.c.d).toBe('four levels');
  });
});
