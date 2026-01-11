import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';

describe('Parser - Nested Blocks', () => {
  // ============================================================================
  // Nested if statements
  // ============================================================================

  test('if inside if', () => {
    const ast = parse(`
if x {
  if y {
    let result = "both true"
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'IfStatement',
      condition: { type: 'Identifier', name: 'x' },
      consequent: {
        type: 'BlockStatement',
        body: [
          {
            type: 'IfStatement',
            condition: { type: 'Identifier', name: 'y' },
            consequent: {
              type: 'BlockStatement',
              body: [
                {
                  type: 'LetDeclaration',
                  name: 'result',
                },
              ],
            },
          },
        ],
      },
    });
  });

  test('if inside if inside if (3 levels)', () => {
    const ast = parse(`
if a {
  if b {
    if c {
      let deep = "three levels"
    }
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'IfStatement',
      consequent: {
        type: 'BlockStatement',
        body: [
          {
            type: 'IfStatement',
            consequent: {
              type: 'BlockStatement',
              body: [
                {
                  type: 'IfStatement',
                  consequent: {
                    type: 'BlockStatement',
                    body: [
                      { type: 'LetDeclaration', name: 'deep' },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    });
  });

  // ============================================================================
  // Nested functions
  // ============================================================================

  test('function inside function', () => {
    const ast = parse(`
function outer(): text {
  function inner(): text {
    return "nested"
  }
  return inner()
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'outer',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'FunctionDeclaration',
            name: 'inner',
            body: {
              type: 'BlockStatement',
              body: [
                { type: 'ReturnStatement' },
              ],
            },
          },
          { type: 'ReturnStatement' },
        ],
      },
    });
  });

  // ============================================================================
  // Nested blocks (standalone)
  // ============================================================================

  test('block inside block', () => {
    const ast = parse(`
{
  {
    let inner = "nested block"
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'BlockStatement',
      body: [
        {
          type: 'BlockStatement',
          body: [
            { type: 'LetDeclaration', name: 'inner' },
          ],
        },
      ],
    });
  });

  test('three nested blocks', () => {
    const ast = parse(`
{
  {
    {
      let deep = "three levels"
    }
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'BlockStatement',
      body: [
        {
          type: 'BlockStatement',
          body: [
            {
              type: 'BlockStatement',
              body: [
                { type: 'LetDeclaration', name: 'deep' },
              ],
            },
          ],
        },
      ],
    });
  });

  // ============================================================================
  // Mixed nested blocks
  // ============================================================================

  test('if inside function', () => {
    const ast = parse(`
function check(x: text): text {
  if x {
    return "yes"
  }
  return "no"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      name: 'check',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'IfStatement',
            consequent: {
              type: 'BlockStatement',
              body: [
                { type: 'ReturnStatement' },
              ],
            },
          },
          { type: 'ReturnStatement' },
        ],
      },
    });
  });

  test('function with if-else inside', () => {
    const ast = parse(`
function decide(cond: text): text {
  if cond {
    return "yes"
  } else {
    return "no"
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'IfStatement',
            consequent: { type: 'BlockStatement' },
            alternate: { type: 'BlockStatement' },
          },
        ],
      },
    });
  });

  test('block inside function', () => {
    const ast = parse(`
function scoped(): text {
  let outer = "outer"
  {
    let inner = "inner"
  }
  return outer
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      body: {
        type: 'BlockStatement',
        body: [
          { type: 'LetDeclaration', name: 'outer' },
          {
            type: 'BlockStatement',
            body: [
              { type: 'LetDeclaration', name: 'inner' },
            ],
          },
          { type: 'ReturnStatement' },
        ],
      },
    });
  });

  test('if with block inside', () => {
    const ast = parse(`
if condition {
  {
    let scoped = "in block"
  }
  let after = "after block"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'IfStatement',
      consequent: {
        type: 'BlockStatement',
        body: [
          {
            type: 'BlockStatement',
            body: [
              { type: 'LetDeclaration', name: 'scoped' },
            ],
          },
          { type: 'LetDeclaration', name: 'after' },
        ],
      },
    });
  });

  // ============================================================================
  // Complex nested structures
  // ============================================================================

  test('function with nested if-else-if', () => {
    const ast = parse(`
function classify(x: text): text {
  if a {
    return "first"
  } else if b {
    return "second"
  } else {
    return "third"
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'IfStatement',
            consequent: { type: 'BlockStatement' },
            alternate: {
              type: 'IfStatement',
              consequent: { type: 'BlockStatement' },
              alternate: { type: 'BlockStatement' },
            },
          },
        ],
      },
    });
  });

  test('deeply nested mixed blocks', () => {
    const ast = parse(`
function complex(): text {
  if a {
    {
      if b {
        let deep = "very nested"
      }
    }
  }
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'IfStatement',
            consequent: {
              type: 'BlockStatement',
              body: [
                {
                  type: 'BlockStatement',
                  body: [
                    {
                      type: 'IfStatement',
                      consequent: {
                        type: 'BlockStatement',
                        body: [
                          { type: 'LetDeclaration', name: 'deep' },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    });
  });

  test('multiple siblings at each level', () => {
    const ast = parse(`
function multi(): text {
  let a = "first"
  if x {
    let b = "second"
    let c = "third"
  }
  let d = "fourth"
}
`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'FunctionDeclaration',
      body: {
        type: 'BlockStatement',
        body: [
          { type: 'LetDeclaration', name: 'a' },
          {
            type: 'IfStatement',
            consequent: {
              type: 'BlockStatement',
              body: [
                { type: 'LetDeclaration', name: 'b' },
                { type: 'LetDeclaration', name: 'c' },
              ],
            },
          },
          { type: 'LetDeclaration', name: 'd' },
        ],
      },
    });
  });
});
