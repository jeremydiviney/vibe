import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../../parser/parse';
import { createInitialState } from '../state';
import { loadImports } from '../modules';
import { runUntilPause, step } from '../step';
import { resumeWithAIResponse, resumeWithImportedTsResult } from '../state';
import { Runtime } from '../index';

// Helper to load and run a vibe script with imports
async function loadAndRun(
  relativePath: string,
  aiResponses: Record<string, string> = {}
): Promise<{ state: Awaited<ReturnType<typeof loadImports>>; result: unknown }> {
  const scriptPath = join(process.cwd(), 'tests', 'fixtures', 'imports', relativePath);
  const source = readFileSync(scriptPath, 'utf-8');
  const ast = parse(source);
  let state = createInitialState(ast);

  // Load imports
  state = await loadImports(state, scriptPath);

  // Run until pause
  state = runUntilPause(state);

  // Handle any async operations
  while (state.status === 'awaiting_ai' || state.status === 'awaiting_ts') {
    if (state.status === 'awaiting_ai') {
      const response = aiResponses[state.pendingAI?.prompt ?? ''] ?? 'mock response';
      state = resumeWithAIResponse(state, response);
    } else if (state.status === 'awaiting_ts') {
      if (state.pendingImportedTsCall) {
        // Get the function from the loaded modules
        const { funcName, args } = state.pendingImportedTsCall;
        const importInfo = state.importedNames[funcName];
        if (importInfo && importInfo.sourceType === 'ts') {
          const module = state.tsModules[importInfo.source];
          const fn = module?.exports[funcName] as (...args: unknown[]) => unknown;
          const result = await fn(...args);
          state = resumeWithImportedTsResult(state, result);
        }
      }
    }
    state = runUntilPause(state);
  }

  return { state, result: state.lastResult };
}

describe('Runtime - TypeScript Imports', () => {
  test('can import and call TypeScript functions', async () => {
    const { state, result } = await loadAndRun('ts-import/main.vibe');

    expect(state.status).toBe('completed');
    // The last statement is product = multiply(4, 7) = 28
    expect(result).toBe(28);
  });

  test('imported TS functions are registered in state', async () => {
    const scriptPath = join(process.cwd(), 'tests', 'fixtures', 'imports', 'ts-import', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    state = await loadImports(state, scriptPath);

    expect(state.importedNames['add']).toBeDefined();
    expect(state.importedNames['add'].sourceType).toBe('ts');
    expect(state.importedNames['multiply']).toBeDefined();
  });
});

describe('Runtime - Vibe Imports', () => {
  test('can import and call Vibe functions', async () => {
    const { state, result } = await loadAndRun('vibe-import/main.vibe', {
      'Say hello to Alice': 'Hello, Alice!',
    });

    expect(state.status).toBe('completed');
    expect(result).toBe('Hello, Alice!');
  });

  test('imported Vibe functions are registered in state', async () => {
    const scriptPath = join(process.cwd(), 'tests', 'fixtures', 'imports', 'vibe-import', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    state = await loadImports(state, scriptPath);

    expect(state.importedNames['greet']).toBeDefined();
    expect(state.importedNames['greet'].sourceType).toBe('vibe');
  });
});

describe('Runtime - Nested Imports', () => {
  test('can handle nested imports (vibe importing ts)', async () => {
    const { state, result } = await loadAndRun('nested-import/main.vibe');

    expect(state.status).toBe('completed');
    expect(result).toBe('John Doe');
  });

  test('nested imports load all dependencies', async () => {
    const scriptPath = join(process.cwd(), 'tests', 'fixtures', 'imports', 'nested-import', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    state = await loadImports(state, scriptPath);

    // formatGreeting should be imported
    expect(state.importedNames['formatGreeting']).toBeDefined();
    expect(state.importedNames['formatGreeting'].sourceType).toBe('vibe');

    // The helper.vibe's TS import (formatName) should be loaded in tsModules
    const helperPath = join(process.cwd(), 'tests', 'fixtures', 'imports', 'nested-import', 'helper.vibe');
    const utilsPath = join(process.cwd(), 'tests', 'fixtures', 'imports', 'nested-import', 'utils.ts');
    expect(state.tsModules[utilsPath]).toBeDefined();
  });
});

describe('Runtime - Import Error Detection', () => {
  test('detects name collision when same function imported indirectly', async () => {
    // When a.vibe imports from b.vibe and b.vibe imports from a.vibe,
    // and main.vibe also imports from a.vibe, we hit a name collision
    // because funcA is imported by both main.vibe and (indirectly) b.vibe
    const scriptPath = join(process.cwd(), 'tests', 'fixtures', 'imports', 'cycle-detection', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    await expect(loadImports(state, scriptPath)).rejects.toThrow(/Import error.*already imported/);
  });

  test('detects name collision in import chain', async () => {
    // main.vibe imports funcB -> loads b.vibe
    // b.vibe imports funcA -> loads a.vibe
    // a.vibe imports funcB -> but funcB was already imported by main.vibe!
    const scriptPath = join(process.cwd(), 'tests', 'fixtures', 'imports', 'pure-cycle', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    await expect(loadImports(state, scriptPath)).rejects.toThrow(/Import error.*already imported/);
  });
});

describe('Runtime - Runtime class with imports', () => {
  test('Runtime.run() loads imports automatically', async () => {
    const scriptPath = join(process.cwd(), 'tests', 'fixtures', 'imports', 'ts-import', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);

    const runtime = new Runtime(
      ast,
      {
        execute: async (prompt: string) => 'mock',
        generateCode: async (prompt: string) => 'mock',
        askUser: async (prompt: string) => 'mock',
      },
      { basePath: scriptPath }
    );

    const result = await runtime.run();
    expect(result).toBe(28);
  });
});

describe('Runtime - TypeScript Variable Imports', () => {
  test('can import TS variable and assign to text type', async () => {
    const { state, result } = await loadAndRun('ts-variables/import-variable.vibe');

    expect(state.status).toBe('completed');
    expect(result).toBe('Hello from TypeScript');

    // Verify the variable was assigned with correct type
    const greeting = state.callStack[0].locals['greeting'];
    expect(greeting.value).toBe('Hello from TypeScript');
    expect(greeting.typeAnnotation).toBe('text');
  });

  test('can import TS object and assign to json type', async () => {
    const { state, result } = await loadAndRun('ts-variables/import-json.vibe');

    expect(state.status).toBe('completed');
    expect(result).toEqual({ name: 'test', version: '1.0' });

    // Verify the variable was assigned with correct type
    const config = state.callStack[0].locals['config'];
    expect(config.value).toEqual({ name: 'test', version: '1.0' });
    expect(config.typeAnnotation).toBe('json');
  });

  test('throws error when assigning object to text type', async () => {
    const scriptPath = join(process.cwd(), 'tests', 'fixtures', 'imports', 'ts-variables', 'import-type-mismatch.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    state = await loadImports(state, scriptPath);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toMatch(/expected text \(string\)/);
  });

  test('throws error when calling non-function import', async () => {
    const scriptPath = join(process.cwd(), 'tests', 'fixtures', 'imports', 'ts-variables', 'call-non-function.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    state = await loadImports(state, scriptPath);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toBe('TypeError: Cannot call non-function');
  });
});
