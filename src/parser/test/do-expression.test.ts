import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Vibe Expression', () => {
  // ============================================================================
  // Basic vibe expressions with all 3 arguments
  // ============================================================================

  test('vibe with string prompt and default context', () => {
    const ast = parse(`
vibe "what is 2+2" myModel default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'VibeExpression',
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

  test('vibe with string prompt and local context', () => {
    const ast = parse(`
vibe "explain this" myModel local
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'VibeExpression',
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

  test('vibe with variable context', () => {
    const ast = parse(`
vibe "prompt" myModel myContext
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'VibeExpression',
        context: {
          type: 'ContextSpecifier',
          kind: 'variable',
          variable: 'myContext',
        },
      },
    });
  });

  test('vibe with variable prompt', () => {
    const ast = parse(`
vibe promptVar myModel default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'VibeExpression',
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

  test('vibe result assigned to let', () => {
    const ast = parse(`
let result = vibe "what is AI" gptModel default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'result',
      initializer: {
        type: 'VibeExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'what is AI',
        },
      },
    });
  });

  test('vibe result assigned to const', () => {
    const ast = parse(`
const answer = vibe "calculate sum" mathModel local
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'answer',
      initializer: {
        type: 'VibeExpression',
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

let response = vibe "hello world" gpt4 default
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0]).toMatchObject({
      type: 'ModelDeclaration',
      name: 'gpt4',
    });
    expect(ast.body[1]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'VibeExpression',
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

  test('vibe inside function', () => {
    const ast = parse(`
function askAI(question: text): text {
  return vibe question aiModel default
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
              type: 'VibeExpression',
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

describe('Syntax Errors - Vibe Expression', () => {
  test('vibe missing model argument', () => {
    expect(() => parse(`
vibe "prompt" default
`)).toThrow();
  });

  test('vibe missing context argument', () => {
    expect(() => parse(`
vibe "prompt" myModel
`)).toThrow();
  });

  test('vibe with no arguments', () => {
    expect(() => parse(`
do
`)).toThrow();
  });

  test('vibe with only prompt', () => {
    expect(() => parse(`
let x = vibe "just a prompt"
`)).toThrow();
  });
});
