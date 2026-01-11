import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Template Literals', () => {
  test('basic template literal', () => {
    const ast = parse('let x = `hello`');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'TemplateLiteral',
        value: 'hello',
      },
    });
  });

  test('template literal with interpolation syntax preserved', () => {
    const ast = parse('let x = `hello ${name}`');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'TemplateLiteral',
        value: 'hello ${name}',
      },
    });
  });

  test('template literal multiline', () => {
    const ast = parse(`let x = \`line1
line2\``);
    expect(ast.body).toHaveLength(1);
    const init = (ast.body[0] as any).initializer;
    expect(init.type).toBe('TemplateLiteral');
    expect(init.value).toBe('line1\nline2');
  });

  test('template literal with escape sequences', () => {
    // Note: Current escape handling just removes the backslash
    // Full JS-style escape handling (\\n → newline) could be added later
    const ast = parse('let x = `hello\\nworld`');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'TemplateLiteral',
        value: 'hellonworld',
      },
    });
  });

  test('template literal with escaped backtick', () => {
    const ast = parse('let x = `hello\\`world`');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'TemplateLiteral',
        value: 'hello`world',
      },
    });
  });

  test('template literal in const declaration', () => {
    const ast = parse('const msg = `hello world`');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'msg',
      initializer: {
        type: 'TemplateLiteral',
        value: 'hello world',
      },
    });
  });

  test('template literal in function return', () => {
    const ast = parse(`
      function greet() {
        return \`hello\`
      }
    `);
    const func = ast.body[0] as any;
    const returnStmt = func.body.body[0];
    expect(returnStmt.type).toBe('ReturnStatement');
    expect(returnStmt.value.type).toBe('TemplateLiteral');
    expect(returnStmt.value.value).toBe('hello');
  });

  test('template literal as function argument', () => {
    const ast = parse('myFunc(`hello ${name}`)');
    const call = (ast.body[0] as any).expression;
    expect(call.type).toBe('CallExpression');
    expect(call.arguments[0].type).toBe('TemplateLiteral');
    expect(call.arguments[0].value).toBe('hello ${name}');
  });

  test('template literal with multiple interpolations', () => {
    const ast = parse('let x = `${greeting}, ${name}!`');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'TemplateLiteral',
        value: '${greeting}, ${name}!',
      },
    });
  });

  test('empty template literal', () => {
    const ast = parse('let x = ``');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'TemplateLiteral',
        value: '',
      },
    });
  });
});
