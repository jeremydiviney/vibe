import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Type Annotations', () => {
  // ============================================================================
  // Let with type annotations
  // ============================================================================

  test('let with text type', () => {
    const ast = parse('let x: text = "hello"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      vibeType: 'text',
      initializer: {
        type: 'StringLiteral',
        value: 'hello',
      },
    });
  });

  test('let with json type', () => {
    const ast = parse('let x: json = "{\\"key\\": \\"value\\"}"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      vibeType: 'json',
      initializer: {
        type: 'StringLiteral',
      },
    });
  });

  test('let with text type no initializer', () => {
    const ast = parse('let x: text');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      vibeType: 'text',
      initializer: null,
    });
  });

  test('let with json type no initializer', () => {
    const ast = parse('let x: json');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      vibeType: 'json',
      initializer: null,
    });
  });

  test('let without type annotation (null)', () => {
    const ast = parse('let x = "hello"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      vibeType: null,
    });
  });

  // ============================================================================
  // Const with type annotations
  // ============================================================================

  test('const with text type', () => {
    const ast = parse('const x: text = "hello"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'x',
      vibeType: 'text',
      initializer: {
        type: 'StringLiteral',
        value: 'hello',
      },
    });
  });

  test('const with json type', () => {
    const ast = parse('const x: json = "[]"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'x',
      vibeType: 'json',
      initializer: {
        type: 'StringLiteral',
        value: '[]',
      },
    });
  });

  test('const without type annotation (null)', () => {
    const ast = parse('const x = "hello"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'x',
      vibeType: null,
    });
  });

  // ============================================================================
  // Prompt type annotation
  // ============================================================================

  test('let with prompt type', () => {
    const ast = parse('let x: prompt = "What is your name?"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      vibeType: 'prompt',
      initializer: {
        type: 'StringLiteral',
        value: 'What is your name?',
      },
    });
  });

  test('const with prompt type', () => {
    const ast = parse('const SYSTEM_PROMPT: prompt = "You are a helpful assistant"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'SYSTEM_PROMPT',
      vibeType: 'prompt',
      initializer: {
        type: 'StringLiteral',
        value: 'You are a helpful assistant',
      },
    });
  });

  test('let with prompt type no initializer', () => {
    const ast = parse('let x: prompt');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      vibeType: 'prompt',
      initializer: null,
    });
  });

  // ============================================================================
  // Array type annotations
  // ============================================================================

  test('let with text[] array type', () => {
    const ast = parse('let items: text[] = ["a", "b"]');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'items',
      vibeType: 'text[]',
      initializer: {
        type: 'ArrayLiteral',
        elements: [
          { type: 'StringLiteral', value: 'a' },
          { type: 'StringLiteral', value: 'b' },
        ],
      },
    });
  });

  test('let with boolean[] array type', () => {
    const ast = parse('let flags: boolean[] = [true, false]');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'flags',
      vibeType: 'boolean[]',
    });
  });

  test('let with nested text[][] array type', () => {
    const ast = parse('let matrix: text[][] = [["a"], ["b"]]');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'matrix',
      vibeType: 'text[][]',
    });
  });

  test('const with json[] array type', () => {
    const ast = parse('const items: json[] = [{}, {}]');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'items',
      vibeType: 'json[]',
    });
  });

  test('function with array parameter', () => {
    const ast = parse('function process(items: text[]) { return items }');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'process',
      params: [{ name: 'items', vibeType: 'text[]' }],
    });
  });

  test('function with array return type', () => {
    const ast = parse('function getItems(): text[] { return ["a"] }');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'getItems',
      returnType: 'text[]',
    });
  });

  test('function with nested array return type', () => {
    const ast = parse('function getMatrix(): boolean[][] { return [[true]] }');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'getMatrix',
      returnType: 'boolean[][]',
    });
  });

  test('function with model parameter type', () => {
    const ast = parse('function process(m: model): text { return "done" }');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'process',
      params: [{ name: 'm', vibeType: 'model' }],
      returnType: 'text',
    });
  });

  test('const declaration with model type', () => {
    const ast = parse('const myModel: model = undefined');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'myModel',
      vibeType: 'model',
    });
  });
});
