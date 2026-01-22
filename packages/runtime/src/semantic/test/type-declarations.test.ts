import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';

describe('Type Declarations - Parsing', () => {
  test('parses simple type declaration', () => {
    const ast = parse('type Result { valid: boolean, message: text }');
    expect(ast.body[0].type).toBe('TypeDeclaration');
    const typeDecl = ast.body[0] as any;
    expect(typeDecl.name).toBe('Result');
    expect(typeDecl.structure.fields).toHaveLength(2);
    expect(typeDecl.structure.fields[0]).toEqual({ name: 'valid', type: 'boolean' });
    expect(typeDecl.structure.fields[1]).toEqual({ name: 'message', type: 'text' });
  });

  test('parses type with array fields', () => {
    const ast = parse('type Container { items: number[], tags: text[] }');
    const typeDecl = ast.body[0] as any;
    expect(typeDecl.structure.fields[0]).toEqual({ name: 'items', type: 'number[]' });
    expect(typeDecl.structure.fields[1]).toEqual({ name: 'tags', type: 'text[]' });
  });

  test('parses type with named type reference', () => {
    const ast = parse('type Game { player: Player, score: number }');
    const typeDecl = ast.body[0] as any;
    expect(typeDecl.structure.fields[0]).toEqual({ name: 'player', type: 'Player' });
  });

  test('parses type with nested inline object', () => {
    const ast = parse('type Result { metadata: { timestamp: number, source: text } }');
    const typeDecl = ast.body[0] as any;
    expect(typeDecl.structure.fields[0].name).toBe('metadata');
    expect(typeDecl.structure.fields[0].type).toBe('object');
    expect(typeDecl.structure.fields[0].nestedType.fields).toHaveLength(2);
    expect(typeDecl.structure.fields[0].nestedType.fields[0]).toEqual({ name: 'timestamp', type: 'number' });
  });

  test('parses type with array of named types', () => {
    const ast = parse('type Team { players: Player[] }');
    const typeDecl = ast.body[0] as any;
    expect(typeDecl.structure.fields[0]).toEqual({ name: 'players', type: 'Player[]' });
  });

  test('parses empty type', () => {
    const ast = parse('type Empty {}');
    const typeDecl = ast.body[0] as any;
    expect(typeDecl.structure.fields).toHaveLength(0);
  });

  test('parses type with trailing comma', () => {
    const code = `type Player {
  name: text,
  score: number,
}`;
    const ast = parse(code);
    const typeDecl = ast.body[0] as any;
    expect(typeDecl.structure.fields).toHaveLength(2);
  });

  test('parses type without commas (newline-separated)', () => {
    const code = `type Player {
  name: text
  score: number
  active: boolean
}`;
    const ast = parse(code);
    const typeDecl = ast.body[0] as any;
    expect(typeDecl.structure.fields).toHaveLength(3);
    expect(typeDecl.structure.fields[0]).toEqual({ name: 'name', type: 'text' });
    expect(typeDecl.structure.fields[1]).toEqual({ name: 'score', type: 'number' });
    expect(typeDecl.structure.fields[2]).toEqual({ name: 'active', type: 'boolean' });
  });

  test('parses type with mixed separators (commas and newlines)', () => {
    const code = `type Mixed {
  a: text, b: number
  c: boolean
  d: json, e: text
}`;
    const ast = parse(code);
    const typeDecl = ast.body[0] as any;
    expect(typeDecl.structure.fields).toHaveLength(5);
  });
});

describe('Type Declarations - Semantic Analysis', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  test('type declaration with valid field types has no errors', () => {
    const errors = getErrors('type Result { valid: boolean, message: text, count: number }');
    expect(errors).toEqual([]);
  });

  test('type declaration with json field type has no errors', () => {
    const errors = getErrors('type Container { data: json }');
    expect(errors).toEqual([]);
  });

  test('type declaration with array field types has no errors', () => {
    const errors = getErrors('type Container { items: number[], names: text[] }');
    expect(errors).toEqual([]);
  });

  test('type declaration registers in symbol table', () => {
    const code = `type MyType { value: number }
let x: MyType = null`;
    const errors = getErrors(code);
    expect(errors).toEqual([]);  // No error - MyType is recognized
  });

  test('error for duplicate type field names', () => {
    const errors = getErrors('type Bad { name: text, name: number }');
    expect(errors).toContain("Duplicate field 'name' in type definition");
  });

  test('type can only be declared at global scope', () => {
    const errors = getErrors('function foo(): text { type Inner { x: number } return "hi" }');
    expect(errors).toContain('Type declarations can only be at global scope');
  });

  test('duplicate type declaration is an error', () => {
    const errors = getErrors('type Foo { x: number }\ntype Foo { y: text }');
    expect(errors).toContain("'Foo' is already declared");
  });
});

describe('Type Declarations - Member Access Type Inference', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  test('member access on structural type infers field type', () => {
    const code = `type Result { value: number }
let r: Result = null
let v = r.value
let s: text = v`;
    const errors = getErrors(code);
    expect(errors).toContain('Type error: cannot assign number to text');
  });

  test('member access on structural type with boolean field', () => {
    const code = `type Status { active: boolean }
let s: Status = null
if s.active {
  print("ok")
}`;
    const errors = getErrors(code);
    expect(errors).toEqual([]);  // s.active is boolean, valid in if condition
  });

  test('member access on unknown field returns null (no error)', () => {
    const code = `type Result { value: number }
let r: Result = null
let x = r.unknown`;
    const errors = getErrors(code);
    expect(errors).toEqual([]);  // Unknown field access returns null, no error
  });

  test('chained member access through nested type returns named type', () => {
    const code = `type Inner { count: number }
type Outer { inner: Inner }
let o: Outer = null
let c = o.inner
let n: text = c`;
    const errors = getErrors(code);
    // o.inner returns type 'Inner', assigning Inner to text is a type error
    expect(errors).toContain('Type error: cannot assign Inner to text');
  });
});

describe('Type Declarations - Type Annotation Validation', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  test('variable with structural type annotation is valid', () => {
    const errors = getErrors('type Player { name: text }\nlet p: Player = null');
    expect(errors).toEqual([]);
  });

  test('variable with array of structural type annotation is valid', () => {
    const errors = getErrors('type Player { name: text }\nlet players: Player[] = []');
    expect(errors).toEqual([]);
  });

  test('function parameter with structural type is valid', () => {
    const errors = getErrors(`type Data { value: number }
function process(d: Data): number { return d.value }`);
    expect(errors).toEqual([]);
  });

  test('function return type with structural type is valid', () => {
    const errors = getErrors(`type Result { ok: boolean }
function check(): Result { return null }`);
    expect(errors).toEqual([]);
  });

  test('unknown type annotation is an error', () => {
    const errors = getErrors('let x: UnknownType = null');
    expect(errors).toContain("Unknown type 'UnknownType'");
  });
});
