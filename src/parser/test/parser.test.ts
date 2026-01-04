import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Single Statements', () => {
  // ============================================================================
  // Let Declaration
  // ============================================================================

  test('let without initializer', () => {
    const ast = parse('let x');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: null,
    });
  });

  test('let with string initializer', () => {
    const ast = parse('let x = "hello"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'StringLiteral',
        value: 'hello',
      },
    });
  });

  test('let with identifier initializer', () => {
    const ast = parse('let x = y');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'Identifier',
        name: 'y',
      },
    });
  });

  // ============================================================================
  // Const Declaration
  // ============================================================================

  test('const with string initializer', () => {
    const ast = parse('const x = "hello"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'x',
      initializer: {
        type: 'StringLiteral',
        value: 'hello',
      },
    });
  });

  // ============================================================================
  // Function Declaration
  // ============================================================================

  test('function with no params', () => {
    const ast = parse(`
function myFunc() {
  return "hello"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'myFunc',
      params: [],
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'ReturnStatement',
            value: {
              type: 'StringLiteral',
              value: 'hello',
            },
          },
        ],
      },
    });
  });

  test('function with one param', () => {
    const ast = parse(`
function greet(name: text): text {
  return name
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'greet',
      params: [{ name: 'name', typeAnnotation: 'text' }],
      returnType: 'text',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'ReturnStatement',
            value: {
              type: 'Identifier',
              name: 'name',
            },
          },
        ],
      },
    });
  });

  test('function with multiple params', () => {
    const ast = parse(`
function add(a: text, b: text, c: text): text {
  return a
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'add',
      params: [
        { name: 'a', typeAnnotation: 'text' },
        { name: 'b', typeAnnotation: 'text' },
        { name: 'c', typeAnnotation: 'text' },
      ],
      returnType: 'text',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'ReturnStatement',
            value: {
              type: 'Identifier',
              name: 'a',
            },
          },
        ],
      },
    });
  });

  // ============================================================================
  // Return Statement
  // ============================================================================

  test('return without value', () => {
    const ast = parse(`
function test() {
  return
}
`);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'test',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'ReturnStatement',
            value: null,
          },
        ],
      },
    });
  });

  test('return with value', () => {
    const ast = parse(`
function test() {
  return "hello"
}
`);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'test',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'ReturnStatement',
            value: {
              type: 'StringLiteral',
              value: 'hello',
            },
          },
        ],
      },
    });
  });

  // ============================================================================
  // If Statement
  // ============================================================================

  test('if without else', () => {
    const ast = parse(`
if x {
  let y = "yes"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'IfStatement',
      condition: {
        type: 'Identifier',
        name: 'x',
      },
      consequent: {
        type: 'BlockStatement',
        body: [
          {
            type: 'LetDeclaration',
            name: 'y',
            initializer: {
              type: 'StringLiteral',
              value: 'yes',
            },
          },
        ],
      },
      alternate: null,
    });
  });

  test('if with else', () => {
    const ast = parse(`
if x {
  let y = "yes"
} else {
  let n = "no"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'IfStatement',
      condition: {
        type: 'Identifier',
        name: 'x',
      },
      consequent: {
        type: 'BlockStatement',
        body: [
          {
            type: 'LetDeclaration',
            name: 'y',
            initializer: {
              type: 'StringLiteral',
              value: 'yes',
            },
          },
        ],
      },
      alternate: {
        type: 'BlockStatement',
        body: [
          {
            type: 'LetDeclaration',
            name: 'n',
            initializer: {
              type: 'StringLiteral',
              value: 'no',
            },
          },
        ],
      },
    });
  });

  test('if with else if', () => {
    const ast = parse(`
if x {
  let a = "a"
} else if y {
  let b = "b"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'IfStatement',
      condition: {
        type: 'Identifier',
        name: 'x',
      },
      consequent: {
        type: 'BlockStatement',
        body: [
          {
            type: 'LetDeclaration',
            name: 'a',
            initializer: {
              type: 'StringLiteral',
              value: 'a',
            },
          },
        ],
      },
      alternate: {
        type: 'IfStatement',
        condition: {
          type: 'Identifier',
          name: 'y',
        },
        consequent: {
          type: 'BlockStatement',
          body: [
            {
              type: 'LetDeclaration',
              name: 'b',
              initializer: {
                type: 'StringLiteral',
                value: 'b',
              },
            },
          ],
        },
        alternate: null,
      },
    });
  });

  // ============================================================================
  // While Loop
  // ============================================================================

  test('while statement', () => {
    const ast = parse(`
while keepGoing {
  let x = 1
}
`);
    expect(ast.body[0]).toMatchObject({
      type: 'WhileStatement',
      condition: {
        type: 'Identifier',
        name: 'keepGoing',
      },
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'LetDeclaration',
            name: 'x',
          },
        ],
      },
    });
  });

  // ============================================================================
  // Block Statement
  // ============================================================================

  test('empty block', () => {
    const ast = parse('{ }');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'BlockStatement',
      body: [],
    });
  });

  test('block with statements', () => {
    const ast = parse(`
{
  let x = "a"
  let y = "b"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'BlockStatement',
      body: [
        {
          type: 'LetDeclaration',
          name: 'x',
          initializer: {
            type: 'StringLiteral',
            value: 'a',
          },
        },
        {
          type: 'LetDeclaration',
          name: 'y',
          initializer: {
            type: 'StringLiteral',
            value: 'b',
          },
        },
      ],
    });
  });

  // ============================================================================
  // Do Expression
  // ============================================================================

  test('do with string', () => {
    const ast = parse('let x = do "what is 2+2?" myModel default');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'DoExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'what is 2+2?',
        },
        model: {
          type: 'Identifier',
          name: 'myModel',
        },
        context: {
          type: 'ContextSpecifier',
          kind: 'default',
        },
      },
    });
  });

  test('do with identifier', () => {
    const ast = parse('let x = do message myModel local');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'DoExpression',
        prompt: {
          type: 'Identifier',
          name: 'message',
        },
        model: {
          type: 'Identifier',
          name: 'myModel',
        },
        context: {
          type: 'ContextSpecifier',
          kind: 'local',
        },
      },
    });
  });

  // ============================================================================
  // Vibe Expression
  // ============================================================================

  test('vibe with string and model', () => {
    const ast = parse('let x = vibe "generate a hello function" myModel');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'VibeExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'generate a hello function',
        },
        model: {
          type: 'Identifier',
          name: 'myModel',
        },
        cached: false,
      },
    });
  });

  test('vibe with cache keyword', () => {
    const ast = parse('let x = vibe "generate code" coder cache');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'VibeExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'generate code',
        },
        model: {
          type: 'Identifier',
          name: 'coder',
        },
        cached: true,
      },
    });
  });

  // ============================================================================
  // Call Expression
  // ============================================================================

  test('call with no args', () => {
    const ast = parse('myFunc()');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: 'myFunc',
        },
        arguments: [],
      },
    });
  });

  test('call with one arg', () => {
    const ast = parse('greet("world")');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: 'greet',
        },
        arguments: [
          {
            type: 'StringLiteral',
            value: 'world',
          },
        ],
      },
    });
  });

  test('call with multiple args', () => {
    const ast = parse('combine("a", "b", "c")');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: 'combine',
        },
        arguments: [
          {
            type: 'StringLiteral',
            value: 'a',
          },
          {
            type: 'StringLiteral',
            value: 'b',
          },
          {
            type: 'StringLiteral',
            value: 'c',
          },
        ],
      },
    });
  });

  test('chained calls', () => {
    const ast = parse('a()()');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: 'a',
          },
          arguments: [],
        },
        arguments: [],
      },
    });
  });

  // ============================================================================
  // String Literal
  // ============================================================================

  test('double quoted string', () => {
    const ast = parse('let x = "hello"');
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'StringLiteral',
        value: 'hello',
      },
    });
  });

  test('single quoted string', () => {
    const ast = parse("let x = 'hello'");
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'StringLiteral',
        value: 'hello',
      },
    });
  });

  test('string with escaped quote', () => {
    const ast = parse('let x = "say \\"hello\\""');
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'StringLiteral',
        value: 'say "hello"',
      },
    });
  });

  // ============================================================================
  // Boolean Literal
  // ============================================================================

  test('true literal', () => {
    const ast = parse('let x = true');
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'BooleanLiteral',
        value: true,
      },
    });
  });

  test('false literal', () => {
    const ast = parse('let x = false');
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'BooleanLiteral',
        value: false,
      },
    });
  });

  test('boolean as expression statement', () => {
    const ast = parse('true');
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'BooleanLiteral',
        value: true,
      },
    });
  });

  // ============================================================================
  // Identifier
  // ============================================================================

  test('simple identifier', () => {
    const ast = parse('x');
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'Identifier',
        name: 'x',
      },
    });
  });

  test('identifier with underscore', () => {
    const ast = parse('my_var');
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'Identifier',
        name: 'my_var',
      },
    });
  });

  test('identifier with numbers', () => {
    const ast = parse('var123');
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'Identifier',
        name: 'var123',
      },
    });
  });

  // ============================================================================
  // Comments
  // ============================================================================

  test('line comment is ignored', () => {
    const ast = parse(`
// this is a comment
let x = "hello"
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'StringLiteral',
        value: 'hello',
      },
    });
  });

  test('block comment is ignored', () => {
    const ast = parse('/* block comment */ let x = "hello"');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'StringLiteral',
        value: 'hello',
      },
    });
  });
});
