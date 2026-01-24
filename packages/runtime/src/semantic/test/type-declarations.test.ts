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
    const errors = analyzer.analyze(ast, code, '');
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
    const errors = analyzer.analyze(ast, code, '');
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

  test('member access on unknown field reports error', () => {
    const code = `type Result { value: number }
let r: Result = null
let x = r.unknown`;
    const errors = getErrors(code);
    expect(errors).toContain("Property 'unknown' does not exist on type 'Result'. Available fields: value");
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
    const errors = analyzer.analyze(ast, code, '');
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

describe('Type Declarations - Object Literal Assignment to Structural Types', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code, '');
    return errors.map((e) => e.message);
  }

  test('object literal assigned to structural type variable is valid', () => {
    const errors = getErrors(`type Player { name: text, score: number }
let p: Player = {name: "Alice", score: 100}`);
    expect(errors).toEqual([]);
  });

  test('object literal assigned to structural type const is valid', () => {
    const errors = getErrors(`type Result { ok: boolean, message: text }
const r: Result = {ok: true, message: "success"}`);
    expect(errors).toEqual([]);
  });

  test('object literal with variable references assigned to structural type is valid', () => {
    const errors = getErrors(`type Round { roundNumber: number, questions: text }
let num = 1
let q = "What is it?"
const round: Round = {roundNumber: num, questions: q}`);
    expect(errors).toEqual([]);
  });

  test('object literal assigned to array of structural type is valid', () => {
    const errors = getErrors(`type Item { value: number }
let items: Item[] = [{value: 1}, {value: 2}]`);
    expect(errors).toEqual([]);
  });

  test('number literal assigned to structural type is an error', () => {
    const errors = getErrors(`type Player { name: text }
let p: Player = 42`);
    expect(errors).toContain('Type error: cannot assign number to Player');
  });

  test('string literal assigned to structural type is an error', () => {
    const errors = getErrors(`type Player { name: text }
let p: Player = "not a player"`);
    expect(errors).toContain('Type error: cannot assign text to Player');
  });

  test('boolean literal assigned to structural type is an error', () => {
    const errors = getErrors(`type Config { enabled: boolean }
let c: Config = true`);
    expect(errors).toContain('Type error: cannot assign boolean to Config');
  });
});

describe('Type Declarations - Object Literal Field Validation', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code, '');
    return errors.map((e) => e.message);
  }

  test('unknown field in object literal is an error', () => {
    const errors = getErrors(`type Player { name: text, score: number }
const p: Player = {namee: "Alice", score: 100}`);
    expect(errors).toContain("Unknown field 'namee' for type 'Player'. Available fields: name, score");
  });

  test('multiple unknown fields are all reported', () => {
    const errors = getErrors(`type Config { host: text, port: number }
let c: Config = {hostt: "localhost", portt: 8080}`);
    expect(errors).toContain("Unknown field 'hostt' for type 'Config'. Available fields: host, port");
    expect(errors).toContain("Unknown field 'portt' for type 'Config'. Available fields: host, port");
  });

  test('correct fields pass validation', () => {
    const errors = getErrors(`type Player { name: text, score: number }
const p: Player = {name: "Alice", score: 100}`);
    expect(errors).toEqual([]);
  });

  test('subset of fields passes (partial initialization)', () => {
    const errors = getErrors(`type Player { name: text, score: number, rank: number }
const p: Player = {name: "Alice"}`);
    expect(errors).toEqual([]);
  });

  test('unknown field in array element is an error', () => {
    const errors = getErrors(`type Item { value: number }
let items: Item[] = [{valuee: 1}]`);
    expect(errors).toContain("Unknown field 'valuee' for type 'Item'. Available fields: value");
  });
});

describe('Type Declarations - Structural Types in Destructuring', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code, '');
    return errors.map((e) => e.message);
  }

  test('structural type array in destructuring field is valid', () => {
    const errors = getErrors(`type RoundResult { roundNumber: number, questions: text }
function getData(): json { return null }
const {results: RoundResult[], runId: text} = getData()`);
    expect(errors).toEqual([]);
  });

  test('structural type in destructuring field is valid', () => {
    const errors = getErrors(`type Player { name: text }
function getData(): json { return null }
const {player: Player, score: number} = getData()`);
    expect(errors).toEqual([]);
  });

  test('unknown type in destructuring field is an error', () => {
    const errors = getErrors(`function getData(): json { return null }
const {items: UnknownType[]} = getData()`);
    expect(errors).toContain("Unknown type 'UnknownType'");
  });

  test('function returning ad-hoc object with nested structural types, destructured with member access', () => {
    const errors = getErrors(`type RoundResult { roundNumber: number, questions: text }

function runBench() {
  let private results: RoundResult[] = []
  const private runId: text = "abc"
  return {results: results, runId: runId}
}

const {results: RoundResult[], runId: text} = runBench()
let count: number = results.len()
let wrong: text = results`);
    // results is RoundResult[] so assigning to text should error
    expect(errors).toContain('Type error: cannot assign RoundResult[] to text');
  });

  test('destructured structural type array element access infers type', () => {
    const errors = getErrors(`type Item { value: number, label: text }

function getItems() {
  let private items: Item[] = []
  return {items: items, total: 0}
}

const {items: Item[], total: number} = getItems()
let first = items[0]
let wrong: boolean = first`);
    // items[0] is Item, assigning to boolean should error
    expect(errors).toContain('Type error: cannot assign Item to boolean');
  });

  test('mixed built-in and structural types in destructuring', () => {
    const errors = getErrors(`type Score { points: number, grade: text }

function analyze() {
  let private s: Score = null
  let private name: text = "test"
  let private count: number = 5
  return {score: s, name: name, count: count}
}

const {score: Score, name: text, count: number} = analyze()
let wrong: number = name`);
    expect(errors).toContain('Type error: cannot assign text to number');
  });
});
