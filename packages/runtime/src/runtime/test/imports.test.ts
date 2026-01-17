import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../../parser/parse';
import { createInitialState } from '../state';
import { loadImports } from '../modules';
import { runUntilPause, step } from '../step';
import { resumeWithAIResponse, resumeWithImportedTsResult } from '../state';
import { Runtime } from '../index';
import { resolveValue } from '../types';

// Get the package root directory (relative to this test file)
// src/runtime/test -> runtime -> src -> runtime (package root)
const packageRoot = join(import.meta.dir, '..', '..', '..');

// Helper to load and run a vibe script with imports
async function loadAndRun(
  relativePath: string,
  aiResponses: Record<string, string> = {}
): Promise<{ state: Awaited<ReturnType<typeof loadImports>>; result: unknown }> {
  const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', relativePath);
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

  return { state, result: resolveValue(state.lastResult) };
}

describe('Runtime - TypeScript Imports', () => {
  test('can import and call TypeScript functions', async () => {
    const { state, result } = await loadAndRun('ts-import/main.vibe');

    expect(state.status).toBe('completed');
    // The last statement is product = multiply(4, 7) = 28
    expect(result).toBe(28);
  });

  test('imported TS functions are registered in state', async () => {
    const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'ts-import', 'main.vibe');
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
    // {name} is left as reference in vibe expression
    const { state, result } = await loadAndRun('vibe-import/main.vibe', {
      'Say hello to {name}': 'Hello, Alice!',
    });

    expect(state.status).toBe('completed');
    expect(result).toBe('Hello, Alice!');
  });

  test('imported Vibe functions are registered in state', async () => {
    const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'vibe-import', 'main.vibe');
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
    const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'nested-import', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    state = await loadImports(state, scriptPath);

    // formatGreeting should be imported
    expect(state.importedNames['formatGreeting']).toBeDefined();
    expect(state.importedNames['formatGreeting'].sourceType).toBe('vibe');

    // The helper.vibe's TS import (formatName) should be loaded in tsModules
    const helperPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'nested-import', 'helper.vibe');
    const utilsPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'nested-import', 'utils.ts');
    expect(state.tsModules[utilsPath]).toBeDefined();
  });
});

describe('Runtime - Import Error Detection', () => {
  test('detects circular dependency when modules import each other', async () => {
    // a.vibe imports from b.vibe and b.vibe imports from a.vibe
    // This creates a circular dependency
    const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'cycle-detection', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    await expect(loadImports(state, scriptPath)).rejects.toThrow(/Circular dependency/);
  });

  test('detects circular dependency in import chain', async () => {
    // main.vibe -> b.vibe -> a.vibe -> b.vibe (cycle!)
    const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'pure-cycle', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    await expect(loadImports(state, scriptPath)).rejects.toThrow(/Circular dependency/);
  });
});

describe('Runtime - Runtime class with imports', () => {
  test('Runtime.run() loads imports automatically', async () => {
    const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'ts-import', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);

    const runtime = new Runtime(
      ast,
      {
        execute: async (prompt: string) => ({ value: 'mock' }),
        generateCode: async (prompt: string) => ({ value: 'mock' }),
        askUser: async (prompt: string) => 'mock',
      },
      { basePath: scriptPath }
    );

    const result = await runtime.run();
    expect(result).toBe(28);
  });
});

