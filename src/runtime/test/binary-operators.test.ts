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

describe('Binary Operators - Arithmetic', () => {
  test('addition: 1 + 2 = 3', async () => {
    const ast = parse(`let result = 1 + 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(3);
  });

  test('subtraction: 10 - 3 = 7', async () => {
    const ast = parse(`let result = 10 - 3`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(7);
  });

  test('multiplication: 4 * 5 = 20', async () => {
    const ast = parse(`let result = 4 * 5`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(20);
  });

  test('division: 20 / 4 = 5', async () => {
    const ast = parse(`let result = 20 / 4`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(5);
  });

  test('modulo: 7 % 3 = 1', async () => {
    const ast = parse(`let result = 7 % 3`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(1);
  });

  test('chained addition: 1 + 2 + 3 = 6', async () => {
    const ast = parse(`let result = 1 + 2 + 3`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(6);
  });

  test('chained subtraction: 10 - 3 - 2 = 5', async () => {
    const ast = parse(`let result = 10 - 3 - 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(5);
  });

  test('mixed add/subtract: 10 + 5 - 3 = 12', async () => {
    const ast = parse(`let result = 10 + 5 - 3`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(12);
  });

  test('chained multiplication: 2 * 3 * 4 = 24', async () => {
    const ast = parse(`let result = 2 * 3 * 4`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(24);
  });

  test('chained division: 100 / 2 / 5 = 10', async () => {
    const ast = parse(`let result = 100 / 2 / 5`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(10);
  });

  test('negative result: 3 - 10 = -7', async () => {
    const ast = parse(`let result = 3 - 10`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(-7);
  });

  test('decimal division: 7 / 2 = 3.5', async () => {
    const ast = parse(`let result = 7 / 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(3.5);
  });
});

describe('Binary Operators - Precedence', () => {
  test('multiplication before addition: 1 + 2 * 3 = 7', async () => {
    const ast = parse(`let result = 1 + 2 * 3`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(7);
  });

  test('division before subtraction: 10 - 6 / 2 = 7', async () => {
    const ast = parse(`let result = 10 - 6 / 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(7);
  });

  test('parentheses override: (1 + 2) * 3 = 9', async () => {
    const ast = parse(`let result = (1 + 2) * 3`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(9);
  });

  test('nested parentheses: ((2 + 3) * 4) - 10 = 10', async () => {
    const ast = parse(`let result = ((2 + 3) * 4) - 10`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(10);
  });

  test('complex expression: 2 + 3 * 4 - 6 / 2 = 11', async () => {
    const ast = parse(`let result = 2 + 3 * 4 - 6 / 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(11);
  });

  test('modulo with addition: 10 % 3 + 5 = 6', async () => {
    const ast = parse(`let result = 10 % 3 + 5`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(6);
  });
});

describe('Binary Operators - Comparison', () => {
  test('equality: 1 == 1 is true', async () => {
    const ast = parse(`let result = 1 == 1`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('equality: 1 == 2 is false', async () => {
    const ast = parse(`let result = 1 == 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('inequality: 1 != 2 is true', async () => {
    const ast = parse(`let result = 1 != 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('inequality: 1 != 1 is false', async () => {
    const ast = parse(`let result = 1 != 1`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('less than: 1 < 2 is true', async () => {
    const ast = parse(`let result = 1 < 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('less than: 2 < 1 is false', async () => {
    const ast = parse(`let result = 2 < 1`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('less than: 1 < 1 is false', async () => {
    const ast = parse(`let result = 1 < 1`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('greater than: 2 > 1 is true', async () => {
    const ast = parse(`let result = 2 > 1`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('greater than: 1 > 2 is false', async () => {
    const ast = parse(`let result = 1 > 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('less than or equal: 1 <= 2 is true', async () => {
    const ast = parse(`let result = 1 <= 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('less than or equal: 1 <= 1 is true', async () => {
    const ast = parse(`let result = 1 <= 1`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('less than or equal: 2 <= 1 is false', async () => {
    const ast = parse(`let result = 2 <= 1`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('greater than or equal: 2 >= 1 is true', async () => {
    const ast = parse(`let result = 2 >= 1`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('greater than or equal: 1 >= 1 is true', async () => {
    const ast = parse(`let result = 1 >= 1`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('greater than or equal: 1 >= 2 is false', async () => {
    const ast = parse(`let result = 1 >= 2`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });
});

describe('Binary Operators - Comparison with Arithmetic', () => {
  test('compare arithmetic results: 2 + 3 == 5 is true', async () => {
    const ast = parse(`let result = 2 + 3 == 5`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('compare arithmetic results: 2 * 3 > 5 is true', async () => {
    const ast = parse(`let result = 2 * 3 > 5`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('comparison in if condition', async () => {
    const ast = parse(`
let x = 10
let result = "none"
if x > 5 {
  result = "big"
}
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe('big');
  });

  test('arithmetic comparison in if condition', async () => {
    const ast = parse(`
let a = 3
let b = 4
let result = "none"
if a + b == 7 {
  result = "correct"
}
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe('correct');
  });
});

describe('Binary Operators - With Variables', () => {
  test('add two variables', async () => {
    const ast = parse(`
let a = 5
let b = 3
let result = a + b
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(8);
  });

  test('multiply variable by constant', async () => {
    const ast = parse(`
let x = 7
let result = x * 3
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(21);
  });

  test('complex expression with variables', async () => {
    const ast = parse(`
let a = 10
let b = 5
let c = 2
let result = (a + b) * c - 10
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(20);
  });

  test('compare two variables', async () => {
    const ast = parse(`
let x = 10
let y = 20
let result = x < y
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });
});

describe('Binary Operators - String Equality', () => {
  test('string equality: same strings', async () => {
    const ast = parse(`let result = "hello" == "hello"`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('string equality: different strings', async () => {
    const ast = parse(`let result = "hello" == "world"`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('string inequality', async () => {
    const ast = parse(`let result = "hello" != "world"`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });
});

describe('Binary Operators - Boolean Equality', () => {
  test('boolean equality: true == true', async () => {
    const ast = parse(`let result = true == true`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });

  test('boolean equality: true == false', async () => {
    const ast = parse(`let result = true == false`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(false);
  });

  test('boolean inequality: true != false', async () => {
    const ast = parse(`let result = true != false`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });
});

describe('Binary Operators - In Loops', () => {
  test('arithmetic in for loop', async () => {
    const ast = parse(`
let sum = 0
for i in 5 {
  sum = sum + i
}
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    // 1 + 2 + 3 + 4 + 5 = 15
    expect(runtime.getValue('sum')).toBe(15);
  });

  test('comparison in while loop', async () => {
    const ast = parse(`
let count = 0
let max = 5
while count < max {
  count = count + 1
}
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('count')).toBe(5);
  });

  test('multiplication in loop accumulator', async () => {
    const ast = parse(`
let factorial = 1
for i in 5 {
  factorial = factorial * i
}
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    // 1 * 1 * 2 * 3 * 4 * 5 = 120
    expect(runtime.getValue('factorial')).toBe(120);
  });
});
