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
        operationType: 'vibe',
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

// ============================================================================
// Optional Model and Context Tests
// ============================================================================

describe('Parser - Vibe Expression with Optional Modifiers', () => {
  test('vibe with prompt only (no model, no context)', () => {
    const ast = parse(`
let x = vibe "just a prompt"
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'x',
      initializer: {
        type: 'VibeExpression',
        operationType: 'vibe',
        prompt: {
          type: 'StringLiteral',
          value: 'just a prompt',
        },
        model: null,
        context: null,
      },
    });
  });

  test('vibe with prompt and context keyword only (no model)', () => {
    const ast = parse(`
let x = vibe "prompt" default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'VibeExpression',
        prompt: { type: 'StringLiteral', value: 'prompt' },
        model: null,
        context: { type: 'ContextSpecifier', kind: 'default' },
      },
    });
  });

  test('vibe with prompt and local context (no model)', () => {
    const ast = parse(`
let x = vibe "prompt" local
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'VibeExpression',
        model: null,
        context: { type: 'ContextSpecifier', kind: 'local' },
      },
    });
  });

  test('vibe with prompt and model only (no context)', () => {
    const ast = parse(`
let x = vibe "prompt" myModel
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'VibeExpression',
        prompt: { type: 'StringLiteral', value: 'prompt' },
        model: { type: 'Identifier', name: 'myModel' },
        context: null,
      },
    });
  });

  test('vibe with all three: prompt, model, and context', () => {
    const ast = parse(`
let x = vibe "prompt" myModel default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'VibeExpression',
        prompt: { type: 'StringLiteral', value: 'prompt' },
        model: { type: 'Identifier', name: 'myModel' },
        context: { type: 'ContextSpecifier', kind: 'default' },
      },
    });
  });
});

describe('Syntax Errors - Vibe Expression', () => {
  test('vibe with no arguments at all', () => {
    expect(() => parse(`
vibe
`)).toThrow();
  });
});

// ============================================================================
// Do Expression (single-round, no tool loop)
// ============================================================================

describe('Parser - Do Expression', () => {
  test('do with string prompt and default context', () => {
    const ast = parse(`
do "summarize this" myModel default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'VibeExpression',
        operationType: 'do',
        prompt: {
          type: 'StringLiteral',
          value: 'summarize this',
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

  test('do with local context', () => {
    const ast = parse(`
do "analyze" myModel local
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ExpressionStatement',
      expression: {
        type: 'VibeExpression',
        operationType: 'do',
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
        type: 'VibeExpression',
        operationType: 'do',
        context: {
          type: 'ContextSpecifier',
          kind: 'variable',
          variable: 'myContext',
        },
      },
    });
  });

  test('do result assigned to let', () => {
    const ast = parse(`
let summary = do "summarize the code" gpt4 default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      name: 'summary',
      initializer: {
        type: 'VibeExpression',
        operationType: 'do',
        prompt: {
          type: 'StringLiteral',
          value: 'summarize the code',
        },
      },
    });
  });

  test('do result assigned to typed const', () => {
    const ast = parse(`
const count: number = do "how many items?" myModel default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ConstDeclaration',
      name: 'count',
      typeAnnotation: 'number',
      initializer: {
        type: 'VibeExpression',
        operationType: 'do',
      },
    });
  });

  test('do inside function', () => {
    const ast = parse(`
function summarize(input: text): text {
  return do input summaryModel default
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'summarize',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'ReturnStatement',
            value: {
              type: 'VibeExpression',
              operationType: 'do',
              prompt: {
                type: 'Identifier',
                name: 'input',
              },
            },
          },
        ],
      },
    });
  });
});

describe('Parser - Do Expression with Optional Modifiers', () => {
  test('do with prompt only (no model, no context)', () => {
    const ast = parse(`
let x = do "just a prompt"
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'VibeExpression',
        operationType: 'do',
        prompt: { type: 'StringLiteral', value: 'just a prompt' },
        model: null,
        context: null,
      },
    });
  });

  test('do with prompt and context only (no model)', () => {
    const ast = parse(`
let x = do "prompt" default
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'VibeExpression',
        operationType: 'do',
        model: null,
        context: { type: 'ContextSpecifier', kind: 'default' },
      },
    });
  });

  test('do with prompt and model only (no context)', () => {
    const ast = parse(`
let x = do "prompt" myModel
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'LetDeclaration',
      initializer: {
        type: 'VibeExpression',
        operationType: 'do',
        model: { type: 'Identifier', name: 'myModel' },
        context: null,
      },
    });
  });
});

describe('Syntax Errors - Do Expression', () => {
  test('do with no arguments', () => {
    expect(() => parse(`
do
`)).toThrow();
  });
});
