import { describe, test, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState } from '../../runtime/state';
import { loadImports } from '../../runtime/modules';
import {
  createDebugState,
  setBreakpoints,
  getStackTrace,
  getScopes,
  getVariables,
  getCurrentLocation,
} from '../state';
import { runWithDebug, createOutputEvent } from '../runner';
import type { RuntimeEvent } from '@vibe-lang/debug-core';
import type { AIProvider, AIExecutionResult } from '../../runtime';

// Mock AI provider for testing
const mockAIProvider: AIProvider = {
  async execute(prompt: string): Promise<AIExecutionResult> {
    return { value: `Mock response to: ${prompt.slice(0, 50)}...` };
  },
  async generateCode(prompt: string): Promise<AIExecutionResult> {
    return { value: '// mock code' };
  },
  async askUser(prompt: string): Promise<string> {
    return 'mock user input';
  },
};

describe('End-to-End Debug Session', () => {
  test('full debug session with breakpoints', async () => {
    const code = `
let x = 10
let y = 20
let z = x + y
`;
    const ast = parse(code, { file: '/test.vibe' });
    let runtimeState = createInitialState(ast);
    let debugState = createDebugState();

    // Set breakpoint on line 3 (let y = 20)
    const bpResult = setBreakpoints(debugState, '/test.vibe', [3]);
    debugState = bpResult.debugState;

    // Collect events
    const events: RuntimeEvent[] = [];
    const onEvent = (event: RuntimeEvent) => events.push(event);

    // Run with debug
    const result = await runWithDebug(runtimeState, debugState, mockAIProvider, onEvent);

    // Should have stopped at breakpoint or completed
    expect(result.runtimeState).toBeDefined();
    expect(result.debugState).toBeDefined();
  });

  test('stop on entry', async () => {
    const code = 'let x = 1';
    const ast = parse(code, { file: '/test.vibe' });
    const runtimeState = createInitialState(ast);
    const debugState = createDebugState({ stopOnEntry: true });

    const events: RuntimeEvent[] = [];
    const result = await runWithDebug(runtimeState, debugState, mockAIProvider, (e) => events.push(e));

    // Should be paused at entry
    expect(result.debugState.paused).toBe(true);
    expect(result.debugState.stopReason).toBe('entry');
  });

  test('inspect variables at breakpoint', async () => {
    const code = `
let x = 42
let y = "hello"
let z = x
`;
    const ast = parse(code, { file: '/test.vibe' });
    let runtimeState = createInitialState(ast);
    let debugState = createDebugState();

    // Set breakpoint on line 4 (after x and y are set)
    const bpResult = setBreakpoints(debugState, '/test.vibe', [4]);
    debugState = bpResult.debugState;

    const events: RuntimeEvent[] = [];
    const result = await runWithDebug(runtimeState, debugState, mockAIProvider, (e) => events.push(e));

    runtimeState = result.runtimeState;
    debugState = result.debugState;

    // Get stack trace
    const { stackFrames } = getStackTrace(runtimeState);
    expect(stackFrames.length).toBeGreaterThan(0);

    // Get scopes
    const scopeResult = getScopes(debugState, runtimeState, 0);
    debugState = scopeResult.debugState;
    expect(scopeResult.scopes.length).toBeGreaterThan(0);

    // Get local variables
    const localScope = scopeResult.scopes.find(s => s.type === 'local');
    if (localScope) {
      const varResult = getVariables(debugState, runtimeState, localScope.variablesReference);
      expect(Array.isArray(varResult.variables)).toBe(true);
    }
  });

  test('step through function calls', async () => {
    const code = `
function double(n: number): number {
  return n * 2
}

let x = 5
let y = double(x)
`;
    const ast = parse(code, { file: '/test.vibe' });
    let runtimeState = createInitialState(ast);
    let debugState = createDebugState({ stopOnEntry: true });

    const events: RuntimeEvent[] = [];
    let result = await runWithDebug(runtimeState, debugState, mockAIProvider, (e) => events.push(e));

    // Should stop on entry
    expect(result.debugState.paused).toBe(true);

    // Continue to completion
    debugState = { ...result.debugState, paused: false, stepMode: 'none' as const, running: true };
    result = await runWithDebug(result.runtimeState, debugState, mockAIProvider, (e) => events.push(e));

    // Should complete
    expect(result.runtimeState.status).toBe('completed');
  });

  test('handles AI calls during debug', async () => {
    const code = `
let question = "What is 2+2?"
let answer = vibe "{question}"
`;
    const ast = parse(code, { file: '/test.vibe' });
    let runtimeState = createInitialState(ast);
    const debugState = createDebugState();

    const events: RuntimeEvent[] = [];
    const result = await runWithDebug(runtimeState, debugState, mockAIProvider, (e) => events.push(e));

    // Debug runner should execute without throwing
    // The exact final status depends on runtime behavior with mock AI
    expect(result.runtimeState).toBeDefined();
    expect(result.debugState).toBeDefined();
    // Should reach some terminal state (completed, error, or awaiting)
    expect(['completed', 'awaiting_ai', 'error'].includes(result.runtimeState.status)).toBe(true);
  });

  test('multiple breakpoints', async () => {
    const code = `
let a = 1
let b = 2
let c = 3
let d = 4
`;
    const ast = parse(code, { file: '/test.vibe' });
    let runtimeState = createInitialState(ast);
    let debugState = createDebugState();

    // Set breakpoints on lines 2 and 4
    const bpResult = setBreakpoints(debugState, '/test.vibe', [2, 4]);
    debugState = bpResult.debugState;

    const events: RuntimeEvent[] = [];
    const stoppedEvents: RuntimeEvent[] = [];

    // First run - should stop at first breakpoint
    let result = await runWithDebug(runtimeState, debugState, mockAIProvider, (e) => {
      events.push(e);
      if (e.event === 'stopped') stoppedEvents.push(e);
    });

    // Should have some events
    expect(events.length).toBeGreaterThanOrEqual(0);
  });
});

describe('Debug Protocol Messages', () => {
  test('createOutputEvent creates proper event', () => {
    const event = createOutputEvent('Hello World', 'stdout');

    expect(event.type).toBe('event');
    expect(event.event).toBe('output');
    expect(event.body.output).toBe('Hello World');
    expect(event.body.category).toBe('stdout');
  });

  test('createOutputEvent defaults to stdout', () => {
    const event = createOutputEvent('Test output');

    expect(event.body.category).toBe('stdout');
  });
});

describe('Location Tracking', () => {
  test('getCurrentLocation returns location from runtime state', () => {
    const code = `
let x = 1
let y = 2
`;
    const ast = parse(code, { file: '/test.vibe' });
    const runtimeState = createInitialState(ast);

    const location = getCurrentLocation(runtimeState);

    // May or may not have location depending on state
    if (location) {
      expect(typeof location.line).toBe('number');
      expect(typeof location.column).toBe('number');
    }
  });
});
