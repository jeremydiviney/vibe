import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Ask Expression', () => {
  // ============================================================================
  // Basic ask expressions
  // ============================================================================

  test('ask with string literal', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let name = ask "What is your name?" myModel default
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[1]).toMatchObject({
      type: 'LetDeclaration',
      name: 'name',
      initializer: {
        type: 'AskExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'What is your name?',
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

  test('ask with variable prompt', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let question = "How old are you?"
let answer = ask question myModel default
`);
    expect(ast.body).toHaveLength(3);
    expect(ast.body[2]).toMatchObject({
      type: 'LetDeclaration',
      name: 'answer',
      initializer: {
        type: 'AskExpression',
        prompt: {
          type: 'Identifier',
          name: 'question',
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

  test('ask with string interpolation', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let name = "Alice"
let response = ask "Hello {name}, what do you want?" myModel default
`);
    expect(ast.body).toHaveLength(3);
    expect(ast.body[2]).toMatchObject({
      type: 'LetDeclaration',
      name: 'response',
      initializer: {
        type: 'AskExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'Hello {name}, what do you want?',
        },
      },
    });
  });

  // ============================================================================
  // Ask with different context specifiers
  // ============================================================================

  test('ask with local context', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = ask "Question?" myModel local
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[1]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'AskExpression',
        context: {
          type: 'ContextSpecifier',
          kind: 'local',
        },
      },
    });
  });

  test('ask with variable context', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let myContext = "some context"
let x = ask "Question?" myModel myContext
`);
    expect(ast.body).toHaveLength(3);
    expect(ast.body[2]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'AskExpression',
        context: {
          type: 'ContextSpecifier',
          kind: 'variable',
          variable: 'myContext',
        },
      },
    });
  });

  // ============================================================================
  // Ask in different contexts
  // ============================================================================

  test('ask in function body', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
function getUserInput(message: text): text {
  return ask message myModel default
}
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[1]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'getUserInput',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'ReturnStatement',
            value: {
              type: 'AskExpression',
              prompt: {
                type: 'Identifier',
                name: 'message',
              },
              model: {
                type: 'Identifier',
                name: 'myModel',
              },
            },
          },
        ],
      },
    });
  });

  test('ask in if condition', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
if ask "Continue?" myModel default {
  let x = "yes"
}
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[1]).toMatchObject({
      type: 'IfStatement',
      condition: {
        type: 'AskExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'Continue?',
        },
      },
    });
  });

  test('ask as function argument', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
function process(input: text): text {
  return input
}
let result = process(ask "Enter value:" myModel default)
`);
    expect(ast.body).toHaveLength(3);
    expect(ast.body[2]).toMatchObject({
      type: 'LetDeclaration',
      name: 'result',
      initializer: {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: 'process',
        },
        arguments: [
          {
            type: 'AskExpression',
            prompt: {
              type: 'StringLiteral',
              value: 'Enter value:',
            },
          },
        ],
      },
    });
  });

  // ============================================================================
  // Multiple ask expressions
  // ============================================================================

  test('multiple ask expressions', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let firstName = ask "First name?" myModel default
let lastName = ask "Last name?" myModel default
let age = ask "Age?" myModel default
`);
    expect(ast.body).toHaveLength(4);
    expect(ast.body[1]).toMatchObject({
      type: 'LetDeclaration',
      name: 'firstName',
      initializer: {
        type: 'AskExpression',
        prompt: { type: 'StringLiteral', value: 'First name?' },
      },
    });
    expect(ast.body[2]).toMatchObject({
      type: 'LetDeclaration',
      name: 'lastName',
      initializer: {
        type: 'AskExpression',
        prompt: { type: 'StringLiteral', value: 'Last name?' },
      },
    });
    expect(ast.body[3]).toMatchObject({
      type: 'LetDeclaration',
      name: 'age',
      initializer: {
        type: 'AskExpression',
        prompt: { type: 'StringLiteral', value: 'Age?' },
      },
    });
  });

  // ============================================================================
  // Ask with const declaration
  // ============================================================================

  test('ask with const declaration', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
const answer = ask "What is 2+2?" myModel default
`);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[1]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'answer',
      initializer: {
        type: 'AskExpression',
        prompt: {
          type: 'StringLiteral',
          value: 'What is 2+2?',
        },
      },
    });
  });

  // ============================================================================
  // AST node structure
  // ============================================================================

  test('ask expression has correct location', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
let x = ask "test" m default
`);
    const askExpr = (ast.body[1] as any).initializer;
    expect(askExpr.type).toBe('AskExpression');
    expect(askExpr.location).toBeDefined();
    expect(askExpr.location.line).toBe(3);
  });
});
