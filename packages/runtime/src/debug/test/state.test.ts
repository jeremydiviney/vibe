import { describe, test, expect } from 'bun:test';
import {
  createDebugState,
  setBreakpoints,
  clearBreakpoints,
  shouldPauseAtLocation,
  pauseExecution,
  resumeExecution,
  setStepMode,
  getCurrentLocation,
  getStackTrace,
  getScopes,
  getVariables,
} from '../state';
import { createInitialState } from '../../runtime/state';
import { parse } from '../../parser/parse';

describe('Debug State', () => {
  describe('createDebugState', () => {
    test('creates initial debug state', () => {
      const state = createDebugState();

      expect(state.running).toBe(false);
      expect(state.paused).toBe(false);
      expect(state.pausedAt).toBeNull();
      expect(state.stopReason).toBeNull();
      expect(state.stepMode).toBe('none');
      expect(state.breakpoints.size).toBe(0);
    });

    test('creates debug state with stopOnEntry', () => {
      const state = createDebugState({ stopOnEntry: true });

      expect(state.paused).toBe(true);
      expect(state.stopReason).toBe('entry');
    });
  });

  describe('setBreakpoints', () => {
    test('sets breakpoints for a file', () => {
      const debugState = createDebugState();
      const result = setBreakpoints(debugState, '/test/file.vibe', [5, 10, 15]);

      expect(result.breakpoints).toHaveLength(3);
      expect(result.breakpoints[0]).toEqual({
        id: 1,
        file: '/test/file.vibe',
        line: 5,
        verified: true,
        condition: undefined,
      });
      expect(result.breakpoints[1].line).toBe(10);
      expect(result.breakpoints[2].line).toBe(15);
    });

    test('sets breakpoints with conditions', () => {
      const debugState = createDebugState();
      const result = setBreakpoints(
        debugState,
        '/test/file.vibe',
        [5, 10],
        ['x > 5', undefined]
      );

      expect(result.breakpoints[0].condition).toBe('x > 5');
      expect(result.breakpoints[1].condition).toBeUndefined();
    });

    test('replaces breakpoints for same file', () => {
      let debugState = createDebugState();

      const result1 = setBreakpoints(debugState, '/test/file.vibe', [5, 10]);
      debugState = result1.debugState;

      const result2 = setBreakpoints(debugState, '/test/file.vibe', [20]);

      expect(result2.breakpoints).toHaveLength(1);
      expect(result2.breakpoints[0].line).toBe(20);
    });

    test('handles multiple files', () => {
      let debugState = createDebugState();

      const result1 = setBreakpoints(debugState, '/test/a.vibe', [5]);
      debugState = result1.debugState;

      const result2 = setBreakpoints(debugState, '/test/b.vibe', [10]);
      debugState = result2.debugState;

      expect(debugState.breakpoints.size).toBe(2);
    });
  });

  describe('clearBreakpoints', () => {
    test('clears breakpoints for a file', () => {
      let debugState = createDebugState();
      const result = setBreakpoints(debugState, '/test/file.vibe', [5, 10]);
      debugState = result.debugState;

      debugState = clearBreakpoints(debugState, '/test/file.vibe');

      expect(debugState.breakpoints.get('/test/file.vibe')).toBeUndefined();
    });
  });

  describe('shouldPauseAtLocation', () => {
    test('returns true when hitting a breakpoint', () => {
      let debugState = createDebugState();
      const result = setBreakpoints(debugState, '/test/file.vibe', [5]);
      debugState = result.debugState;

      const runtimeState = createInitialState(parse('let x = 1'));

      const { shouldPause, reason } = shouldPauseAtLocation(
        debugState,
        runtimeState,
        { file: '/test/file.vibe', line: 5, column: 1 }
      );

      expect(shouldPause).toBe(true);
      expect(reason).toBe('breakpoint');
    });

    test('returns false when no breakpoint', () => {
      let debugState = createDebugState();
      const result = setBreakpoints(debugState, '/test/file.vibe', [5]);
      debugState = result.debugState;

      const runtimeState = createInitialState(parse('let x = 1'));

      const { shouldPause } = shouldPauseAtLocation(
        debugState,
        runtimeState,
        { file: '/test/file.vibe', line: 10, column: 1 }
      );

      expect(shouldPause).toBe(false);
    });

    test('returns true in step mode', () => {
      let debugState = createDebugState();
      debugState = setStepMode(debugState, 'into');

      const runtimeState = createInitialState(parse('let x = 1'));

      const { shouldPause, reason } = shouldPauseAtLocation(
        debugState,
        runtimeState,
        { file: '/test/file.vibe', line: 1, column: 1 }
      );

      expect(shouldPause).toBe(true);
      expect(reason).toBe('step');
    });
  });

  describe('pauseExecution', () => {
    test('pauses execution at location', () => {
      const debugState = createDebugState();
      const location = { file: '/test/file.vibe', line: 5, column: 1 };

      const newState = pauseExecution(debugState, location, 'breakpoint');

      expect(newState.running).toBe(false);
      expect(newState.paused).toBe(true);
      expect(newState.pausedAt).toEqual(location);
      expect(newState.stopReason).toBe('breakpoint');
      expect(newState.stepMode).toBe('none');
    });
  });

  describe('resumeExecution', () => {
    test('resumes execution', () => {
      let debugState = createDebugState({ stopOnEntry: true });
      debugState = pauseExecution(
        debugState,
        { file: '/test/file.vibe', line: 1, column: 1 },
        'entry'
      );

      const newState = resumeExecution(debugState);

      expect(newState.running).toBe(true);
      expect(newState.paused).toBe(false);
      expect(newState.pausedAt).toBeNull();
      expect(newState.stopReason).toBeNull();
    });
  });

  describe('setStepMode', () => {
    test('sets step into mode', () => {
      const debugState = createDebugState();
      const newState = setStepMode(debugState, 'into');

      expect(newState.stepMode).toBe('into');
      expect(newState.running).toBe(true);
      expect(newState.paused).toBe(false);
    });

    test('sets step over mode', () => {
      const debugState = createDebugState();
      const newState = setStepMode(debugState, 'over');

      expect(newState.stepMode).toBe('over');
    });

    test('sets step out mode', () => {
      const debugState = createDebugState();
      const newState = setStepMode(debugState, 'out');

      expect(newState.stepMode).toBe('out');
    });
  });
});

