import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';

describe('Semantic Analyzer - Type Inference from Literals', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  // ============================================================================
  // String literal inference
  // ============================================================================

  test('infers text type from string literal', () => {
    const errors = getErrors('let x = "hello"\nlet y: number = x');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  test('inferred text assigned to text is valid', () => {
    const errors = getErrors('let x = "hello"\nlet y: text = x');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Number literal inference
  // ============================================================================

  test('infers number type from number literal', () => {
    const errors = getErrors('const n = 42\nlet s: text = n');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('inferred number assigned to number is valid', () => {
    const errors = getErrors('let n = 42\nlet m: number = n');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Boolean literal inference
  // ============================================================================

  test('infers boolean type from boolean literal', () => {
    const errors = getErrors('let b = true\nlet t: text = b');
    expect(errors).toContain('Type error: cannot assign boolean to text');
  });

  test('inferred boolean assigned to boolean is valid', () => {
    const errors = getErrors('let b = true\nlet c: boolean = b');
    expect(errors).toEqual([]);
  });

  // ============================================================================
  // Chained inference
  // ============================================================================

  test('type propagates through multiple assignments', () => {
    const errors = getErrors('let a = "hi"\nlet b = a\nlet c: number = b');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  // ============================================================================
  // Function return type inference
  // ============================================================================

  test('function return type used for variable type', () => {
    const errors = getErrors('function foo(): text { return "hi" }\nlet x = foo()\nlet y: number = x');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  // ============================================================================
  // Function parameter type checking with inferred args
  // ============================================================================

  test('inferred type checked against function parameter', () => {
    const errors = getErrors('function greet(name: text): text { return name }\nlet n = 42\ngreet(n)');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('inferred type matching parameter is valid', () => {
    const errors = getErrors('function greet(name: text): text { return name }\nlet s = "world"\ngreet(s)');
    expect(errors).toEqual([]);
  });
});

describe('Semantic Analyzer - Index Expression Type Inference', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  test('array element access infers element type', () => {
    const errors = getErrors('let arr: number[] = [1, 2, 3]\nlet x = arr[0]\nlet y: text = x');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('array element access assigns to correct type', () => {
    const errors = getErrors('let arr: number[] = [1, 2, 3]\nlet x = arr[0]\nlet y: number = x');
    expect(errors).toEqual([]);
  });

  test('nested array access strips one level of array brackets', () => {
    const errors = getErrors('let arr: number[][] = [[1, 2], [3, 4]]\nlet inner = arr[0]\nlet x: text = inner');
    expect(errors).toContain('Type error: cannot assign number[] to text');
  });

  test('json member access returns json', () => {
    const errors = getErrors('let obj: json = {a: 1}\nlet x = obj.a\nlet y: number = x');
    expect(errors).toContain('Type error: cannot assign json to number');
  });
});

describe('Semantic Analyzer - Member Expression Type Inference', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  test('json property access returns json', () => {
    const errors = getErrors('let obj: json = {name: "test"}\nlet x = obj.name\nlet y: number = x');
    expect(errors).toContain('Type error: cannot assign json to number');
  });
});

describe('Semantic Analyzer - Binary Expression Type Inference', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  test('comparison operator returns boolean', () => {
    const errors = getErrors('let a = 1\nlet b = 2\nlet c = a == b\nlet d: text = c');
    expect(errors).toContain('Type error: cannot assign boolean to text');
  });

  test('comparison result assigns to boolean', () => {
    const errors = getErrors('let a = 1\nlet b = 2\nlet c = a < b\nlet d: boolean = c');
    expect(errors).toEqual([]);
  });

  test('logical and returns boolean', () => {
    const errors = getErrors('let a = true\nlet b = false\nlet c = a and b\nlet d: number = c');
    expect(errors).toContain('Type error: cannot assign boolean to number');
  });

  test('logical or returns boolean', () => {
    const errors = getErrors('let a = true\nlet b = false\nlet c = a or b\nlet d: number = c');
    expect(errors).toContain('Type error: cannot assign boolean to number');
  });

  test('subtraction returns number', () => {
    const errors = getErrors('let a = 5\nlet b = 3\nlet c = a - b\nlet d: text = c');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('multiplication returns number', () => {
    const errors = getErrors('let a = 5\nlet b = 3\nlet c = a * b\nlet d: boolean = c');
    expect(errors).toContain('Type error: cannot assign number to boolean');
  });

  test('division returns number', () => {
    const errors = getErrors('let a = 10\nlet b = 2\nlet c = a / b\nlet d: text = c');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('modulo returns number', () => {
    const errors = getErrors('let a = 10\nlet b = 3\nlet c = a % b\nlet d: text = c');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('number + number returns number', () => {
    const errors = getErrors('let a = 1\nlet b = 2\nlet c = a + b\nlet d: text = c');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('text + text returns text', () => {
    const errors = getErrors('let a = "hello"\nlet b = " world"\nlet c = a + b\nlet d: number = c');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  test('text + number returns text', () => {
    const errors = getErrors('let a = "value: "\nlet b = 42\nlet c = a + b\nlet d: number = c');
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  test('array concatenation returns same array type', () => {
    const errors = getErrors('let a: number[] = [1, 2]\nlet b: number[] = [3, 4]\nlet c = a + b\nlet d: text = c');
    expect(errors).toContain('Type error: cannot assign number[] to text');
  });
});

describe('Semantic Analyzer - Unary Expression Type Inference', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  test('not operator returns boolean', () => {
    const errors = getErrors('let a = true\nlet b = not a\nlet c: number = b');
    expect(errors).toContain('Type error: cannot assign boolean to number');
  });

  test('negation returns number', () => {
    const errors = getErrors('let a = 5\nlet b = -a\nlet c: text = b');
    expect(errors).toContain('Type error: cannot assign number to text');
  });
});

describe('Semantic Analyzer - Range Expression Type Inference', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  test('range expression returns number[]', () => {
    const errors = getErrors('let r = 1..5\nlet x: text = r');
    expect(errors).toContain('Type error: cannot assign number[] to text');
  });

  test('range expression assigns to number[]', () => {
    const errors = getErrors('let r = 1..5\nlet x: number[] = r');
    expect(errors).toEqual([]);
  });
});

describe('Semantic Analyzer - Method Call Type Inference', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  test('array.len() returns number', () => {
    const errors = getErrors('let arr: text[] = ["a", "b"]\nlet x = arr.len()\nlet y: text = x');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('array.pop() returns element type', () => {
    const errors = getErrors('let arr: number[] = [1, 2, 3]\nlet x = arr.pop()\nlet y: text = x');
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('array.push() returns array type', () => {
    const errors = getErrors('let arr: number[] = [1, 2]\nlet x = arr.push(3)\nlet y: text = x');
    expect(errors).toContain('Type error: cannot assign number[] to text');
  });

  test('text.len() returns number', () => {
    const errors = getErrors('let s = "hello"\nlet x = s.len()\nlet y: text = x');
    expect(errors).toContain('Type error: cannot assign number to text');
  });
});

describe('Semantic Analyzer - Recursive Function Call Type Inference', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  test('function returning array element infers element type', () => {
    const code = `
let models: text[] = ["gpt-4", "claude"]

function getFirst(): text {
  return models[0]
}

let m = getFirst()
let x: number = m`;
    const errors = getErrors(code);
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  test('chained function calls preserve type', () => {
    const code = `
function getNumber(): number {
  return 42
}

function wrapNumber(): number {
  return getNumber()
}

let x = wrapNumber()
let y: text = x`;
    const errors = getErrors(code);
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('double chained function calls preserve type', () => {
    const code = `
function getBase(): text {
  return "hello"
}

function getMiddle(): text {
  return getBase()
}

function getTop(): text {
  return getMiddle()
}

let result = getTop()
let wrong: number = result`;
    const errors = getErrors(code);
    expect(errors).toContain('Type error: cannot assign text to number');
  });

  test('function returning indexed function call result', () => {
    const code = `
function getArray(): number[] {
  return [1, 2, 3]
}

function getFirst(): number {
  return getArray()[0]
}

let x = getFirst()
let y: text = x`;
    const errors = getErrors(code);
    expect(errors).toContain('Type error: cannot assign number to text');
  });
});
