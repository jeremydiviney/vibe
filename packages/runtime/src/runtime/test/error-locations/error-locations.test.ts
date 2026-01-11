import { describe, expect, test } from 'bun:test';
import { resolve, dirname } from 'path';
import { parse } from '../../../parser/parse';
import { Runtime, type AIProvider } from '../../index';
import { loadImports } from '../../modules';
import { createInitialState } from '../../state';
import { runUntilPause } from '../../step';

const testDir = dirname(import.meta.path);

// Mock AI provider for testing
const mockProvider: AIProvider = {
  execute: async () => ({ value: '' }),
  generateCode: async () => ({ value: '' }),
  askUser: async () => '',
};

describe('Runtime Error Locations with File Paths', () => {
  test('error in main file shows correct file and line', async () => {
    const filePath = resolve(testDir, 'main-error.vibe');
    const source = await Bun.file(filePath).text();
    const ast = parse(source, { file: filePath });

    const runtime = new Runtime(ast, mockProvider, { basePath: filePath });

    try {
      await runtime.run();
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      const err = e as Error & { location?: { line: number; column: number; file?: string } };
      expect(err.location).toBeDefined();
      expect(err.location?.line).toBe(3); // let bad: boolean = "not a boolean"
      expect(err.location?.file).toBe(filePath);
    }
  });

  test('error in imported file shows correct file and line', async () => {
    const mainPath = resolve(testDir, 'main-import-error.vibe');
    const source = await Bun.file(mainPath).text();
    const ast = parse(source, { file: mainPath });

    // Load imports
    let state = createInitialState(ast);
    state = await loadImports(state, mainPath);

    // Run until error
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toContain('expected number');

    // Check the error object has the correct location
    const err = state.errorObject as Error & { location?: { line: number; column: number; file?: string } };
    expect(err).toBeDefined();
    expect(err.location).toBeDefined();
    expect(err.location?.line).toBe(3); // let invalid: number = "not a number"
    expect(err.location?.file).toBe('./utils/helper.vibe');
  });

  test('error format() includes file path', async () => {
    const filePath = resolve(testDir, 'main-error.vibe');
    const source = await Bun.file(filePath).text();
    const ast = parse(source, { file: filePath });

    const runtime = new Runtime(ast, mockProvider, { basePath: filePath });

    try {
      await runtime.run();
      expect.unreachable('Should have thrown');
    } catch (e) {
      const err = e as Error & { format?: () => string };
      expect(err.format).toBeDefined();
      const formatted = err.format!();
      // Should include file path and line number
      expect(formatted).toContain(filePath);
      expect(formatted).toContain(':3:');
    }
  });
});
