/**
 * Tests for semantic analysis of function return type checking.
 * Functions and tools with return types must return or throw on all code paths.
 */
import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

function getErrors(code: string) {
  const ast = parse(code);
  return analyze(ast, '', '');
}

describe('Semantic Analysis - Function Return Type Checking', () => {
  describe('functions with return type', () => {
    test('explicit return passes', () => {
      const errors = getErrors(`
function add(a: number, b: number): number {
  return a + b
}
`);
      expect(errors).toHaveLength(0);
    });

    test('implicit return (expression at end) passes', () => {
      const errors = getErrors(`
function add(a: number, b: number): number {
  let sum = a + b
  sum
}
`);
      expect(errors).toHaveLength(0);
    });

    test('throw statement passes', () => {
      const errors = getErrors(`
function fail(): number {
  throw "always fails"
}
`);
      expect(errors).toHaveLength(0);
    });

    test('if/else both branches return passes', () => {
      const errors = getErrors(`
function abs(x: number): number {
  if x < 0 {
    return 0 - x
  } else {
    return x
  }
}
`);
      expect(errors).toHaveLength(0);
    });

    test('if/else both branches throw passes', () => {
      const errors = getErrors(`
function check(x: number): number {
  if x < 0 {
    throw "negative"
  } else {
    throw "non-negative"
  }
}
`);
      expect(errors).toHaveLength(0);
    });

    test('if/else mixed return and throw passes', () => {
      const errors = getErrors(`
function validate(x: number): number {
  if x < 0 {
    throw "cannot be negative"
  } else {
    return x
  }
}
`);
      expect(errors).toHaveLength(0);
    });

    test('empty body errors', () => {
      const errors = getErrors(`
function empty(): number {
}
`);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("not all code paths return or throw");
    });

    test('if without else errors', () => {
      const errors = getErrors(`
function maybe(x: number): number {
  if x > 0 {
    return x
  }
}
`);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("not all code paths return or throw");
    });

    test('if with else where only one branch returns errors', () => {
      const errors = getErrors(`
function partial(x: number): number {
  if x > 0 {
    return x
  } else {
    let y = x
  }
}
`);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("not all code paths return or throw");
    });

    test('loop does not guarantee return', () => {
      const errors = getErrors(`
function loop(items: number[]): number {
  for i in items {
    return i
  }
}
`);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("not all code paths return or throw");
    });
  });

  describe('functions without return type', () => {
    test('no return type - no check required', () => {
      const errors = getErrors(`
function greet(name: text) {
  print("Hello " + name)
}
`);
      expect(errors).toHaveLength(0);
    });
  });

  describe('tools', () => {
    test('tool with return passes', () => {
      const errors = getErrors(`
tool greet(name: text): text {
  return "Hello " + name
}
`);
      expect(errors).toHaveLength(0);
    });

    test('tool with implicit return (expression) passes', () => {
      const errors = getErrors(`
tool greet(name: text): text {
  ts(name) { return "Hello, " + name }
}
`);
      expect(errors).toHaveLength(0);
    });

    test('tool with throw passes', () => {
      const errors = getErrors(`
tool fail(msg: text): text {
  throw msg
}
`);
      expect(errors).toHaveLength(0);
    });

    test('tool without return errors', () => {
      const errors = getErrors(`
tool broken(x: number): number {
  let y = x + 1
}
`);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("not all code paths return or throw");
    });
  });

  describe('nested control flow', () => {
    test('nested if/else both returning passes', () => {
      const errors = getErrors(`
function nested(x: number, y: number): number {
  if x > 0 {
    if y > 0 {
      return x + y
    } else {
      return x - y
    }
  } else {
    return 0 - x
  }
}
`);
      expect(errors).toHaveLength(0);
    });

    test('nested if/else with missing inner else errors', () => {
      const errors = getErrors(`
function nested(x: number, y: number): number {
  if x > 0 {
    if y > 0 {
      return x + y
    }
  } else {
    return 0
  }
}
`);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("not all code paths return or throw");
    });
  });
});