describe('Stack Trace', () => {
  test('gets stack trace from runtime state', () => {
    const code = `
function foo() {
  return 1
}
foo()
`;
    const ast = parse(code);
    const runtimeState = createInitialState(ast);

    const { stackFrames, totalFrames } = getStackTrace(runtimeState);

    expect(totalFrames).toBeGreaterThan(0);
    expect(stackFrames.length).toBe(totalFrames);
  });
});

describe('Scopes and Variables', () => {
  test('gets scopes for a frame', () => {
    const code = 'let x = 1';
    const ast = parse(code);
    const runtimeState = createInitialState(ast);
    const debugState = createDebugState();

    const { scopes } = getScopes(debugState, runtimeState, 0);

    expect(scopes.length).toBeGreaterThan(0);
    expect(scopes.some(s => s.type === 'local')).toBe(true);
  });

  test('gets variables from scope reference', () => {
    const code = 'let x = 42';
    const ast = parse(code);
    let runtimeState = createInitialState(ast);

    // Run one step to create the variable
    const { runUntilPause } = require('../../runtime/step');
    runtimeState = runUntilPause(runtimeState);

    let debugState = createDebugState();
    const { debugState: ds, scopes } = getScopes(debugState, runtimeState, 0);
    debugState = ds;

    const localScope = scopes.find(s => s.type === 'local');
    if (localScope) {
      const { variables } = getVariables(debugState, runtimeState, localScope.variablesReference);

      // Should have variables from the runtime state
      expect(Array.isArray(variables)).toBe(true);
    }
  });
});

