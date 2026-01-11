import { describe, test, expect, beforeEach } from 'bun:test';
import {
  createAdvancedDebugState,
  setAdvancedBreakpoint,
  removeAdvancedBreakpoint,
  getAdvancedBreakpoint,
  evaluateCondition,
  checkHitCondition,
  shouldBreakpointTrigger,
  interpolateLogMessage,
  addWatchExpression,
  removeWatchExpression,
  evaluateWatchExpressions,
  setExceptionBreakpoints,
  shouldBreakOnException,
  flushLogOutput,
} from '../advanced-features';
import { createInitialState } from '../../runtime/state';
import { parse } from '../../parser/parse';
import { runUntilPause } from '../../runtime/step';

describe('Advanced Debug Features', () => {
  describe('createAdvancedDebugState', () => {
    test('creates initial state', () => {
      const state = createAdvancedDebugState();

      expect(state.advancedBreakpoints.size).toBe(0);
      expect(state.watchExpressions).toEqual([]);
      expect(state.nextWatchId).toBe(1);
      expect(state.exceptionBreakpoints.all).toBe(false);
      expect(state.exceptionBreakpoints.uncaught).toBe(true);
      expect(state.logOutput).toEqual([]);
    });
  });

  describe('Conditional Breakpoints', () => {
    test('setAdvancedBreakpoint with condition', () => {
      let state = createAdvancedDebugState();

      const { state: newState, breakpoint } = setAdvancedBreakpoint(
        state,
        '/test.vibe',
        10,
        { condition: 'x > 5' }
      );

      expect(breakpoint.condition).toBe('x > 5');
      expect(breakpoint.line).toBe(10);
      expect(newState.advancedBreakpoints.size).toBe(1);
    });

    test('getAdvancedBreakpoint retrieves breakpoint', () => {
      let state = createAdvancedDebugState();
      const { state: newState } = setAdvancedBreakpoint(state, '/test.vibe', 15, {
        condition: 'y == 10',
      });

      const bp = getAdvancedBreakpoint(newState, '/test.vibe', 15);
      expect(bp).toBeDefined();
      expect(bp?.condition).toBe('y == 10');
    });

    test('removeAdvancedBreakpoint removes breakpoint', () => {
      let state = createAdvancedDebugState();
      const { state: state2 } = setAdvancedBreakpoint(state, '/test.vibe', 10, {});
      const newState = removeAdvancedBreakpoint(state2, '/test.vibe', 10);

      expect(getAdvancedBreakpoint(newState, '/test.vibe', 10)).toBeUndefined();
    });
  });

  describe('evaluateCondition', () => {
    test('returns true for no condition', () => {
      const ast = parse('let x = 5');
      const runtimeState = createInitialState(ast);

      expect(evaluateCondition(undefined, runtimeState)).toBe(true);
    });

    test('evaluates simple comparisons', () => {
      const ast = parse('let x = 10');
      let runtimeState = createInitialState(ast);
      runtimeState = runUntilPause(runtimeState);

      // x should be 10
      expect(evaluateCondition('x > 5', runtimeState)).toBe(true);
      expect(evaluateCondition('x < 5', runtimeState)).toBe(false);
      expect(evaluateCondition('x == 10', runtimeState)).toBe(true);
    });
  });

  describe('Hit Count Conditions', () => {
    test('checkHitCondition with >= operator', () => {
      expect(checkHitCondition('>=5', 5)).toBe(true);
      expect(checkHitCondition('>=5', 4)).toBe(false);
      expect(checkHitCondition('>=5', 10)).toBe(true);
    });

    test('checkHitCondition with == operator', () => {
      expect(checkHitCondition('==5', 5)).toBe(true);
      expect(checkHitCondition('==5', 4)).toBe(false);
      expect(checkHitCondition('=5', 5)).toBe(true);
    });

    test('checkHitCondition with modulo operator', () => {
      expect(checkHitCondition('%3', 3)).toBe(true);
      expect(checkHitCondition('%3', 6)).toBe(true);
      expect(checkHitCondition('%3', 4)).toBe(false);
    });

    test('checkHitCondition with plain number', () => {
      expect(checkHitCondition('5', 5)).toBe(true);
      expect(checkHitCondition('5', 10)).toBe(true);
      expect(checkHitCondition('5', 3)).toBe(false);
    });
  });

  describe('Logpoints', () => {
    test('setAdvancedBreakpoint with logMessage', () => {
      let state = createAdvancedDebugState();

      const { state: newState, breakpoint } = setAdvancedBreakpoint(
        state,
        '/test.vibe',
        10,
        { logMessage: 'Value is {x}' }
      );

      expect(breakpoint.logMessage).toBe('Value is {x}');
    });

    test('interpolateLogMessage replaces variables', () => {
      const ast = parse('let x = 42\nlet y = "hello"');
      let runtimeState = createInitialState(ast);
      runtimeState = runUntilPause(runtimeState);

      const message = interpolateLogMessage('x = {x}, y = {y}', runtimeState);
      expect(message).toBe('x = 42, y = hello');
    });

    test('shouldBreakpointTrigger returns logMessage for logpoint', () => {
      let state = createAdvancedDebugState();
      const { state: state2 } = setAdvancedBreakpoint(state, '/test.vibe', 2, {
        logMessage: 'Debug: {x}',
      });

      const ast = parse('let x = 100');
      let runtimeState = createInitialState(ast);
      runtimeState = runUntilPause(runtimeState);

      const result = shouldBreakpointTrigger(state2, runtimeState, {
        file: '/test.vibe',
        line: 2,
        column: 1,
      });

      expect(result.shouldBreak).toBe(false); // Logpoints don't break
      expect(result.logMessage).toBe('Debug: 100');
    });
  });

  describe('Watch Expressions', () => {
    test('addWatchExpression adds watch', () => {
      let state = createAdvancedDebugState();

      const { state: newState, watch } = addWatchExpression(state, 'x + y');

      expect(watch.expression).toBe('x + y');
      expect(watch.id).toBe(1);
      expect(newState.watchExpressions.length).toBe(1);
    });

    test('removeWatchExpression removes watch', () => {
      let state = createAdvancedDebugState();
      const { state: state2, watch } = addWatchExpression(state, 'x');
      const newState = removeWatchExpression(state2, watch.id);

      expect(newState.watchExpressions.length).toBe(0);
    });

    test('evaluateWatchExpressions evaluates all watches', () => {
      let state = createAdvancedDebugState();
      const { state: state2 } = addWatchExpression(state, 'x');
      const { state: state3 } = addWatchExpression(state2, 'y');

      const ast = parse('let x = 10\nlet y = 20');
      let runtimeState = createInitialState(ast);
      runtimeState = runUntilPause(runtimeState);

      const newState = evaluateWatchExpressions(state3, runtimeState);

      expect(newState.watchExpressions[0].lastValue).toBe('10');
      expect(newState.watchExpressions[1].lastValue).toBe('20');
    });
  });

  describe('Exception Breakpoints', () => {
    test('setExceptionBreakpoints updates config', () => {
      let state = createAdvancedDebugState();

      state = setExceptionBreakpoints(state, { all: true });
      expect(state.exceptionBreakpoints.all).toBe(true);

      state = setExceptionBreakpoints(state, { filters: ['TypeError'] });
      expect(state.exceptionBreakpoints.filters).toEqual(['TypeError']);
    });

    test('shouldBreakOnException respects all flag', () => {
      let state = createAdvancedDebugState();
      state = setExceptionBreakpoints(state, { all: true });

      expect(shouldBreakOnException(state, new Error('test'), true)).toBe(true);
      expect(shouldBreakOnException(state, new Error('test'), false)).toBe(true);
    });

    test('shouldBreakOnException respects uncaught flag', () => {
      let state = createAdvancedDebugState();
      state = setExceptionBreakpoints(state, { all: false, uncaught: true });

      expect(shouldBreakOnException(state, new Error('test'), true)).toBe(false);
      expect(shouldBreakOnException(state, new Error('test'), false)).toBe(true);
    });

    test('shouldBreakOnException respects filters', () => {
      let state = createAdvancedDebugState();
      state = setExceptionBreakpoints(state, {
        all: false,
        uncaught: false,
        filters: ['TypeError'],
      });

      expect(shouldBreakOnException(state, new TypeError('test'), true)).toBe(true);
      expect(shouldBreakOnException(state, new Error('test'), true)).toBe(false);
    });
  });

  describe('Log Output', () => {
    test('flushLogOutput returns and clears logs', () => {
      let state = createAdvancedDebugState();
      const { state: state2 } = setAdvancedBreakpoint(state, '/test.vibe', 1, {
        logMessage: 'Log 1',
      });

      const ast = parse('let x = 1');
      let runtimeState = createInitialState(ast);

      // Trigger the logpoint
      const { newState: state3 } = shouldBreakpointTrigger(state2, runtimeState, {
        file: '/test.vibe',
        line: 1,
        column: 1,
      });

      const { state: state4, logs } = flushLogOutput(state3);

      expect(logs.length).toBe(1);
      expect(logs[0]).toBe('Log 1');
      expect(state4.logOutput.length).toBe(0);
    });
  });

  describe('shouldBreakpointTrigger', () => {
    test('increments hit count', () => {
      let state = createAdvancedDebugState();
      const { state: state2 } = setAdvancedBreakpoint(state, '/test.vibe', 1, {});

      const ast = parse('let x = 1');
      const runtimeState = createInitialState(ast);
      const location = { file: '/test.vibe', line: 1, column: 1 };

      let { newState: state3 } = shouldBreakpointTrigger(state2, runtimeState, location);
      expect(getAdvancedBreakpoint(state3, '/test.vibe', 1)?.hitCount).toBe(1);

      let { newState: state4 } = shouldBreakpointTrigger(state3, runtimeState, location);
      expect(getAdvancedBreakpoint(state4, '/test.vibe', 1)?.hitCount).toBe(2);
    });

    test('respects hit condition', () => {
      let state = createAdvancedDebugState();
      const { state: state2 } = setAdvancedBreakpoint(state, '/test.vibe', 1, {
        hitCondition: '>=3',
      });

      const ast = parse('let x = 1');
      const runtimeState = createInitialState(ast);
      const location = { file: '/test.vibe', line: 1, column: 1 };

      // First two hits should not break
      let { shouldBreak: b1, newState: s1 } = shouldBreakpointTrigger(state2, runtimeState, location);
      expect(b1).toBe(false);

      let { shouldBreak: b2, newState: s2 } = shouldBreakpointTrigger(s1, runtimeState, location);
      expect(b2).toBe(false);

      // Third hit should break
      let { shouldBreak: b3 } = shouldBreakpointTrigger(s2, runtimeState, location);
      expect(b3).toBe(true);
    });
  });
});
