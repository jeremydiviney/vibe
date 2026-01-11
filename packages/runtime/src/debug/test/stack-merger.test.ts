import { describe, test, expect } from 'bun:test';
import {
  createDebugExecutionContext,
  enterTsBlock,
  enterTsImport,
  exitTsMode,
  incrementTsCallDepth,
  decrementTsCallDepth,
  mergeStackFrames,
  shouldReturnToVibe,
} from '../stack-merger';
import type { StackFrame } from '@vibe-lang/debug-core';

describe('Debug Execution Context', () => {
  describe('createDebugExecutionContext', () => {
    test('creates initial context in Vibe mode', () => {
      const context = createDebugExecutionContext();

      expect(context.mode).toBe('vibe');
      expect(context.tsCallDepth).toBe(0);
      expect(context.vibeCallDepthOnTsEntry).toBe(0);
      expect(context.currentTsBlockId).toBeNull();
      expect(context.currentTsImport).toBeNull();
    });
  });

  describe('enterTsBlock', () => {
    test('switches to TS mode for ts block', () => {
      let context = createDebugExecutionContext();
      context = enterTsBlock(context, 'ts_block_1', 3);

      expect(context.mode).toBe('typescript');
      expect(context.tsCallDepth).toBe(1);
      expect(context.vibeCallDepthOnTsEntry).toBe(3);
      expect(context.currentTsBlockId).toBe('ts_block_1');
      expect(context.currentTsImport).toBeNull();
    });
  });

  describe('enterTsImport', () => {
    test('switches to TS mode for imported function', () => {
      let context = createDebugExecutionContext();
      context = enterTsImport(context, 'myTsFunction', 2);

      expect(context.mode).toBe('typescript');
      expect(context.tsCallDepth).toBe(1);
      expect(context.vibeCallDepthOnTsEntry).toBe(2);
      expect(context.currentTsBlockId).toBeNull();
      expect(context.currentTsImport).toBe('myTsFunction');
    });
  });

  describe('exitTsMode', () => {
    test('returns to Vibe mode', () => {
      let context = createDebugExecutionContext();
      context = enterTsBlock(context, 'ts_block_1', 3);
      context = exitTsMode(context);

      expect(context.mode).toBe('vibe');
      expect(context.tsCallDepth).toBe(0);
      expect(context.vibeCallDepthOnTsEntry).toBe(0);
      expect(context.currentTsBlockId).toBeNull();
    });
  });

  describe('incrementTsCallDepth', () => {
    test('increments call depth', () => {
      let context = createDebugExecutionContext();
      context = enterTsBlock(context, 'ts_block_1', 2);
      context = incrementTsCallDepth(context);

      expect(context.tsCallDepth).toBe(2);
    });
  });

  describe('decrementTsCallDepth', () => {
    test('decrements call depth', () => {
      let context = createDebugExecutionContext();
      context = enterTsBlock(context, 'ts_block_1', 2);
      context = incrementTsCallDepth(context); // depth = 2
      context = decrementTsCallDepth(context);

      expect(context.tsCallDepth).toBe(1);
      expect(context.mode).toBe('typescript');
    });

    test('exits TS mode when depth reaches zero', () => {
      let context = createDebugExecutionContext();
      context = enterTsBlock(context, 'ts_block_1', 2);
      context = decrementTsCallDepth(context); // depth = 0

      expect(context.mode).toBe('vibe');
      expect(context.tsCallDepth).toBe(0);
    });
  });
});

describe('Stack Frame Merging', () => {
  const vibeFrames: StackFrame[] = [
    { id: 0, name: 'main', source: { file: '/app.vibe', line: 1, column: 1 }, isVibeCode: true },
    { id: 1, name: 'helper', source: { file: '/app.vibe', line: 10, column: 1 }, isVibeCode: true },
  ];

  const tsFrames: StackFrame[] = [
    { id: 0, name: 'tsFunc', source: { file: '/utils.ts', line: 5, column: 1 }, isVibeCode: false },
    { id: 1, name: 'innerTs', source: { file: '/utils.ts', line: 15, column: 1 }, isVibeCode: false },
  ];

  describe('mergeStackFrames', () => {
    test('returns only Vibe frames in Vibe mode', () => {
      const context = createDebugExecutionContext();
      const merged = mergeStackFrames(vibeFrames, tsFrames, context);

      expect(merged.length).toBe(2);
      expect(merged.every(f => f.origin === 'vibe')).toBe(true);
    });

    test('merges TS and Vibe frames in TS mode', () => {
      let context = createDebugExecutionContext();
      context = enterTsBlock(context, 'ts_block_1', 1);

      const merged = mergeStackFrames(vibeFrames, tsFrames, context);

      // TS frames on top, then Vibe frames
      expect(merged.length).toBeGreaterThan(0);
      expect(merged[0].origin).toBe('typescript');
      expect(merged[1].origin).toBe('typescript');
    });

    test('assigns sequential IDs to merged frames', () => {
      let context = createDebugExecutionContext();
      context = enterTsBlock(context, 'ts_block_1', 0);

      const merged = mergeStackFrames(vibeFrames, tsFrames, context);

      merged.forEach((frame, index) => {
        expect(frame.id).toBe(index);
      });
    });
  });
});

describe('shouldReturnToVibe', () => {
  test('returns true when TS call depth is zero', () => {
    let context = createDebugExecutionContext();
    context = enterTsBlock(context, 'ts_block_1', 2);

    expect(shouldReturnToVibe(context, 0)).toBe(true);
  });

  test('returns false when TS call depth is positive', () => {
    let context = createDebugExecutionContext();
    context = enterTsBlock(context, 'ts_block_1', 2);

    expect(shouldReturnToVibe(context, 2)).toBe(false);
  });

  test('returns false in Vibe mode', () => {
    const context = createDebugExecutionContext();

    expect(shouldReturnToVibe(context, 0)).toBe(false);
  });
});
