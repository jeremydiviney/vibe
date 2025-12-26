import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - TypeScript Blocks', () => {
  // ============================================================================
  // Basic ts block syntax
  // ============================================================================

  test('simple ts block with no params', () => {
    const ast = parse('let x = ts() { return 42 }');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'TsBlock',
        params: [],
        body: ' return 42 ',
      },
    });
  });

  test('ts block with one param', () => {
    const ast = parse('let doubled = ts(x) { return x * 2 }');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'doubled',
      initializer: {
        type: 'TsBlock',
        params: ['x'],
        body: ' return x * 2 ',
      },
    });
  });

  test('ts block with multiple params', () => {
    const ast = parse('let sum = ts(a, b, c) { return a + b + c }');
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.type).toBe('TsBlock');
    expect(tsBlock.params).toEqual(['a', 'b', 'c']);
    expect(tsBlock.body).toContain('return a + b + c');
  });

  // ============================================================================
  // Multi-line ts blocks
  // ============================================================================

  test('multi-line ts block', () => {
    const ast = parse(`let result = ts(data) {
  const parsed = JSON.parse(data)
  const filtered = parsed.filter(x => x > 0)
  return filtered.length
}`);
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.type).toBe('TsBlock');
    expect(tsBlock.params).toEqual(['data']);
    expect(tsBlock.body).toContain('JSON.parse(data)');
    expect(tsBlock.body).toContain('filtered.length');
  });

  // ============================================================================
  // Nested braces in ts block
  // ============================================================================

  test('ts block with nested braces (object literal)', () => {
    const ast = parse('let obj = ts(name) { return { name: name, id: 123 } }');
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.type).toBe('TsBlock');
    expect(tsBlock.body).toContain('{ name: name, id: 123 }');
  });

  test('ts block with nested braces (if statement)', () => {
    const ast = parse('let result = ts(x) { if (x > 0) { return x } else { return -x } }');
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.type).toBe('TsBlock');
    expect(tsBlock.body).toContain('if (x > 0)');
    expect(tsBlock.body).toContain('return x');
    expect(tsBlock.body).toContain('return -x');
  });

  test('ts block with arrow function', () => {
    const ast = parse('let mapped = ts(items) { return items.map(x => x * 2) }');
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.type).toBe('TsBlock');
    expect(tsBlock.body).toContain('items.map(x => x * 2)');
  });

  // ============================================================================
  // Strings inside ts block
  // ============================================================================

  test('ts block with single-quoted string', () => {
    const ast = parse(`let greeting = ts(name) { return 'Hello, ' + name }`);
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.type).toBe('TsBlock');
    expect(tsBlock.body).toContain("'Hello, '");
  });

  test('ts block with double-quoted string', () => {
    const ast = parse('let greeting = ts(name) { return "Hello, " + name }');
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.body).toContain('"Hello, "');
  });

  test('ts block with template literal', () => {
    const ast = parse('let greeting = ts(name) { return `Hello, ${name}!` }');
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.body).toContain('`Hello, ${name}!`');
  });

  test('ts block with string containing braces', () => {
    const ast = parse('let jsonStr = ts() { return "{ key: value }" }');
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.type).toBe('TsBlock');
    // The braces inside the string should not confuse the parser
    expect(tsBlock.body).toContain('"{ key: value }"');
  });

  // ============================================================================
  // Comments inside ts block
  // ============================================================================

  test('ts block with line comment', () => {
    const ast = parse(`let x = ts(n) {
  // Double the value
  return n * 2
}`);
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.type).toBe('TsBlock');
    expect(tsBlock.body).toContain('// Double the value');
  });

  test('ts block with block comment', () => {
    const ast = parse(`let x = ts(n) {
  /* Multiply by two */
  return n * 2
}`);
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.type).toBe('TsBlock');
    expect(tsBlock.body).toContain('/* Multiply by two */');
  });

  // ============================================================================
  // ts block in different contexts
  // ============================================================================

  test('ts block in const declaration', () => {
    const ast = parse('const add = ts(a, b) { return a + b }');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'add',
      initializer: {
        type: 'TsBlock',
        params: ['a', 'b'],
      },
    });
  });

  test('ts block as expression statement', () => {
    const ast = parse('ts(x) { console.log(x) }');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'TsBlock',
        params: ['x'],
      },
    });
  });

  test('ts block in function body', () => {
    const ast = parse(`
      function double(n: text): text {
        let result = ts(n) { return n * 2 }
        return result
      }
    `);
    expect(ast.body).toHaveLength(1);
    const func = ast.body[0] as any;
    expect(func.type).toBe('FunctionDeclaration');
    const letDecl = func.body.body[0];
    expect(letDecl.initializer.type).toBe('TsBlock');
  });

  // ============================================================================
  // ts block with whitespace variations
  // ============================================================================

  test('ts block with extra whitespace', () => {
    const ast = parse('let x = ts(  a  ,  b  ) {  return a + b  }');
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.params).toEqual(['a', 'b']);
  });

  test('ts block with newline before body', () => {
    const ast = parse(`let x = ts(a, b)
    { return a + b }`);
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.type).toBe('TsBlock');
    expect(tsBlock.params).toEqual(['a', 'b']);
  });

  // ============================================================================
  // Edge cases
  // ============================================================================

  test('ts is not a reserved word by itself', () => {
    // 'ts' followed by something other than '(' should be an identifier
    const ast = parse('let ts = "typescript"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'ts',
      initializer: {
        type: 'StringLiteral',
        value: 'typescript',
      },
    });
  });

  test('multiple ts blocks in same program', () => {
    const ast = parse(`
      let add = ts(a, b) { return a + b }
      let mul = ts(a, b) { return a * b }
    `);
    expect(ast.body).toHaveLength(2);
    expect((ast.body[0] as any).initializer.type).toBe('TsBlock');
    expect((ast.body[1] as any).initializer.type).toBe('TsBlock');
  });

  test('ts block with async/await', () => {
    const ast = parse('let data = ts(url) { return await fetch(url).then(r => r.json()) }');
    expect(ast.body).toHaveLength(1);
    const tsBlock = (ast.body[0] as any).initializer;
    expect(tsBlock.body).toContain('await fetch(url)');
  });
});