describe('Runtime - TypeScript Boolean Imports', () => {
  test('can import TS boolean constant and use in if condition', async () => {
    const { state, result } = await loadAndRun('ts-boolean/main.vibe');

    expect(state.status).toBe('completed');
    expect(result).toBe('enabled');

    const enabled = state.callStack[0].locals['enabled'];
    expect(enabled.value).toBe(true);
    expect(enabled.typeAnnotation).toBe('boolean');
  });

  test('imported TS boolean constant is registered', async () => {
    const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'ts-boolean', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    state = await loadImports(state, scriptPath);

    expect(state.importedNames['FEATURE_ENABLED']).toBeDefined();
    expect(state.importedNames['FEATURE_ENABLED'].sourceType).toBe('ts');
  });

  test('can import TS function returning boolean and use in if condition', async () => {
    const { state, result } = await loadAndRun('ts-boolean/use-constant.vibe');

    expect(state.status).toBe('completed');
    expect(result).toBe('not empty');

    // Verify boolean variables were assigned correctly
    const check1 = state.callStack[0].locals['check1'];
    expect(check1.value).toBe(true);
    expect(check1.typeAnnotation).toBe('boolean');

    const check2 = state.callStack[0].locals['check2'];
    expect(check2.value).toBe(true);
    expect(check2.typeAnnotation).toBe('boolean');

    // Verify if conditions worked
    expect(state.callStack[0].locals['result1'].value).toBe('passed');
    expect(state.callStack[0].locals['result2'].value).toBe('not empty');
  });
});

describe('Runtime - Module Scope Isolation', () => {
  test('imported function sees its own module globals, not caller globals', async () => {
    // main.vibe has const x = "MAIN"
    // moduleA.vibe has const x = "A" and exports getX() which returns x
    // When main calls getX(), it should return "A", not "MAIN"
    const { state, result } = await loadAndRun('module-isolation/main.vibe');

    expect(state.status).toBe('completed');
    expect(result).toBe('A');  // From moduleA's global, not main's
  });

  test('different modules with same variable name are isolated', async () => {
    // main-b.vibe has const x = "MAIN"
    // moduleB.vibe has const x = "B" and exports getX() which returns x
    // When main calls getX(), it should return "B"
    const { state, result } = await loadAndRun('module-isolation/main-b.vibe');

    expect(state.status).toBe('completed');
    expect(result).toBe('B');  // From moduleB's global
  });

  test('nested imports maintain correct scope isolation', async () => {
    // main.vibe imports from file2 and file3
    // file2.vibe imports from file3
    // Each has its own x variable
    //
    // Expected results:
    // - getB() returns "B" (file2's x)
    // - getC() returns "C" (file3's x)
    // - getCTwice() returns "CC" (file3's x + x)
    // - getBAndC() returns "BC" (file2's x + getC() which returns file3's x)
    // - Final result: "B" + "C" + "CC" + "BC" = "BCCCBC"
    const { state, result } = await loadAndRun('nested-isolation/main.vibe');

    expect(state.status).toBe('completed');

    // Verify individual results
    expect(state.callStack[0].locals['resultB'].value).toBe('B');
    expect(state.callStack[0].locals['resultC'].value).toBe('C');
    expect(state.callStack[0].locals['resultCC'].value).toBe('CC');
    expect(state.callStack[0].locals['resultBC'].value).toBe('BC');

    // Verify final combined result from locals
    expect(state.callStack[0].locals['result'].value).toBe('BCCCBC');
  });

  test('module globals are stored in vibeModules', async () => {
    const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'module-isolation', 'main.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    state = await loadImports(state, scriptPath);

    // Check that moduleA has its globals
    const moduleAPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'module-isolation', 'moduleA.vibe');
    const moduleA = state.vibeModules[moduleAPath];
    expect(moduleA).toBeDefined();
    expect(moduleA.globals).toBeDefined();
    expect(moduleA.globals['x']).toBeDefined();
    expect(moduleA.globals['x'].value).toBe('A');
    expect(moduleA.globals['x'].isConst).toBe(true);
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
    const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'ts-variables', 'import-type-mismatch.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    state = await loadImports(state, scriptPath);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toMatch(/expected text \(string\)/);
  });

  test('throws error when calling non-function import', async () => {
    const scriptPath = join(packageRoot, 'tests', 'fixtures', 'imports', 'ts-variables', 'call-non-function.vibe');
    const source = readFileSync(scriptPath, 'utf-8');
    const ast = parse(source);
    let state = createInitialState(ast);

    state = await loadImports(state, scriptPath);
    state = runUntilPause(state);

    expect(state.status).toBe('error');
    expect(state.error).toBe('TypeError: Cannot call non-function');
  });
});
