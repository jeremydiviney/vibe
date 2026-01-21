import { describe, test, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, currentFrame } from '../state';
import { step, runUntilPause } from '../step';

// Helper to run code until completion
function runCode(code: string) {
  const ast = parse(code);
  let state = createInitialState(ast);

  while (state.status === 'running') {
    state = step(state);
  }

  return state;
}

describe('Destructuring from JSON objects', () => {
  describe('destructuring from json variable', () => {
    test('extracts fields from json variable', () => {
      const state = runCode(`
let data: json = { name: "Alice", age: 30 }
let {name: text, age: number} = data
`);
      expect(state.status).toBe('completed');
      const frame = currentFrame(state);
      expect(frame.locals['name']?.value).toBe('Alice');
      expect(frame.locals['age']?.value).toBe(30);
    });

    test('extracts fields with private modifier', () => {
      const state = runCode(`
let data: json = { category: "public", secret: "hidden" }
let {category: text, private secret: text} = data
`);
      expect(state.status).toBe('completed');
      const frame = currentFrame(state);
      expect(frame.locals['category']?.value).toBe('public');
      expect(frame.locals['secret']?.value).toBe('hidden');
      expect(frame.locals['secret']?.isPrivate).toBe(true);
    });

    test('works with nested json access', () => {
      const state = runCode(`
let data: json = { user: { name: "Bob", email: "bob@test.com" } }
let user: json = data.user
let {name: text, email: text} = user
`);
      expect(state.status).toBe('completed');
      const frame = currentFrame(state);
      expect(frame.locals['name']?.value).toBe('Bob');
      expect(frame.locals['email']?.value).toBe('bob@test.com');
    });
  });

  describe('destructuring from function returning json', () => {
    test('extracts fields from function call result', () => {
      const state = runCode(`
function getUser(): json {
  return { name: "Charlie", active: true }
}
let {name: text, active: boolean} = getUser()
`);
      expect(state.status).toBe('completed');
      const frame = currentFrame(state);
      expect(frame.locals['name']?.value).toBe('Charlie');
      expect(frame.locals['active']?.value).toBe(true);
    });

    test('works with function that takes parameters', () => {
      const state = runCode(`
function createPerson(n: text, a: number): json {
  return { name: n, age: a }
}
let {name: text, age: number} = createPerson("Diana", 25)
`);
      expect(state.status).toBe('completed');
      const frame = currentFrame(state);
      expect(frame.locals['name']?.value).toBe('Diana');
      expect(frame.locals['age']?.value).toBe(25);
    });
  });

  describe('error handling', () => {
    test('errors when destructuring non-object', () => {
      const state = runCode(`
let data = "not an object"
let {name: text} = data
`);
      expect(state.status).toBe('error');
      expect(state.error).toContain('Destructuring requires an object');
    });

    test('errors when field is missing', () => {
      const state = runCode(`
let data: json = { name: "Eve" }
let {name: text, age: number} = data
`);
      expect(state.status).toBe('error');
      expect(state.error).toContain("Missing field 'age'");
    });
  });

  describe('const vs let destructuring', () => {
    test('const destructuring creates immutable bindings', () => {
      const state = runCode(`
let data: json = { value: 10 }
const {value: number} = data
value = 20
`);
      expect(state.status).toBe('error');
      expect(state.error).toContain("Cannot assign to constant 'value'");
    });

    test('let destructuring allows reassignment', () => {
      const state = runCode(`
let data: json = { value: 10 }
let {value: number} = data
value = 20
`);
      expect(state.status).toBe('completed');
      const frame = currentFrame(state);
      expect(frame.locals['value']?.value).toBe(20);
    });
  });
});
