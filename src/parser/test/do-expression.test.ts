import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Do Expression', () => {
  // ============================================================================
  // Basic do expressions with all 3 arguments
  // ============================================================================

  test('do with string prompt and default context', () => {
    const ast = parse(`
do "what is 2+2" myModel default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'DoExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'what is 2+2',
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

  test('do with string prompt and local context', () => {
    const ast = parse(`
do "explain this" myModel local
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'DoExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'explain this',
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

  test('do with variable context', () => {
    const ast = parse(`
do "prompt" myModel myContext
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'DoExpression',
        context: {
          type: 'ContextSpecifier',
          kind: 'variable',
          variable: 'myContext',
        },
      },
    });
  });

  test('do with variable prompt', () => {
    const ast = parse(`
do promptVar myModel default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'DoExpression',
        prompt: {
          type: 'Identifier',
          name: 'promptVar',
        },
        model: {
          type: 'Identifier',
          name: 'myModel',
        },
      },
    });
  });

  // ============================================================================
  // Do in variable assignment
  // ============================================================================

  test('do result assigned to let', () => {
    const ast = parse(`
let result = do "what is AI" gptModel default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'result',
      initializer: {
        type: 'DoExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'what is AI',
        },
      },
    });
  });

  test('do result assigned to const', () => {
    const ast = parse(`
const answer = do "calculate sum" mathModel local
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'answer',
      initializer: {
        type: 'DoExpression',
      },
    });
  });

  // ============================================================================
  // Do with model declaration
  // ============================================================================

  test('model declaration followed by do', () => {
    const ast = parse(`
model gpt4 = {
  name: "gpt-4",
  apiUrl: "https://api.openai.com"
}

let response = do "hello world" gpt4 default
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0]).toMatchObject({
      type: 'ModelDeclaration',
      name: 'gpt4',
    });
    expect(ast.body[1]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'DoExpression',
        model: {
          type: 'Identifier',
          name: 'gpt4',
        },
      },
    });
  });

  // ============================================================================
  // Do in function body
  // ============================================================================

  test('do inside function', () => {
    const ast = parse(`
function askAI(question: text): text {
  return do question aiModel default
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'askAI',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'ReturnStatement',
            value: {
              type: 'DoExpression',
              prompt: {
                type: 'Identifier',
                name: 'question',
              },
            },
          },
        ],
      },
    });
  });
});

describe('Syntax Errors - Do Expression', () => {
  test('do missing model argument', () => {
    expect(() => parse(`
do "prompt" default
`)).toThrow();
  });

  test('do missing context argument', () => {
    expect(() => parse(`
do "prompt" myModel
`)).toThrow();
  });

  test('do with no arguments', () => {
    expect(() => parse(`
do
`)).toThrow();
  });

  test('do with only prompt', () => {
    expect(() => parse(`
let x = do "just a prompt"
`)).toThrow();
  });
});
