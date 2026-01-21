// Tests for throw statement - throw "message" returns immediately with error value

import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime } from '../index';
import type { AIProvider, AIResponse } from '../types';
import { isVibeValue } from '../types';

// Mock provider for tests that don't need AI
function createMockProvider(): AIProvider {
  return {
    async chat(): Promise<AIResponse> {
      return { content: 'mock response', toolCalls: [] };
    },
  };
}

describe('Throw Statement', () => {
  test('throw with string literal creates error value', async () => {
    const ast = parse(`
function fail(): text {
  throw "Something went wrong"
  return "never reached"
}

let result = fail()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    const result = runtime.getRawValue('result');
    expect(isVibeValue(result)).toBe(true);
    if (isVibeValue(result)) {
      expect(result.err).toBe(true);
      expect(result.errDetails?.message).toBe('Something went wrong');
    }
  });

  test('throw returns immediately from function', async () => {
    const ast = parse(`
let sideEffect = 0

function testThrow(): number {
  sideEffect = 1
  throw "error"
  sideEffect = 2
  return 42
}

let result = testThrow()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    // Side effect should only be 1 (before throw)
    expect(runtime.getValue('sideEffect')).toBe(1);

    const result = runtime.getRawValue('result');
    expect(isVibeValue(result)).toBe(true);
    if (isVibeValue(result)) {
      expect(result.err).toBe(true);
    }
  });

  test('throw with expression evaluates message', async () => {
    const ast = parse(`
function divide(a: number, b: number): number {
  if b == 0 {
    throw "Cannot divide " + a + " by zero"
  }
  return a / b
}

let result = divide(10, 0)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    const result = runtime.getRawValue('result');
    expect(isVibeValue(result)).toBe(true);
    if (isVibeValue(result)) {
      expect(result.err).toBe(true);
      expect(result.errDetails?.message).toBe('Cannot divide 10 by zero');
    }
  });

  test('successful function call returns normal value', async () => {
    const ast = parse(`
function divide(a: number, b: number): number {
  if b == 0 {
    throw "Division by zero"
  }
  return a / b
}

let result = divide(10, 2)
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    const result = runtime.getRawValue('result');
    expect(isVibeValue(result)).toBe(true);
    if (isVibeValue(result)) {
      expect(result.err).toBe(false);
      expect(result.value).toBe(5);
    }
  });

  test('error propagates through expressions', async () => {
    const ast = parse(`
function fail(): number {
  throw "error"
}

let a = fail()
let b = a + 10
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    const a = runtime.getRawValue('a');
    const b = runtime.getRawValue('b');

    expect(isVibeValue(a)).toBe(true);
    expect(isVibeValue(b)).toBe(true);

    if (isVibeValue(a) && isVibeValue(b)) {
      expect(a.err).toBe(true);
      expect(b.err).toBe(true);  // Error propagates
      expect(b.errDetails?.message).toBe('error');
    }
  });

  test('caller can check for error with .err', async () => {
    const ast = parse(`
function mayFail(shouldFail: boolean): text {
  if shouldFail {
    throw "Failed!"
  }
  return "Success"
}

let result1 = mayFail(true)
let hasError1 = result1.err

let result2 = mayFail(false)
let hasError2 = result2.err
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('hasError1')).toBe(true);
    expect(runtime.getValue('hasError2')).toBe(false);
  });

  test('throw at top level completes with error', async () => {
    const ast = parse(`
let x = 1
throw "Top level error"
let y = 2
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    expect(runtime.getValue('x')).toBe(1);
    // y should not be set because throw exits
    expect(runtime.getValue('y')).toBeUndefined();

    // lastResult should be the error
    const lastResult = runtime.getState().lastResult;
    expect(isVibeValue(lastResult)).toBe(true);
    if (isVibeValue(lastResult)) {
      expect(lastResult.err).toBe(true);
      expect(lastResult.errDetails?.message).toBe('Top level error');
    }
  });

  test('throw in nested function unwinds correctly', async () => {
    const ast = parse(`
function inner(): number {
  throw "inner error"
}

function outer(): number {
  let x = inner()
  return x + 1
}

let result = outer()
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    const result = runtime.getRawValue('result');
    expect(isVibeValue(result)).toBe(true);
    if (isVibeValue(result)) {
      expect(result.err).toBe(true);
      expect(result.errDetails?.message).toBe('inner error');
    }
  });

  test('throw with variable message', async () => {
    const ast = parse(`
function failWith(msg: text): text {
  throw msg
}

let result = failWith("custom error message")
`);
    const runtime = new Runtime(ast, createMockProvider());
    await runtime.run();

    const result = runtime.getRawValue('result');
    expect(isVibeValue(result)).toBe(true);
    if (isVibeValue(result)) {
      expect(result.err).toBe(true);
      expect(result.errDetails?.message).toBe('custom error message');
    }
  });
});
