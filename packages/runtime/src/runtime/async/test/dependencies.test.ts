import { describe, expect, test } from 'bun:test';
import { parse } from '../../../parser/parse';
import type * as AST from '../../../ast';
import type { AsyncOperation } from '../../types';
import {
  getReferencedVariables,
  detectAsyncDependencies,
  buildExecutionWaves,
} from '../dependencies';

describe('Async Dependency Detection', () => {
  // Helper to extract expression from parsed code
  function parseExpr(code: string): AST.Expression {
    const ast = parse(`let x = ${code}`);
    const decl = ast.body[0] as AST.LetDeclaration;
    return decl.initializer!;
  }

  describe('getReferencedVariables', () => {
    test('extracts variable from identifier', () => {
      const expr = parseExpr('myVar');
      expect(getReferencedVariables(expr)).toEqual(['myVar']);
    });

    test('extracts no variables from plain string literal', () => {
      const expr = parseExpr('"hello"');
      expect(getReferencedVariables(expr)).toEqual([]);
    });

    test('extracts variables from string literal with {var} interpolation', () => {
      const expr = parseExpr('"Hello {name}!"');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('name');
    });

    test('extracts variables from string literal with !{var} expansion', () => {
      const expr = parseExpr('"Process this: !{data}"');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('data');
    });

    test('extracts multiple variables from string literal interpolation', () => {
      const expr = parseExpr('"Hello {greeting} {name}, your data is !{info}"');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('greeting');
      expect(vars).toContain('name');
      expect(vars).toContain('info');
    });

    test('extracts variables from single-quoted string with interpolation', () => {
      const expr = parseExpr("'User: {user}'");
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('user');
    });

    test('extracts no variables from number literal', () => {
      const expr = parseExpr('42');
      expect(getReferencedVariables(expr)).toEqual([]);
    });

    test('extracts variables from binary expression', () => {
      const expr = parseExpr('a + b');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('a');
      expect(vars).toContain('b');
    });

    test('extracts variables from nested binary expression', () => {
      const expr = parseExpr('a + b * c');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('a');
      expect(vars).toContain('b');
      expect(vars).toContain('c');
    });

    test('extracts variables from function call', () => {
      const expr = parseExpr('func(a, b)');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('func');
      expect(vars).toContain('a');
      expect(vars).toContain('b');
    });

    test('extracts variables from member expression', () => {
      const expr = parseExpr('obj.method');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('obj');
    });

    test('extracts variables from array literal', () => {
      const expr = parseExpr('[a, b, c]');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('a');
      expect(vars).toContain('b');
      expect(vars).toContain('c');
    });

    test('extracts variables from object literal', () => {
      const expr = parseExpr('{ key: value }');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('value');
    });

    test('extracts variables from template literal interpolation', () => {
      const expr = parseExpr('`hello {name}`');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('name');
    });

    test('extracts multiple variables from template literal', () => {
      const expr = parseExpr('`{greeting} {name}!`');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('greeting');
      expect(vars).toContain('name');
    });

    test('deduplicates repeated variables', () => {
      const expr = parseExpr('a + a + a');
      const vars = getReferencedVariables(expr);
      expect(vars).toEqual(['a']);
    });

    test('extracts variables from index expression', () => {
      const expr = parseExpr('arr[idx]');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('arr');
      expect(vars).toContain('idx');
    });

    test('extracts variables from unary expression', () => {
      const expr = parseExpr('not flag');
      const vars = getReferencedVariables(expr);
      expect(vars).toContain('flag');
    });
  });

  describe('detectAsyncDependencies', () => {
    test('returns empty array when no async operations', () => {
      const expr = parseExpr('a + b');
      const asyncVarToOpId = new Map<string, string>();
      const pendingAsyncIds = new Set<string>();

      expect(detectAsyncDependencies(expr, asyncVarToOpId, pendingAsyncIds)).toEqual([]);
    });

    test('detects single async dependency', () => {
      const expr = parseExpr('asyncResult + 1');
      const asyncVarToOpId = new Map([['asyncResult', 'async-001']]);
      const pendingAsyncIds = new Set(['async-001']);

      expect(detectAsyncDependencies(expr, asyncVarToOpId, pendingAsyncIds)).toEqual(['async-001']);
    });

    test('detects multiple async dependencies', () => {
      const expr = parseExpr('a + b');
      const asyncVarToOpId = new Map([
        ['a', 'async-001'],
        ['b', 'async-002'],
      ]);
      const pendingAsyncIds = new Set(['async-001', 'async-002']);

      const deps = detectAsyncDependencies(expr, asyncVarToOpId, pendingAsyncIds);
      expect(deps).toContain('async-001');
      expect(deps).toContain('async-002');
    });

    test('ignores completed async operations', () => {
      const expr = parseExpr('asyncResult + 1');
      const asyncVarToOpId = new Map([['asyncResult', 'async-001']]);
      const pendingAsyncIds = new Set<string>(); // async-001 not pending

      expect(detectAsyncDependencies(expr, asyncVarToOpId, pendingAsyncIds)).toEqual([]);
    });

    test('ignores non-async variables', () => {
      const expr = parseExpr('syncVar + asyncVar');
      const asyncVarToOpId = new Map([['asyncVar', 'async-001']]);
      const pendingAsyncIds = new Set(['async-001']);

      const deps = detectAsyncDependencies(expr, asyncVarToOpId, pendingAsyncIds);
      expect(deps).toEqual(['async-001']);
      expect(deps).not.toContain('syncVar');
    });
  });

  describe('buildExecutionWaves', () => {
    function createOp(id: string, varName: string | null, deps: string[]): AsyncOperation {
      return {
        id,
        variableName: varName,
        status: 'pending',
        operationType: 'do',
        dependencies: deps,
        contextSnapshot: [],
        waveId: 0,
      };
    }

    test('groups independent operations in same wave', () => {
      const ops = [
        createOp('async-001', 'a', []),
        createOp('async-002', 'b', []),
        createOp('async-003', 'c', []),
      ];

      const waves = buildExecutionWaves(ops, []);

      expect(waves.length).toBe(1);
      expect(waves[0].operationIds).toContain('async-001');
      expect(waves[0].operationIds).toContain('async-002');
      expect(waves[0].operationIds).toContain('async-003');
    });

    test('separates dependent operations into sequential waves', () => {
      const ops = [
        createOp('async-001', 'a', []),
        createOp('async-002', 'b', ['a']), // depends on a
      ];

      const waves = buildExecutionWaves(ops, []);

      expect(waves.length).toBe(2);
      expect(waves[0].operationIds).toEqual(['async-001']);
      expect(waves[1].operationIds).toEqual(['async-002']);
    });

    test('handles complex dependency graph', () => {
      // a, b run first (no deps)
      // c depends on a
      // d depends on b
      // e depends on c and d
      const ops = [
        createOp('async-001', 'a', []),
        createOp('async-002', 'b', []),
        createOp('async-003', 'c', ['a']),
        createOp('async-004', 'd', ['b']),
        createOp('async-005', 'e', ['c', 'd']),
      ];

      const waves = buildExecutionWaves(ops, []);

      expect(waves.length).toBe(3);
      // Wave 0: a, b
      expect(waves[0].operationIds).toContain('async-001');
      expect(waves[0].operationIds).toContain('async-002');
      // Wave 1: c, d
      expect(waves[1].operationIds).toContain('async-003');
      expect(waves[1].operationIds).toContain('async-004');
      // Wave 2: e
      expect(waves[2].operationIds).toEqual(['async-005']);
    });

    test('handles fire-and-forget operations (null variableName)', () => {
      const ops = [
        createOp('async-001', null, []),
        createOp('async-002', null, []),
      ];

      const waves = buildExecutionWaves(ops, []);

      expect(waves.length).toBe(1);
      expect(waves[0].operationIds.length).toBe(2);
    });

    test('assigns sequential wave IDs', () => {
      const ops = [
        createOp('async-001', 'a', []),
        createOp('async-002', 'b', ['a']),
        createOp('async-003', 'c', ['b']),
      ];

      const waves = buildExecutionWaves(ops, []);

      expect(waves[0].id).toBe(0);
      expect(waves[1].id).toBe(1);
      expect(waves[2].id).toBe(2);
    });

    test('preserves context snapshot in waves', () => {
      const ops = [createOp('async-001', 'a', [])];
      const context = [{ kind: 'variable' as const, name: 'x', value: 1, type: null, isConst: false, source: null, frameName: 'main', frameDepth: 0 }];

      const waves = buildExecutionWaves(ops, context);

      expect(waves[0].contextSnapshot).toEqual(context);
    });

    test('throws on circular dependency', () => {
      const ops = [
        createOp('async-001', 'a', ['b']),
        createOp('async-002', 'b', ['a']),
      ];

      expect(() => buildExecutionWaves(ops, [])).toThrow('Circular dependency');
    });

    test('handles dependency on non-async variable', () => {
      // If operation depends on a variable that's not an async operation,
      // it should still be able to run
      const ops = [
        createOp('async-001', 'a', ['syncVar']), // syncVar is not async
      ];

      const waves = buildExecutionWaves(ops, []);

      expect(waves.length).toBe(1);
      expect(waves[0].operationIds).toEqual(['async-001']);
    });
  });
});
