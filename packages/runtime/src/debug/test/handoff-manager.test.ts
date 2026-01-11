import { describe, test, expect, beforeEach } from 'bun:test';
import {
  createHandoffState,
  shouldInitiateHandoff,
  initiateHandoff,
  completeHandoff,
  shouldReturnControl,
  returnToVibe,
  handleTsStepIn,
  handleTsStepOut,
  getCurrentMode,
  isInTsMode,
  getSavedVibeState,
} from '../handoff-manager';
import { createDebugState } from '../state';
import { createInitialState } from '../../runtime/state';
import { parse } from '../../parser/parse';
import { clearTsBlockMappings } from '../ts-source-map';

describe('Handoff Manager', () => {
  beforeEach(() => {
    clearTsBlockMappings();
  });

  describe('createHandoffState', () => {
    test('creates initial state in Vibe mode', () => {
      const state = createHandoffState();

      expect(getCurrentMode(state)).toBe('vibe');
      expect(isInTsMode(state)).toBe(false);
      expect(state.handoffInProgress).toBe(false);
      expect(state.handoffReason).toBeNull();
    });
  });

  describe('shouldInitiateHandoff', () => {
    test('returns false for normal running state', () => {
      const ast = parse('let x = 1');
      const runtimeState = createInitialState(ast);
      const handoffState = createHandoffState();

      const result = shouldInitiateHandoff(runtimeState, handoffState);
      expect(result.shouldHandoff).toBe(false);
      expect(result.reason).toBeNull();
    });

    test('returns false if already in TS mode', () => {
      const ast = parse('let x = 1');
      const runtimeState = createInitialState(ast);
      let handoffState = createHandoffState();

      // Simulate being in TS mode
      const debugState = createDebugState();
      handoffState = initiateHandoff(
        { ...runtimeState, status: 'awaiting_ts', pendingTS: { params: [], body: 'x', paramValues: [] } } as any,
        debugState,
        handoffState,
        'ts_block'
      );

      const result = shouldInitiateHandoff(runtimeState, handoffState);
      expect(result.shouldHandoff).toBe(false);
    });
  });

  describe('initiateHandoff', () => {
    test('switches to TS mode for ts_block', () => {
      const ast = parse('let x = 1');
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingTS: {
          params: ['a'],
          body: 'return a + 1',
          paramValues: [5],
          location: { file: '/test.vibe', line: 10, column: 5 },
        },
      };
      const debugState = createDebugState();
      const handoffState = createHandoffState();

      const newState = initiateHandoff(runtimeState as any, debugState, handoffState, 'ts_block');

      expect(newState.context.mode).toBe('typescript');
      expect(newState.context.currentTsBlockId).toBeTruthy();
      expect(newState.handoffInProgress).toBe(true);
      expect(newState.handoffReason).toBe('ts_block');
      expect(newState.savedVibeState).toBe(debugState);
    });

    test('switches to TS mode for ts_import', () => {
      const ast = parse('let x = 1');
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingImportedTsCall: {
          funcName: 'calculate',
          args: [1, 2],
        },
      };
      const debugState = createDebugState();
      const handoffState = createHandoffState();

      const newState = initiateHandoff(runtimeState as any, debugState, handoffState, 'ts_import');

      expect(newState.context.mode).toBe('typescript');
      expect(newState.context.currentTsImport).toBe('calculate');
      expect(newState.handoffReason).toBe('ts_import');
    });
  });

  describe('completeHandoff', () => {
    test('marks handoff as no longer in progress', () => {
      const ast = parse('let x = 1');
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingTS: { params: [], body: 'x', paramValues: [], location: { file: '', line: 1, column: 1 } },
      };
      const debugState = createDebugState();
      let state = createHandoffState();

      state = initiateHandoff(runtimeState as any, debugState, state, 'ts_block');
      expect(state.handoffInProgress).toBe(true);

      state = completeHandoff(state);
      expect(state.handoffInProgress).toBe(false);
      // Still in TS mode though
      expect(state.context.mode).toBe('typescript');
    });
  });

  describe('shouldReturnControl', () => {
    test('returns false in Vibe mode', () => {
      const state = createHandoffState();
      expect(shouldReturnControl(state, 0)).toBe(false);
    });

    test('returns true in TS mode when call depth is zero', () => {
      const ast = parse('let x = 1');
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingTS: { params: [], body: 'x', paramValues: [], location: { file: '', line: 1, column: 1 } },
      };
      let state = createHandoffState();
      state = initiateHandoff(runtimeState as any, createDebugState(), state, 'ts_block');

      expect(shouldReturnControl(state, 0)).toBe(true);
    });

    test('returns false in TS mode when call depth is positive', () => {
      const ast = parse('let x = 1');
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingTS: { params: [], body: 'x', paramValues: [], location: { file: '', line: 1, column: 1 } },
      };
      let state = createHandoffState();
      state = initiateHandoff(runtimeState as any, createDebugState(), state, 'ts_block');

      expect(shouldReturnControl(state, 2)).toBe(false);
    });
  });

  describe('returnToVibe', () => {
    test('switches back to Vibe mode', () => {
      const ast = parse('let x = 1');
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingTS: { params: [], body: 'x', paramValues: [], location: { file: '', line: 1, column: 1 } },
      };
      let state = createHandoffState();
      state = initiateHandoff(runtimeState as any, createDebugState(), state, 'ts_block');

      state = returnToVibe(state);

      expect(state.context.mode).toBe('vibe');
      expect(state.handoffInProgress).toBe(false);
      expect(state.handoffReason).toBeNull();
      expect(state.savedVibeState).toBeNull();
    });
  });

  describe('handleTsStepIn', () => {
    test('increments TS call depth', () => {
      const ast = parse('let x = 1');
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingTS: { params: [], body: 'x', paramValues: [], location: { file: '', line: 1, column: 1 } },
      };
      let state = createHandoffState();
      state = initiateHandoff(runtimeState as any, createDebugState(), state, 'ts_block');

      expect(state.context.tsCallDepth).toBe(1);

      state = handleTsStepIn(state);
      expect(state.context.tsCallDepth).toBe(2);
    });
  });

  describe('handleTsStepOut', () => {
    test('decrements TS call depth', () => {
      const ast = parse('let x = 1');
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingTS: { params: [], body: 'x', paramValues: [], location: { file: '', line: 1, column: 1 } },
      };
      let state = createHandoffState();
      state = initiateHandoff(runtimeState as any, createDebugState(), state, 'ts_block');
      state = handleTsStepIn(state); // depth = 2

      state = handleTsStepOut(state);
      expect(state.context.tsCallDepth).toBe(1);
      expect(state.context.mode).toBe('typescript');
    });

    test('returns to Vibe mode when depth reaches zero', () => {
      const ast = parse('let x = 1');
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingTS: { params: [], body: 'x', paramValues: [], location: { file: '', line: 1, column: 1 } },
      };
      let state = createHandoffState();
      state = initiateHandoff(runtimeState as any, createDebugState(), state, 'ts_block');

      state = handleTsStepOut(state); // depth goes to 0, exits TS mode

      expect(state.context.mode).toBe('vibe');
      expect(state.context.tsCallDepth).toBe(0);
    });
  });

  describe('getSavedVibeState', () => {
    test('returns saved state after handoff', () => {
      const ast = parse('let x = 1');
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingTS: { params: [], body: 'x', paramValues: [], location: { file: '', line: 1, column: 1 } },
      };
      const debugState = createDebugState();
      let state = createHandoffState();

      state = initiateHandoff(runtimeState as any, debugState, state, 'ts_block');

      const saved = getSavedVibeState(state);
      expect(saved.debugState).toBe(debugState);
      expect(saved.runtimeState).toBeDefined();
    });
  });
});
