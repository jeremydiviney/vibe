import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { Runtime, AIProvider, TsBlockError } from '../index';
import * as path from 'path';

// Mock AI provider for testing
function createMockProvider(): AIProvider {
  return {
    async execute() {
      return { value: 'ai response' };
    },
    async generateCode() {
      return { value: 'generated code' };
    },
    async askUser(): Promise<string> {
      return 'user input';
    },
  };
}

describe('TypeScript Error Location Tracking', () => {
  const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures/imports/ts-error-handling');
  const mainVibePath = path.join(fixtureDir, 'main.vibe');

  describe('Imported TS function errors', () => {
    test('error includes Vibe source location (line and column)', async () => {
      // Parse a simple vibe file that calls a throwing function
      const vibeCode = `
import { alwaysThrows } from "./helpers.ts"
let result = alwaysThrows()
`;
      const ast = parse(vibeCode, { file: 'test.vibe' });
      const runtime = new Runtime(ast, createMockProvider(), { basePath: mainVibePath });

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        const tsError = error as TsBlockError;

        // Check Vibe location is present
        expect(tsError.location).toBeDefined();
        expect(tsError.location?.line).toBe(3); // Line 3: let result = alwaysThrows()
        expect(tsError.location?.file).toBe('test.vibe');
      }
    });

    test('error includes original TS stack trace with file path', async () => {
      const vibeCode = `
import { alwaysThrows } from "./helpers.ts"
let result = alwaysThrows()
`;
      const ast = parse(vibeCode, { file: 'test.vibe' });
      const runtime = new Runtime(ast, createMockProvider(), { basePath: mainVibePath });

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        const tsError = error as TsBlockError;

        // Check original error has stack trace
        expect(tsError.originalError).toBeDefined();
        expect(tsError.originalError.stack).toBeDefined();

        // Stack trace should reference the actual .ts file
        expect(tsError.originalError.stack).toContain('helpers.ts');
      }
    });

    test('error stack trace includes TS line number', async () => {
      const vibeCode = `
import { alwaysThrows } from "./helpers.ts"
let result = alwaysThrows()
`;
      const ast = parse(vibeCode, { file: 'test.vibe' });
      const runtime = new Runtime(ast, createMockProvider(), { basePath: mainVibePath });

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        const tsError = error as TsBlockError;

        // Stack trace should include line number from helpers.ts
        // The alwaysThrows function throws on line 8
        const stack = tsError.originalError.stack ?? '';
        // Stack trace format: "at alwaysThrows (path/helpers.ts:8:9)"
        expect(stack).toMatch(/helpers\.ts:\d+/);
      }
    });

    test('format() shows both Vibe location and TS stack trace', async () => {
      const vibeCode = `
import { alwaysThrows } from "./helpers.ts"
let result = alwaysThrows()
`;
      const ast = parse(vibeCode, { file: 'test.vibe' });
      const runtime = new Runtime(ast, createMockProvider(), { basePath: mainVibePath });

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        const tsError = error as TsBlockError;
        const formatted = tsError.format();

        // Should include Vibe location
        expect(formatted).toContain('[test.vibe:3:');

        // Should include the error message
        expect(formatted).toContain('alwaysThrows');

        // Should include TS stack trace
        expect(formatted).toContain('TypeScript stack trace:');
        expect(formatted).toContain('helpers.ts');
      }
    });

    test('nested TS function calls show full stack trace', async () => {
      const vibeCode = `
import { outerFunction } from "./helpers.ts"
let result = outerFunction()
`;
      const ast = parse(vibeCode, { file: 'test.vibe' });
      const runtime = new Runtime(ast, createMockProvider(), { basePath: mainVibePath });

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        const tsError = error as TsBlockError;
        const stack = tsError.originalError.stack ?? '';

        // Stack should show the nested calls: deepFunction -> innerFunction -> outerFunction
        expect(stack).toContain('deepFunction');
        expect(stack).toContain('innerFunction');
        expect(stack).toContain('outerFunction');
      }
    });

    test('RangeError from TS preserves error type', async () => {
      const vibeCode = `
import { validatePositive } from "./helpers.ts"
let result = validatePositive(-5)
`;
      const ast = parse(vibeCode, { file: 'test.vibe' });
      const runtime = new Runtime(ast, createMockProvider(), { basePath: mainVibePath });

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        const tsError = error as TsBlockError;

        // Original error type should be preserved
        expect(tsError.originalError).toBeInstanceOf(RangeError);
        expect(tsError.originalError.message).toContain('-5');
      }
    });

    test('TypeError from TS includes stack with line info', async () => {
      const vibeCode = `
import { accessNullProperty } from "./helpers.ts"
let result = accessNullProperty()
`;
      const ast = parse(vibeCode, { file: 'test.vibe' });
      const runtime = new Runtime(ast, createMockProvider(), { basePath: mainVibePath });

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        const tsError = error as TsBlockError;

        // Should be a TypeError
        expect(tsError.originalError).toBeInstanceOf(TypeError);
        // Stack should point to helpers.ts
        expect(tsError.originalError.stack).toContain('helpers.ts');
      }
    });
  });

  describe('Inline ts block errors', () => {
    test('inline ts block error includes Vibe location', async () => {
      const vibeCode = `let result = ts() { throw new Error("inline error") }`;
      const ast = parse(vibeCode, { file: 'inline.vibe' });
      const runtime = new Runtime(ast, createMockProvider());

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        const tsError = error as TsBlockError;

        // Should have Vibe location
        expect(tsError.location).toBeDefined();
        expect(tsError.location?.line).toBe(1);
        expect(tsError.location?.file).toBe('inline.vibe');
      }
    });

    test('inline ts block format() shows location and stack', async () => {
      const vibeCode = `let result = ts() { throw new TypeError("type error") }`;
      const ast = parse(vibeCode, { file: 'inline.vibe' });
      const runtime = new Runtime(ast, createMockProvider());

      try {
        await runtime.run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TsBlockError);
        const tsError = error as TsBlockError;
        const formatted = tsError.format();

        // Should have location prefix
        expect(formatted).toContain('[inline.vibe:1:');
        // Should have stack trace section
        expect(formatted).toContain('TypeScript stack trace:');
      }
    });
  });
});
