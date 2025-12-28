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

describe('Array Methods - len()', () => {
  test('len of empty array', async () => {
    const ast = parse(`
let arr = []
let result = arr.len()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(0);
  });

  test('len of non-empty array', async () => {
    const ast = parse(`
let arr = [1, 2, 3, 4, 5]
let result = arr.len()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(5);
  });

  test('len of array literal', async () => {
    const ast = parse(`
let result = [10, 20, 30].len()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(3);
  });

  test('len in expression', async () => {
    const ast = parse(`
let arr = [1, 2, 3]
let result = arr.len() + 10
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(13);
  });

  test('len in condition', async () => {
    const ast = parse(`
let arr = [1, 2, 3]
let result = "empty"
if arr.len() > 0 {
  result = "not empty"
}
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe('not empty');
  });
});

describe('Array Methods - push()', () => {
  test('push to empty array', async () => {
    const ast = parse(`
let arr = []
arr.push(42)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('arr')).toEqual([42]);
  });

  test('push to non-empty array', async () => {
    const ast = parse(`
let arr = [1, 2, 3]
arr.push(4)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('arr')).toEqual([1, 2, 3, 4]);
  });

  test('push multiple times', async () => {
    const ast = parse(`
let arr = []
arr.push(1)
arr.push(2)
arr.push(3)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('arr')).toEqual([1, 2, 3]);
  });

  test('push returns the array for chaining', async () => {
    const ast = parse(`
let arr = []
let result = arr.push(1).push(2).push(3)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('arr')).toEqual([1, 2, 3]);
    expect(runtime.getValue('result')).toEqual([1, 2, 3]);
  });

  test('push in loop', async () => {
    const ast = parse(`
let arr = []
for i in 5 {
  arr.push(i)
}
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('arr')).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Array Methods - pop()', () => {
  test('pop from array', async () => {
    const ast = parse(`
let arr = [1, 2, 3]
let result = arr.pop()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(3);
    expect(runtime.getValue('arr')).toEqual([1, 2]);
  });

  test('pop multiple times', async () => {
    const ast = parse(`
let arr = [10, 20, 30]
let a = arr.pop()
let b = arr.pop()
let c = arr.pop()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('a')).toBe(30);
    expect(runtime.getValue('b')).toBe(20);
    expect(runtime.getValue('c')).toBe(10);
    expect(runtime.getValue('arr')).toEqual([]);
  });

  test('pop returns the removed element', async () => {
    const ast = parse(`
let arr = ["first", "second", "third"]
let last = arr.pop()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('last')).toBe('third');
  });
});

describe('String Methods - len()', () => {
  test('len of empty string', async () => {
    const ast = parse(`
let s = ""
let result = s.len()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(0);
  });

  test('len of non-empty string', async () => {
    const ast = parse(`
let s = "hello"
let result = s.len()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(5);
  });

  test('len of string literal', async () => {
    const ast = parse(`
let result = "world".len()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(5);
  });

  test('len in comparison', async () => {
    const ast = parse(`
let name = "Alice"
let result = name.len() == 5
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(true);
  });
});

describe('Method Chaining', () => {
  test('push chain then len', async () => {
    const ast = parse(`
let arr = []
let result = arr.push(1).push(2).push(3).len()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(3);
  });

  test('method after index access', async () => {
    const ast = parse(`
let nested = [["a", "b", "c"], ["d", "e"]]
let result = nested[0].len()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(3);
  });

  test('index after method', async () => {
    const ast = parse(`
let arr = []
let result = arr.push(10).push(20).push(30)[1]
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(20);
  });
});

describe('Methods with Other Features', () => {
  test('method in while loop condition', async () => {
    const ast = parse(`
let arr = [1, 2, 3, 4, 5]
let sum = 0
while arr.len() > 0 {
  sum = sum + arr.pop()
}
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('sum')).toBe(15);
    expect(runtime.getValue('arr')).toEqual([]);
  });

  test('method call passed to function', async () => {
    const ast = parse(`
function double(n: number): number {
  return n * 2
}
let arr = [1, 2, 3]
let result = double(arr.len())
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(6);
  });

  test('building arrays with push in function', async () => {
    const ast = parse(`
function buildArray(n: number): json {
  let arr = []
  for i in n {
    arr.push(i * 10)
  }
  return arr
}
let result = buildArray(4)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toEqual([10, 20, 30, 40]);
  });
});

describe('Method Edge Cases', () => {
  test('len of single element array', async () => {
    const ast = parse(`
let arr = [42]
let result = arr.len()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(1);
  });

  test('push and pop sequence', async () => {
    const ast = parse(`
let arr = [1]
arr.push(2)
let x = arr.pop()
arr.push(3)
let y = arr.pop()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('x')).toBe(2);
    expect(runtime.getValue('y')).toBe(3);
    expect(runtime.getValue('arr')).toEqual([1]);
  });

  test('array method after slice', async () => {
    const ast = parse(`
let arr = [1, 2, 3, 4, 5]
let sliced = arr[1,3]
let result = sliced.len()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();
    expect(runtime.getValue('result')).toBe(3);
  });
});
