import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Validation - Async Declarations', () => {
  // ============================================================================
  // Valid async let declarations
  // ============================================================================

  test('valid async let with do expression', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async let x: text = do "prompt" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async let with vibe expression', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async let x: text = vibe "prompt" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async let with ts block', () => {
    const ast = parse(`
async let x = ts() { return fetchData(); }
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async let with function call', () => {
    const ast = parse(`
function getData(): text { return "data" }
async let x = getData()
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Valid async const declarations
  // ============================================================================

  test('valid async const with do expression', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async const x: text = do "prompt" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async const with vibe expression', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async const x: text = vibe "prompt" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async const with ts block', () => {
    const ast = parse(`
async const x = ts() { return fetchData(); }
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async const with function call', () => {
    const ast = parse(`
function getData(): text { return "data" }
async const x = getData()
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Valid async destructuring declarations
  // ============================================================================

  test('valid async let destructuring with do expression', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async let {name: text, age: number} = do "get info" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async const destructuring with do expression', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async const {name: text, age: number} = do "get info" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Valid async standalone statements (fire-and-forget)
  // ============================================================================

  test('valid async do statement', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async do "log something" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async vibe statement', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async vibe "process data" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async ts block statement', () => {
    const ast = parse(`
async ts() { console.log("fire and forget"); }
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async function call statement', () => {
    const ast = parse(`
function logEvent(msg: text): text { return msg }
async logEvent("event")
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Invalid async declarations - caught at parse time
  // Note: Invalid async expressions (literals, identifiers, etc.) are caught
  // by the parser grammar, not semantic analysis. These tests verify parse errors.
  // ============================================================================

  test('async let with string literal fails at parse time', () => {
    expect(() => parse(`async let x = "hello"`)).toThrow();
  });

  test('async let with number literal fails at parse time', () => {
    expect(() => parse(`async let x = 42`)).toThrow();
  });

  test('async let with identifier is invalid (semantic error)', () => {
    const ast = parse(`
let data = "test"
async let x = data
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('async declarations require a single do, vibe, ts block, or function call');
  });

  test('untyped let with do expression requires type annotation', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
let x = do "prompt" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Type cannot be inferred from AI call');
  });

  test('untyped let with vibe expression requires type annotation', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
let x = vibe "prompt" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Type cannot be inferred from AI call');
  });

  test('async const with literal fails at parse time', () => {
    expect(() => parse(`async const x = "hello"`)).toThrow();
  });

  // ============================================================================
  // Async declarations with type annotations (valid)
  // ============================================================================

  test('valid async let with type annotation', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async let x: text = do "prompt" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async const with type annotation', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async const x: number = do "give number" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Async declarations with private modifier (valid)
  // ============================================================================

  test('valid async let with private modifier', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async let private secret: text = do "get secret" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('valid async const with private modifier', () => {
    const ast = parse(`
function getKey(): text { return "key" }
async const private API_KEY = getKey()
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Multiple async declarations (valid)
  // ============================================================================

  test('multiple async let declarations are valid', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async let a: text = do "1" m
async let b: text = do "2" m
async let c: text = do "3" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('mixed async and sync declarations are valid', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
let sync1 = "hello"
async let async1: text = do "prompt" m
const sync2 = 42
async const async2 = ts() { return fetchData(); }
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Async with method calls (valid)
  // ============================================================================

  test('valid async method call statement', () => {
    const ast = parse(`
let api = "api"
async api.sendNotification("done")
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Using async declared variables (valid)
  // ============================================================================

  test('can use async declared variables in expressions', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async let x: text = do "1" m
async let y: text = do "2" m
let result = x + y
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('async declared variable can be used as dependency', () => {
    const ast = parse(`
model m = { name: "test", apiKey: "key", url: "http://test" }
async let x: text = do "get data" m
async let y: text = do "use {x}" m
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });
});