describe('VibeValue Debug Display', () => {
  const { createVibeValue, createVibeError } = require('../../runtime/types');

  test('displays VibeValue with error indicator', () => {
    const code = 'let x = 1';
    const ast = parse(code);
    let runtimeState = createInitialState(ast);

    // Manually inject a VibeValue with error into the runtime state
    const vibeValueWithError = createVibeError('Division by zero', { line: 1, column: 1, file: 'test.vibe' });
    runtimeState.callStack[0].locals['errorVar'] = vibeValueWithError;

    let debugState = createDebugState();
    const { debugState: ds, scopes } = getScopes(debugState, runtimeState, 0);
    debugState = ds;

    const localScope = scopes.find(s => s.type === 'local');
    expect(localScope).toBeDefined();

    const { variables } = getVariables(debugState, runtimeState, localScope!.variablesReference);

    const errorVar = variables.find(v => v.name === 'errorVar');
    expect(errorVar).toBeDefined();
    expect(errorVar!.hasError).toBe(true);
    expect(errorVar!.errorMessage).toContain('Division by zero');
    expect(errorVar!.value).toContain('error');
  });

  test('displays VibeValue with toolCalls indicator', () => {
    const code = 'let x = 1';
    const ast = parse(code);
    let runtimeState = createInitialState(ast);

    // Manually inject a VibeValue with toolCalls into the runtime state
    const vibeValueWithToolCalls = createVibeValue('result', {
      toolCalls: [
        { toolName: 'readFile', args: { path: '/test.txt' }, result: 'content', err: false, errDetails: null, duration: 100 },
        { toolName: 'writeFile', args: { path: '/out.txt' }, result: 'ok', err: false, errDetails: null, duration: 50 },
      ],
    });
    runtimeState.callStack[0].locals['aiResult'] = vibeValueWithToolCalls;

    let debugState = createDebugState();
    const { debugState: ds, scopes } = getScopes(debugState, runtimeState, 0);
    debugState = ds;

    const localScope = scopes.find(s => s.type === 'local');
    expect(localScope).toBeDefined();

    const { variables } = getVariables(debugState, runtimeState, localScope!.variablesReference);

    const aiResultVar = variables.find(v => v.name === 'aiResult');
    expect(aiResultVar).toBeDefined();
    expect(aiResultVar!.hasToolCalls).toBe(true);
    expect(aiResultVar!.toolCallCount).toBe(2);
  });

  test('expands VibeValue to show value, err, and toolCalls', () => {
    const code = 'let x = 1';
    const ast = parse(code);
    let runtimeState = createInitialState(ast);

    // Create a VibeValue with both error and toolCalls (edge case)
    const complexVibeValue = {
      value: 'partial result',
      err: true,
      errDetails: { message: 'Partial failure', type: 'Error', location: null },
      toolCalls: [
        { toolName: 'fetch', args: { url: 'http://example.com' }, result: null, err: true, errDetails: { message: 'timeout' }, duration: 5000 },
      ],
      isConst: false,
      typeAnnotation: null,
      source: 'ai' as const,
    };
    runtimeState.callStack[0].locals['complexVar'] = complexVibeValue;

    let debugState = createDebugState();
    const { debugState: ds, scopes } = getScopes(debugState, runtimeState, 0);
    debugState = ds;

    const localScope = scopes.find(s => s.type === 'local');
    const { debugState: ds2, variables } = getVariables(debugState, runtimeState, localScope!.variablesReference);

    const complexVar = variables.find(v => v.name === 'complexVar');
    expect(complexVar).toBeDefined();
    expect(complexVar!.variablesReference).toBeGreaterThan(0); // Should be expandable

    // Expand the VibeValue
    const { variables: expandedVars } = getVariables(ds2, runtimeState, complexVar!.variablesReference);

    expect(expandedVars.some(v => v.name === 'value')).toBe(true);
    expect(expandedVars.some(v => v.name === 'err')).toBe(true);
    expect(expandedVars.some(v => v.name === 'errDetails')).toBe(true);  // errDetails contains the error info
    expect(expandedVars.some(v => v.name === 'toolCalls')).toBe(true);

    const errVar = expandedVars.find(v => v.name === 'err');
    expect(errVar!.value).toBe('true');  // err is now a boolean 'true' string
    expect(errVar!.type).toBe('boolean');

    const errDetailsVar = expandedVars.find(v => v.name === 'errDetails');
    expect(errDetailsVar!.hasError).toBe(true);
    expect(errDetailsVar!.value).toContain('Partial failure');

    const toolCallsVar = expandedVars.find(v => v.name === 'toolCalls');
    expect(toolCallsVar!.hasToolCalls).toBe(true);
    expect(toolCallsVar!.value).toContain('Array(1)');
  });

  test('displays regular value without error/toolCalls indicators', () => {
    const code = 'let x = 1';
    const ast = parse(code);
    let runtimeState = createInitialState(ast);

    // Manually inject a regular VibeValue
    const regularValue = createVibeValue(42);
    runtimeState.callStack[0].locals['num'] = regularValue;

    let debugState = createDebugState();
    const { debugState: ds, scopes } = getScopes(debugState, runtimeState, 0);
    debugState = ds;

    const localScope = scopes.find(s => s.type === 'local');
    const { variables } = getVariables(debugState, runtimeState, localScope!.variablesReference);

    const numVar = variables.find(v => v.name === 'num');
    expect(numVar).toBeDefined();
    expect(numVar!.hasError).toBe(false);
    expect(numVar!.hasToolCalls).toBe(false);
    expect(numVar!.value).toContain('42');
  });
});
