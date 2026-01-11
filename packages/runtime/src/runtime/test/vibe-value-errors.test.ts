import { describe, it, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, resumeWithAIResponse } from '../state';
import { runUntilPause } from '../step';
import { createVibeValue, createVibeError, isVibeValue, propagateErrors } from '../types';
import type { VibeValue, VibeError } from '../types';

// Helper to run with mock AI response
function runWithMockAI(
  state: ReturnType<typeof createInitialState>,
  response: unknown
) {
  state = runUntilPause(state);
  while (state.status === 'awaiting_ai') {
    state = resumeWithAIResponse(state, response);
    state = runUntilPause(state);
  }
  return state;
}

describe('VibeValue Error Handling', () => {
  describe('createVibeError', () => {
    it('creates VibeValue with error from string', () => {
      const vibeValue = createVibeError('Something went wrong');

      expect(isVibeValue(vibeValue)).toBe(true);
      expect(vibeValue.err).not.toBe(null);
      expect(vibeValue.err?.message).toBe('Something went wrong');
      expect(vibeValue.err?.type).toBe('Error');
      expect(vibeValue.value).toBe(null);  // Error values have null, not undefined
    });

    it('creates VibeValue with error from Error object', () => {
      const error = new TypeError('Invalid type');
      const vibeValue = createVibeError(error);

      expect(vibeValue.err?.message).toBe('Invalid type');
      expect(vibeValue.err?.type).toBe('TypeError');
    });

    it('preserves location in error', () => {
      const location = { line: 10, column: 5, file: 'test.vibe' };
      const vibeValue = createVibeError('Error', location);

      expect(vibeValue.err?.location).toEqual(location);
    });

    it('preserves options like isConst and typeAnnotation', () => {
      const vibeValue = createVibeError('Error', null, {
        isConst: true,
        typeAnnotation: 'text',
      });

      expect(vibeValue.isConst).toBe(true);
      expect(vibeValue.typeAnnotation).toBe('text');
    });
  });

  describe('propagateErrors', () => {
    it('returns first error when left operand has error', () => {
      const leftError = createVibeError('Left failed');
      const rightValue = createVibeValue(42);

      const result = propagateErrors([leftError, rightValue], 0);

      expect(result.err).not.toBe(null);
      expect(result.err?.message).toBe('Left failed');
      expect(result.value).toBe(null);  // Error propagation uses null, not undefined
    });

    it('returns first error when right operand has error', () => {
      const leftValue = createVibeValue(42);
      const rightError = createVibeError('Right failed');

      const result = propagateErrors([leftValue, rightError], 0);

      expect(result.err).not.toBe(null);
      expect(result.err?.message).toBe('Right failed');
    });

    it('returns first error when both operands have errors', () => {
      const leftError = createVibeError('Left failed');
      const rightError = createVibeError('Right failed');

      const result = propagateErrors([leftError, rightError], 0);

      // First error wins
      expect(result.err?.message).toBe('Left failed');
    });

    it('creates successful value when no errors', () => {
      const left = createVibeValue(10);
      const right = createVibeValue(20);

      const result = propagateErrors([left, right], 30);

      expect(result.err).toBe(null);
      expect(result.value).toBe(30);
    });

    it('handles mix of VibeValue and primitives', () => {
      const vibeVal = createVibeValue(10);
      const primitive = 20;

      const result = propagateErrors([vibeVal, primitive], 30);

      expect(result.err).toBe(null);
      expect(result.value).toBe(30);
    });
  });

  describe('.err property access', () => {
    it('.err returns null for successful AI response', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "get something" m default
        let error = result.err
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'success');

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['error'].value).toBe(null);
    });

    it('.err is accessible on any VibeValue variable', () => {
      const ast = parse(`
        let x = "hello"
        let error = x.err
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['error'].value).toBe(null);
    });

    it('.err is accessible on numeric VibeValue', () => {
      const ast = parse(`
        let x = 42
        let error = x.err
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['error'].value).toBe(null);
    });

    it('.err is accessible on boolean VibeValue', () => {
      const ast = parse(`
        let x = true
        let error = x.err
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['error'].value).toBe(null);
    });

    it('.err is accessible on object VibeValue', () => {
      const ast = parse(`
        let x = { name: "test" }
        let error = x.err
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['error'].value).toBe(null);
    });

    it('.err is accessible on array VibeValue', () => {
      const ast = parse(`
        let x = [1, 2, 3]
        let error = x.err
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['error'].value).toBe(null);
    });
  });

  describe('.toolCalls property access', () => {
    it('.toolCalls returns empty array for non-AI values', () => {
      const ast = parse(`
        let x = "hello"
        let calls = x.toolCalls
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('completed');
      const calls = state.callStack[0].locals['calls'].value;
      expect(Array.isArray(calls)).toBe(true);
      expect(calls).toHaveLength(0);
    });

    it('.toolCalls returns empty array for simple AI response', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "get something" m default
        let calls = result.toolCalls
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'response');

      expect(state.status).toBe('completed');
      const calls = state.callStack[0].locals['calls'].value;
      expect(Array.isArray(calls)).toBe(true);
      expect(calls).toHaveLength(0);
    });
  });

  describe('error propagation in binary operations', () => {
    it('addition propagates error from left operand', () => {
      // This tests the error propagation plumbing in step.ts binary_op case
      // When VibeValue with .err is used in binary operation, error should propagate
      const leftError: VibeValue = {
        value: null,
        err: { message: 'Left error', type: 'Error', location: null },
        toolCalls: [],
        isConst: false,
        typeAnnotation: null,
        source: null,
      };
      const rightValue: VibeValue = {
        value: 5,
        err: null,
        toolCalls: [],
        isConst: false,
        typeAnnotation: null,
        source: null,
      };

      const result = propagateErrors([leftError, rightValue], null);
      expect(result.err?.message).toBe('Left error');
    });

    it('subtraction propagates error from right operand', () => {
      const leftValue: VibeValue = {
        value: 10,
        err: null,
        toolCalls: [],
        isConst: false,
        typeAnnotation: null,
        source: null,
      };
      const rightError: VibeValue = {
        value: null,
        err: { message: 'Right error', type: 'Error', location: null },
        toolCalls: [],
        isConst: false,
        typeAnnotation: null,
        source: null,
      };

      const result = propagateErrors([leftValue, rightError], null);
      expect(result.err?.message).toBe('Right error');
    });

    it('first error wins when both operands have errors', () => {
      const leftError: VibeValue = {
        value: null,
        err: { message: 'First error', type: 'Error', location: null },
        toolCalls: [],
        isConst: false,
        typeAnnotation: null,
        source: null,
      };
      const rightError: VibeValue = {
        value: null,
        err: { message: 'Second error', type: 'Error', location: null },
        toolCalls: [],
        isConst: false,
        typeAnnotation: null,
        source: null,
      };

      const result = propagateErrors([leftError, rightError], null);
      expect(result.err?.message).toBe('First error');
    });
  });

  describe('VibeValue structure', () => {
    it('createVibeValue creates proper structure', () => {
      const vibeValue = createVibeValue('hello', {
        isConst: true,
        typeAnnotation: 'text',
        source: 'ai',
      });

      expect(vibeValue.value).toBe('hello');
      expect(vibeValue.err).toBe(null);
      expect(vibeValue.toolCalls).toEqual([]);
      expect(vibeValue.isConst).toBe(true);
      expect(vibeValue.typeAnnotation).toBe('text');
      expect(vibeValue.source).toBe('ai');
    });

    it('createVibeValue with toolCalls', () => {
      const toolCalls = [
        { toolName: 'test', args: {}, result: 'ok', error: null, duration: 100 },
      ];
      const vibeValue = createVibeValue('result', { toolCalls });

      expect(vibeValue.toolCalls).toHaveLength(1);
      expect(vibeValue.toolCalls[0].toolName).toBe('test');
    });

    it('isVibeValue correctly identifies VibeValue objects', () => {
      const vibeValue = createVibeValue('test');
      const notVibeValue = { value: 'test' };
      const primitive = 'test';

      expect(isVibeValue(vibeValue)).toBe(true);
      expect(isVibeValue(notVibeValue)).toBe(false);
      expect(isVibeValue(primitive)).toBe(false);
      expect(isVibeValue(null)).toBe(false);
      expect(isVibeValue(undefined)).toBe(false);
    });
  });

  describe('error type preservation', () => {
    it('preserves TypeError', () => {
      const error = new TypeError('Not a function');
      const vibeValue = createVibeError(error);

      expect(vibeValue.err?.type).toBe('TypeError');
      expect(vibeValue.err?.message).toBe('Not a function');
    });

    it('preserves ReferenceError', () => {
      const error = new ReferenceError('x is not defined');
      const vibeValue = createVibeError(error);

      expect(vibeValue.err?.type).toBe('ReferenceError');
      expect(vibeValue.err?.message).toBe('x is not defined');
    });

    it('preserves RangeError', () => {
      const error = new RangeError('Invalid array length');
      const vibeValue = createVibeError(error);

      expect(vibeValue.err?.type).toBe('RangeError');
    });

    it('preserves custom error types', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const error = new CustomError('Custom problem');
      const vibeValue = createVibeError(error);

      expect(vibeValue.err?.type).toBe('CustomError');
      expect(vibeValue.err?.message).toBe('Custom problem');
    });
  });

  describe('error location tracking', () => {
    it('includes file, line, and column in error location', () => {
      const location = {
        line: 42,
        column: 10,
        file: 'my-script.vibe',
      };
      const vibeValue = createVibeError('Error occurred', location);

      expect(vibeValue.err?.location).toEqual({
        line: 42,
        column: 10,
        file: 'my-script.vibe',
      });
    });

    it('handles null location gracefully', () => {
      const vibeValue = createVibeError('Error occurred', null);

      expect(vibeValue.err?.location).toBe(null);
    });
  });

  describe('TypeScript block error handling', () => {
    it('ts block runtime error throws TsBlockError', async () => {
      // Import Runtime and TsBlockError dynamically for this test
      const { Runtime, TsBlockError } = await import('../index');

      const mockProvider = {
        async execute() {
          return { value: 'response' };
        },
        async generateCode() {
          return { value: 'code' };
        },
        async askUser(): Promise<string> {
          return 'input';
        },
      };

      const ast = parse(`
        let result = ts() { throw new Error("ts block error") }
      `);
      const runtime = new Runtime(ast, mockProvider);

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        expect((error as Error).message).toContain('ts block error');
      }
    });

    it('ts block can catch its own errors and return normally', async () => {
      const { Runtime } = await import('../index');

      const mockProvider = {
        async execute() {
          return { value: 'response' };
        },
        async generateCode() {
          return { value: 'code' };
        },
        async askUser(): Promise<string> {
          return 'input';
        },
      };

      const ast = parse(`
        let result = ts() {
          try {
            throw new Error("caught error")
          } catch (e) {
            return { success: false, error: e.message }
          }
        }
      `);
      const runtime = new Runtime(ast, mockProvider);
      await runtime.run();

      const result = runtime.getValue('result') as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toBe('caught error');
    });

    it('ts block TypeError is wrapped in TsBlockError', async () => {
      const { Runtime, TsBlockError } = await import('../index');

      const mockProvider = {
        async execute() {
          return { value: 'response' };
        },
        async generateCode() {
          return { value: 'code' };
        },
        async askUser(): Promise<string> {
          return 'input';
        },
      };

      const ast = parse(`
        let result = ts() {
          const obj = null
          return obj.property
        }
      `);
      const runtime = new Runtime(ast, mockProvider);

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        // TsBlockError wraps the original error
        const tsError = error as InstanceType<typeof TsBlockError>;
        expect(tsError.originalError).toBeDefined();
      }
    });

    it('ts block can return error info as a value', async () => {
      // This demonstrates the Go-style pattern where errors are returned, not thrown
      const { Runtime } = await import('../index');

      const mockProvider = {
        async execute() {
          return { value: 'response' };
        },
        async generateCode() {
          return { value: 'code' };
        },
        async askUser(): Promise<string> {
          return 'input';
        },
      };

      const ast = parse(`
        let mayFail = ts() {
          try {
            // Simulating an operation that might fail
            const data = JSON.parse("invalid json {")
            return { value: data, err: null }
          } catch (e) {
            return { value: null, err: e.message }
          }
        }
      `);
      const runtime = new Runtime(ast, mockProvider);
      await runtime.run();

      const result = runtime.getValue('mayFail') as { value: unknown; err: string | null };
      expect(result.value).toBe(null);
      expect(result.err).toContain('JSON');
    });
  });
});
