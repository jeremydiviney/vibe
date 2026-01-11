import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Destructuring Declarations', () => {
  // ============================================================================
  // Const destructuring
  // ============================================================================

  test('const destructuring with single field', () => {
    const ast = parse('const {name: text} = do "get name" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'DestructuringDeclaration',
      isConst: true,
      fields: [{ name: 'name', type: 'text' }],
      initializer: {
        type: 'VibeExpression',
        operationType: 'do',
      },
    });
  });

  test('const destructuring with multiple fields', () => {
    const ast = parse('const {name: text, age: number} = do "get info" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'DestructuringDeclaration',
      isConst: true,
      fields: [
        { name: 'name', type: 'text' },
        { name: 'age', type: 'number' },
      ],
      initializer: {
        type: 'VibeExpression',
        operationType: 'do',
      },
    });
  });

  test('const destructuring with three fields', () => {
    const ast = parse('const {valid: boolean, reason: text, score: number} = do "validate" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'DestructuringDeclaration',
      isConst: true,
      fields: [
        { name: 'valid', type: 'boolean' },
        { name: 'reason', type: 'text' },
        { name: 'score', type: 'number' },
      ],
    });
  });

  // ============================================================================
  // Let destructuring
  // ============================================================================

  test('let destructuring with single field', () => {
    const ast = parse('let {count: number} = do "get count" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'DestructuringDeclaration',
      isConst: false,
      fields: [{ name: 'count', type: 'number' }],
      initializer: {
        type: 'VibeExpression',
        operationType: 'do',
      },
    });
  });

  test('let destructuring with multiple fields', () => {
    const ast = parse('let {x: number, y: number} = do "get coords" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'DestructuringDeclaration',
      isConst: false,
      fields: [
        { name: 'x', type: 'number' },
        { name: 'y', type: 'number' },
      ],
    });
  });

  // ============================================================================
  // Various field types
  // ============================================================================

  test('destructuring with json type', () => {
    const ast = parse('const {data: json} = do "get data" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'DestructuringDeclaration',
      fields: [{ name: 'data', type: 'json' }],
    });
  });

  test('destructuring with array types', () => {
    const ast = parse('const {items: text[], counts: number[]} = do "get lists" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'DestructuringDeclaration',
      fields: [
        { name: 'items', type: 'text[]' },
        { name: 'counts', type: 'number[]' },
      ],
    });
  });

  test('destructuring with boolean array', () => {
    const ast = parse('const {flags: boolean[]} = do "get flags" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'DestructuringDeclaration',
      fields: [{ name: 'flags', type: 'boolean[]' }],
    });
  });

  test('destructuring with json array', () => {
    const ast = parse('const {users: json[]} = do "get users" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'DestructuringDeclaration',
      fields: [{ name: 'users', type: 'json[]' }],
    });
  });

  // ============================================================================
  // Mixed with regular declarations
  // ============================================================================

  test('destructuring followed by regular declaration', () => {
    const ast = parse(`
const {name: text} = do "get name" myModel
let x = 42
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0].type).toBe('DestructuringDeclaration');
    expect(ast.body[1].type).toBe('LetDeclaration');
  });

  test('regular declaration followed by destructuring', () => {
    const ast = parse(`
let x = 42
const {name: text} = do "get name" myModel
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0].type).toBe('LetDeclaration');
    expect(ast.body[1].type).toBe('DestructuringDeclaration');
  });

  // ============================================================================
  // Vibe expression types
  // ============================================================================

  test('destructuring with vibe expression', () => {
    const ast = parse('const {code: text} = vibe "generate code" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'DestructuringDeclaration',
      initializer: {
        type: 'VibeExpression',
        operationType: 'vibe',
      },
    });
  });
});
