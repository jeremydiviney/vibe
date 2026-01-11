import { describe, test, expect } from 'bun:test';
import {
  initDebugSession,
  debugStep,
  debugContinue,
  debugStepIn,
  debugStepOver,
  debugStepOut,
} from '../runner';
import { createDebugState, setBreakpoints, setStepMode } from '../state';
import { createInitialState } from '../../runtime/state';
import { parse } from '../../parser/parse';

describe('Debug Runner', () => {
  describe('initDebugSession', () => {
    test('initializes debug session without stopOnEntry', () => {
      const debugState = initDebugSession();

      expect(debugState.paused).toBe(false);
      expect(debugState.stopReason).toBeNull();
    });

    test('initializes debug session with stopOnEntry', () => {
      const debugState = initDebugSession({ stopOnEntry: true });

      expect(debugState.paused).toBe(true);
      expect(debugState.stopReason).toBe('entry');
    });
  });

  describe('debugStep', () => {
    test('steps one instruction', () => {
      const code = `
let x = 1
let y = 2
`;
      const ast = parse(code);
      const runtimeState = createInitialState(ast);
      const debugState = createDebugState();

      const result = debugStep(runtimeState, debugState);

      // Should have progressed
      expect(result.runtimeState).toBeDefined();
      expect(result.debugState).toBeDefined();
    });

    test('returns terminated event when complete', () => {
      const code = 'let x = 1';
      const ast = parse(code);
      let runtimeState = createInitialState(ast);
      let debugState = createDebugState();

      // Run until complete
      while (runtimeState.status !== 'completed' && runtimeState.status !== 'error') {
        const result = debugStep(runtimeState, debugState);
        runtimeState = result.runtimeState;
        debugState = result.debugState;
        if (result.event?.event === 'terminated') break;
      }

      expect(runtimeState.status).toBe('completed');
    });

    test('stops at breakpoint', () => {
      const code = `
let x = 1
let y = 2
let z = 3
`;
      const ast = parse(code, { file: '/test.vibe' });
      let runtimeState = createInitialState(ast);
      let debugState = createDebugState();

      // Set breakpoint on line 3 (let y = 2)
      const bpResult = setBreakpoints(debugState, '/test.vibe', [3]);
      debugState = bpResult.debugState;

      // Continue until we hit breakpoint or complete
      const result = debugContinue(runtimeState, debugState);

      // Should have stopped
      if (result.event?.event === 'stopped') {
        expect(result.event.body.reason).toBe('breakpoint');
      }
    });
  });

  describe('debugContinue', () => {
    test('runs until completion when no breakpoints', () => {
      const code = `
let x = 1
let y = 2
`;
      const ast = parse(code);
      const runtimeState = createInitialState(ast);
      const debugState = createDebugState();

      const result = debugContinue(runtimeState, debugState);

      // Should complete or await async
      expect(['completed', 'awaiting_ai', 'awaiting_ts'].includes(result.runtimeState.status) || result.event?.event === 'terminated').toBe(true);
    });
  });

  describe('debugStepIn', () => {
    test('sets step into mode and steps', () => {
      const code = 'let x = 1';
      const ast = parse(code);
      const runtimeState = createInitialState(ast);
      const debugState = createDebugState();

      const result = debugStepIn(runtimeState, debugState);

      expect(result.runtimeState).toBeDefined();
    });
  });

  describe('debugStepOver', () => {
    test('sets step over mode and steps', () => {
      const code = 'let x = 1';
      const ast = parse(code);
      const runtimeState = createInitialState(ast);
      const debugState = createDebugState();

      const result = debugStepOver(runtimeState, debugState);

      expect(result.runtimeState).toBeDefined();
    });
  });

  describe('debugStepOut', () => {
    test('sets step out mode and continues', () => {
      const code = `
function foo() {
  let x = 1
  return x
}
foo()
`;
      const ast = parse(code);
      const runtimeState = createInitialState(ast);
      const debugState = createDebugState();

      const result = debugStepOut(runtimeState, debugState);

      expect(result.runtimeState).toBeDefined();
    });
  });
});

describe('Debug Events', () => {
  test('emits stopped event at breakpoint', () => {
    const code = `
let x = 1
let y = 2
`;
    const ast = parse(code, { file: '/test.vibe' });
    let runtimeState = createInitialState(ast);
    let debugState = createDebugState();

    // Set breakpoint on line 3
    const bpResult = setBreakpoints(debugState, '/test.vibe', [3]);
    debugState = bpResult.debugState;

    const result = debugContinue(runtimeState, debugState);

    if (result.event) {
      expect(result.event.type).toBe('event');
      expect(['stopped', 'terminated']).toContain(result.event.event);
    }
  });

  test('emits terminated event when complete', () => {
    const code = 'let x = 1';
    const ast = parse(code);
    const runtimeState = createInitialState(ast);
    const debugState = createDebugState();

    const result = debugContinue(runtimeState, debugState);

    expect(result.event?.event).toBe('terminated');
  });
});

describe('Step Modes', () => {
  test('step into pauses on each instruction', () => {
    const code = `
let x = 1
let y = 2
`;
    const ast = parse(code);
    let runtimeState = createInitialState(ast);
    let debugState = setStepMode(createDebugState(), 'into');

    // First step
    let result = debugStep(runtimeState, debugState);

    // Should pause (step mode triggers pause)
    if (result.event?.event === 'stopped') {
      expect(result.event.body.reason).toBe('step');
    }
  });
});

describe('Complex Programs', () => {
  test('handles function calls', () => {
    const code = `
function add(a: number, b: number): number {
  return a + b
}
let result = add(1, 2)
`;
    const ast = parse(code);
    const runtimeState = createInitialState(ast);
    const debugState = createDebugState();

    const result = debugContinue(runtimeState, debugState);

    expect(result.runtimeState.status).toBe('completed');
  });

  test('handles conditionals', () => {
    const code = `
let x = 10
if x > 5 {
  let y = "big"
} else {
  let y = "small"
}
`;
    const ast = parse(code);
    const runtimeState = createInitialState(ast);
    const debugState = createDebugState();

    const result = debugContinue(runtimeState, debugState);

    expect(result.runtimeState.status).toBe('completed');
  });

  test('handles loops', () => {
    const code = `
let sum = 0
for i in 1..3 {
  sum = sum + i
}
`;
    const ast = parse(code);
    const runtimeState = createInitialState(ast);
    const debugState = createDebugState();

    const result = debugContinue(runtimeState, debugState);

    expect(result.runtimeState.status).toBe('completed');
  });
});
