import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Errors - Export Validation', () => {
  // ============================================================================
  // Export let is not allowed
  // ============================================================================

  test('cannot export let variable', () => {
    const ast = parse(`
export let x = "hello"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Cannot export mutable variable 'x'. Only constants can be exported.");
  });

  test('cannot export let with type annotation', () => {
    const ast = parse(`
export let count: number = 42
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Cannot export mutable variable 'count'. Only constants can be exported.");
  });

  // ============================================================================
  // Valid exports
  // ============================================================================

  test('can export const variable', () => {
    const ast = parse(`
export const X = "hello"
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('can export const with type annotation', () => {
    const ast = parse(`
export const COUNT: number = 42
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('can export function', () => {
    const ast = parse(`
export function greet(name: text): text {
  return "Hello " + name
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('can export model', () => {
    const ast = parse(`
export model myModel = {
  name: "gpt-4",
  provider: "openai",
  apiKey: "test",
  url: "https://api.openai.com"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Multiple exports
  // ============================================================================

  test('multiple export let errors reported separately', () => {
    const ast = parse(`
export let a = 1
export let b = 2
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe("Cannot export mutable variable 'a'. Only constants can be exported.");
    expect(errors[1].message).toBe("Cannot export mutable variable 'b'. Only constants can be exported.");
  });

  test('mixed valid and invalid exports', () => {
    const ast = parse(`
export const VALID = "ok"
export let invalid = "not ok"
export function alsoValid(): text {
  return "ok"
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Cannot export mutable variable 'invalid'. Only constants can be exported.");
  });

  // ============================================================================
  // Non-exported let is still allowed
  // ============================================================================

  test('non-exported let is allowed', () => {
    const ast = parse(`
let x = "hello"
export const Y = x
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });
});
