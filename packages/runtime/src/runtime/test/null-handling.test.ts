import { describe, it, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../../semantic/analyzer';
import { createInitialState, resumeWithTsResult } from '../state';
import { runUntilPause } from '../step';
import { isVibeValue } from '../types';

const analyzer = new SemanticAnalyzer();

function getErrors(source: string): string[] {
  const ast = parse(source);
  return analyzer.analyze(ast, source).map((e) => e.message);
}

describe('Null Handling', () => {
  describe('null literal parsing', () => {
    it('parses null as a literal value', () => {
      const ast = parse('let x: text = null');
      expect(ast.body[0].type).toBe('LetDeclaration');
      const decl = ast.body[0] as { initializer: { type: string } };
      expect(decl.initializer.type).toBe('NullLiteral');
    });

    it('parses null in expressions', () => {
      const ast = parse('let x: text = null\nlet y = x == null');
      expect(ast.body.length).toBe(2);
    });
  });

  describe('semantic validation for null assignments', () => {
    it('rejects const with null initializer', () => {
      const errors = getErrors('const x = null');
      expect(errors.some(e => e.includes('Cannot initialize const with null'))).toBe(true);
    });

    it('rejects const with typed null initializer', () => {
      const errors = getErrors('const x: text = null');
      expect(errors.some(e => e.includes('Cannot initialize const with null'))).toBe(true);
    });

    it('rejects let without type annotation when initialized with null', () => {
      const errors = getErrors('let x = null');
      expect(errors.some(e => e.includes('Cannot infer type from null'))).toBe(true);
    });

    it('accepts let with type annotation initialized with null', () => {
      const errors = getErrors('let x: text = null');
      expect(errors.filter(e => e.includes('null'))).toEqual([]);
    });

    it('accepts let with json type initialized with null', () => {
      const errors = getErrors('let x: json = null');
      expect(errors.filter(e => e.includes('null'))).toEqual([]);
    });
  });

  describe('null in runtime operations', () => {
    it('evaluates null literal to null', () => {
      const ast = parse('let x: text = null');
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['x'].value).toBe(null);
    });

    it('allows reassigning typed variable to null', () => {
      const ast = parse(`
        let x: text = "hello"
        x = null
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['x'].value).toBe(null);
    });

    it('compares null with == correctly', () => {
      const ast = parse(`
        let x: text = null
        let isNull = x == null
        let isNotNull = x != null
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['isNull'].value).toBe(true);
      expect(state.callStack[0].locals['isNotNull'].value).toBe(false);
    });

    it('string concatenation with null coerces null to empty string', () => {
      const ast = parse(`
        let x: text = null
        let result1 = "hello " + x
        let result2 = x + " world"
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['result1'].value).toBe('hello ');
      expect(state.callStack[0].locals['result2'].value).toBe(' world');
    });

    it('arithmetic with null creates error VibeValue', () => {
      const ast = parse(`
        let x: number = null
        let result = x + 5
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      const result = state.callStack[0].locals['result'];
      expect(isVibeValue(result)).toBe(true);
      expect(result.err).not.toBe(null);
      expect(result.err?.message).toContain('null');
    });

    it('subtraction with null creates error', () => {
      const ast = parse(`
        let x: number = null
        let result = 10 - x
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      const result = state.callStack[0].locals['result'];
      expect(result.err).not.toBe(null);
    });

    it('multiplication with null creates error', () => {
      const ast = parse(`
        let x: number = null
        let result = x * 5
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      const result = state.callStack[0].locals['result'];
      expect(result.err).not.toBe(null);
    });

    it('unary minus on null creates error', () => {
      const ast = parse(`
        let x: number = null
        let result = -x
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      const result = state.callStack[0].locals['result'];
      expect(result.err).not.toBe(null);
      expect(result.err?.message).toContain('null');
    });

    it('logical operators treat null as falsy', () => {
      const ast = parse(`
        let x: text = null
        let andResult = x and true
        let orResult = x or "default"
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['andResult'].value).toBe(false);
      expect(state.callStack[0].locals['orResult'].value).toBe(true);
    });
  });

  describe('JS interop - undefined to null normalization', () => {
    it('normalizes ts block undefined return to null', () => {
      const ast = parse(`
        let result = ts() { return undefined }
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('awaiting_ts');

      // Resume with undefined from TS
      state = resumeWithTsResult(state, undefined);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['result'].value).toBe(null);
    });

    it('preserves actual null from ts block', () => {
      const ast = parse(`
        let result = ts() { return null }
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('awaiting_ts');

      state = resumeWithTsResult(state, null);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['result'].value).toBe(null);
    });

    it('preserves other values from ts block', () => {
      const ast = parse(`
        let result = ts() { return 42 }
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('awaiting_ts');

      state = resumeWithTsResult(state, 42);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['result'].value).toBe(42);
    });
  });
});
