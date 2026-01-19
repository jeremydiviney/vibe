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

  test('json type rejects array literal (use json[])', async () => {
    const runtime = createRuntime('let x: json = ["a", "b"]');
    await expect(runtime.run()).rejects.toThrow('json type expects an object, not an array');
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

  // ============================================================================
  // Array Concatenation
  // ============================================================================

  test('array concatenation with +', async () => {
    const runtime = createRuntime(`
      let a = [1, 2]
      let b = [3, 4]
      let c = a + b
    `);
    await runtime.run();
    expect(runtime.getValue('c')).toEqual([1, 2, 3, 4]);
  });

  test('concatenate empty arrays', async () => {
    const runtime = createRuntime(`
      let a = []
      let b = []
      let c = a + b
    `);
    await runtime.run();
    expect(runtime.getValue('c')).toEqual([]);
  });

  test('concatenate with empty array', async () => {
    const runtime = createRuntime(`
      let a = [1, 2, 3]
      let b = []
      let c = a + b
    `);
    await runtime.run();
    expect(runtime.getValue('c')).toEqual([1, 2, 3]);
  });

  test('concatenate array literals directly', async () => {
    const runtime = createRuntime('let x = [1] + [2, 3]');
    await runtime.run();
    expect(runtime.getValue('x')).toEqual([1, 2, 3]);
  });

  test('chain multiple array concatenations', async () => {
    const runtime = createRuntime(`
      let a = [1]
      let b = [2]
      let c = [3]
      let result = a + b + c
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toEqual([1, 2, 3]);
  });

  test('concatenate arrays of objects', async () => {
    const runtime = createRuntime(`
      let a = [{name: "alice"}]
      let b = [{name: "bob"}]
      let c = a + b
    `);
    await runtime.run();
    expect(runtime.getValue('c')).toEqual([{ name: 'alice' }, { name: 'bob' }]);
  });

  test('concatenate string arrays', async () => {
    const runtime = createRuntime(`
      let a = ["hello"]
      let b = ["world"]
      let c = a + b
    `);
    await runtime.run();
    expect(runtime.getValue('c')).toEqual(['hello', 'world']);
  });

  test('original arrays unchanged after concatenation', async () => {
    const runtime = createRuntime(`
      let a = [1, 2]
      let b = [3, 4]
      let c = a + b
    `);
    await runtime.run();
    expect(runtime.getValue('a')).toEqual([1, 2]);
    expect(runtime.getValue('b')).toEqual([3, 4]);
    expect(runtime.getValue('c')).toEqual([1, 2, 3, 4]);
  });

  test('concatenate two array slices', async () => {
    const runtime = createRuntime(`
      let arr = [1, 2, 3, 4, 5]
      let result = arr[0:2] + arr[3:5]
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toEqual([1, 2, 4, 5]);
  });

  test('concatenate array literal with slice', async () => {
    const runtime = createRuntime(`
      let arr = [1, 2, 3, 4, 5]
      let result = [0] + arr[1:3]
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toEqual([0, 2, 3]);
  });

  test('concatenate slice with array literal', async () => {
    const runtime = createRuntime(`
      let arr = [1, 2, 3, 4, 5]
      let result = arr[2:4] + [6, 7]
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toEqual([3, 4, 6, 7]);
  });

  test('concatenate slice with variable array', async () => {
    const runtime = createRuntime(`
      let arr = [1, 2, 3, 4, 5]
      let suffix = [10, 11]
      let result = arr[0:2] + suffix
    `);
    await runtime.run();
    expect(runtime.getValue('result')).toEqual([1, 2, 10, 11]);
  });
});
