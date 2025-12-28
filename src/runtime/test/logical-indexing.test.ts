import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, AIProvider } from '../index';

// Mock AI provider
function createMockProvider(): AIProvider {
  return {
    async execute(): Promise<string> {
      return '';
    },
    async generateCode(): Promise<string> {
      return '';
    },
    async askUser(): Promise<string> {
      return '';
    },
  };
}

describe('Logical Operators - and', () => {
  test('true and true = true', async () => {
    const ast = parse(`let result = true and true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('true and false = false', async () => {
    const ast = parse(`let result = true and false`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('false and true = false', async () => {
    const ast = parse(`let result = false and true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('false and false = false', async () => {
    const ast = parse(`let result = false and false`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('chained and: true and true and true = true', async () => {
    const ast = parse(`let result = true and true and true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('chained and with false: true and false and true = false', async () => {
    const ast = parse(`let result = true and false and true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });
});

describe('Logical Operators - or', () => {
  test('true or true = true', async () => {
    const ast = parse(`let result = true or true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('true or false = true', async () => {
    const ast = parse(`let result = true or false`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('false or true = true', async () => {
    const ast = parse(`let result = false or true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('false or false = false', async () => {
    const ast = parse(`let result = false or false`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('chained or: false or false or true = true', async () => {
    const ast = parse(`let result = false or false or true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });
});

describe('Logical Operators - not', () => {
  test('not true = false', async () => {
    const ast = parse(`let result = not true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('not false = true', async () => {
    const ast = parse(`let result = not false`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('not not true = true', async () => {
    const ast = parse(`let result = not not true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });
});

describe('Logical Operators - Combined', () => {
  test('and has higher precedence than or: true or false and false = true', async () => {
    // Should be: true or (false and false) = true or false = true
    const ast = parse(`let result = true or false and false`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('parentheses override: (true or false) and false = false', async () => {
    const ast = parse(`let result = (true or false) and false`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('not with and: not true and true = false', async () => {
    // Should be: (not true) and true = false and true = false
    const ast = parse(`let result = not true and true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('not with or: not false or false = true', async () => {
    // Should be: (not false) or false = true or false = true
    const ast = parse(`let result = not false or false`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('logical with comparison: 1 < 2 and 3 > 1 = true', async () => {
    const ast = parse(`let result = 1 < 2 and 3 > 1`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('logical in if condition', async () => {
    const ast = parse(`
let x = 5
let y = 10
let result = "none"
if x < 10 and y > 5 {
  result = "both true"
}
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe('both true');
  });
});

describe('Array Indexing - Basic', () => {
  test('access first element: arr[0]', async () => {
    const ast = parse(`
let arr = [10, 20, 30]
let result = arr[0]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(10);
  });

  test('access second element: arr[1]', async () => {
    const ast = parse(`
let arr = [10, 20, 30]
let result = arr[1]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(20);
  });

  test('access last element: arr[2]', async () => {
    const ast = parse(`
let arr = [10, 20, 30]
let result = arr[2]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(30);
  });

  test('access with variable index', async () => {
    const ast = parse(`
let arr = ["a", "b", "c"]
let i = 1
let result = arr[i]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe('b');
  });

  test('access with expression index', async () => {
    const ast = parse(`
let arr = [100, 200, 300]
let result = arr[1 + 1]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(300);
  });

  test('chained array access', async () => {
    const ast = parse(`
let matrix = [[1, 2], [3, 4], [5, 6]]
let result = matrix[1][0]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(3);
  });
});

describe('Array Slicing - Basic', () => {
  test('slice with both bounds: arr[1,3]', async () => {
    const ast = parse(`
let arr = [10, 20, 30, 40, 50]
let result = arr[1,3]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    // Inclusive: indices 1, 2, 3
    expect(runtime.getValue('result')).toEqual([20, 30, 40]);
  });

  test('slice from start: arr[,2]', async () => {
    const ast = parse(`
let arr = [10, 20, 30, 40, 50]
let result = arr[,2]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    // Inclusive: indices 0, 1, 2
    expect(runtime.getValue('result')).toEqual([10, 20, 30]);
  });

  test('slice to end: arr[2,]', async () => {
    const ast = parse(`
let arr = [10, 20, 30, 40, 50]
let result = arr[2,]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    // Inclusive: indices 2, 3, 4
    expect(runtime.getValue('result')).toEqual([30, 40, 50]);
  });

  test('slice with variable bounds', async () => {
    const ast = parse(`
let arr = [1, 2, 3, 4, 5]
let start = 1
let end = 3
let result = arr[start, end]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toEqual([2, 3, 4]);
  });

  test('slice single element: arr[2,2]', async () => {
    const ast = parse(`
let arr = [10, 20, 30, 40, 50]
let result = arr[2,2]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toEqual([30]);
  });

  test('slice first element: arr[0,0]', async () => {
    const ast = parse(`
let arr = [10, 20, 30]
let result = arr[0,0]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toEqual([10]);
  });
});

describe('Array Access in Loops', () => {
  test('iterate and access by index', async () => {
    const ast = parse(`
let arr = [10, 20, 30]
let sum = 0
for i in 3 {
  let idx = i - 1
  sum = sum + arr[idx]
}
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('sum')).toBe(60);
  });

  test('build new array from slices', async () => {
    const ast = parse(`
let arr = [1, 2, 3, 4, 5]
let first = arr[,1]
let last = arr[3,]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('first')).toEqual([1, 2]);
    expect(runtime.getValue('last')).toEqual([4, 5]);
  });
});

describe('Unary Minus', () => {
  test('negative number literal already works', async () => {
    const ast = parse(`let result = -5`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(-5);
  });

  test('negate variable', async () => {
    const ast = parse(`
let x = 10
let result = -x
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(-10);
  });

  test('double negative', async () => {
    const ast = parse(`
let x = 10
let result = - -x
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(10);
  });
});

describe('Combined Expressions', () => {
  test('logical with indexing', async () => {
    const ast = parse(`
let arr = [true, false, true]
let result = arr[0] and arr[2]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('arithmetic with indexing', async () => {
    const ast = parse(`
let arr = [10, 20, 30]
let result = arr[0] + arr[1] + arr[2]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(60);
  });

  test('comparison with indexing', async () => {
    const ast = parse(`
let arr = [5, 10, 15]
let result = arr[0] < arr[1]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('function call with index result', async () => {
    const ast = parse(`
function double(n: number): number {
  return n * 2
}
let arr = [5, 10, 15]
let result = double(arr[1])
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(20);
  });
});
