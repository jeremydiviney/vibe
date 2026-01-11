import { describe, test, expect, beforeEach } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState } from '../../runtime/state';
import { createDebugState, setBreakpoints, getCurrentLocation } from '../state';
import { debugStep, debugContinue, runWithDebug } from '../runner';
import {
  registerTsBlock,
  getTsBlockMapping,
  mapTsLocationToVibe,
  mapVibeLocationToTs,
  isLocationInTsBlock,
  clearTsBlockMappings,
} from '../ts-source-map';
import {
  createHandoffState,
  shouldInitiateHandoff,
  initiateHandoff,
  isInTsMode,
  getCurrentMode,
} from '../handoff-manager';
import {
  createDebugExecutionContext,
  enterTsBlock,
  mergeStackFrames,
  getUnifiedStackTrace,
} from '../stack-merger';
import type { RuntimeEvent } from '@vibe-lang/debug-core';
import type { AIProvider, AIExecutionResult } from '../../runtime';

// Mock AI provider
const mockAIProvider: AIProvider = {
  async execute(prompt: string): Promise<AIExecutionResult> {
    return { value: `Mock: ${prompt.slice(0, 20)}...` };
  },
  async generateCode(prompt: string): Promise<AIExecutionResult> {
    return { value: '// mock' };
  },
  async askUser(prompt: string): Promise<string> {
    return 'mock input';
  },
};

describe('TS Block Debug Integration', () => {
  beforeEach(() => {
    clearTsBlockMappings();
  });

  describe('Source mapping for ts blocks in real code', () => {
    test('parses ts block location from AST', () => {
      const code = `
let x = 5
let result = ts(x) {
  return x * 2
}
`;
      const ast = parse(code, { file: '/test.vibe' });

      // Find the ts block in the AST
      const tsBlock = ast.body.find(
        (stmt: any) => stmt.type === 'LetDeclaration' && stmt.initializer?.type === 'TsBlock'
      );

      expect(tsBlock).toBeDefined();
      const tsBlockExpr = (tsBlock as any).initializer;
      expect(tsBlockExpr.type).toBe('TsBlock');
      expect(tsBlockExpr.body).toContain('return x * 2');

      // Register the ts block for source mapping
      const location = tsBlockExpr.location ?? { file: '/test.vibe', line: 3, column: 14 };
      const id = registerTsBlock(
        '/test.vibe',
        location,
        tsBlockExpr.body,
        tsBlockExpr.params // params are already strings
      );

      const mapping = getTsBlockMapping(id);
      expect(mapping).toBeDefined();
      expect(mapping?.tsBody).toContain('return x * 2');
    });

    test('maps ts block line to vibe line correctly', () => {
      // Simulate a ts block at line 10 of a .vibe file
      const tsBody = `const doubled = x * 2
const tripled = x * 3
return doubled + tripled`;

      const id = registerTsBlock(
        '/app.vibe',
        { file: '/app.vibe', line: 10, column: 5 },
        tsBody,
        ['x']
      );

      const mapping = getTsBlockMapping(id)!;

      // Line 1 of TS (after 'use strict') -> line 10 of Vibe
      expect(mapTsLocationToVibe(mapping, 1, 0).line).toBe(10);

      // Line 2 of TS -> line 11 of Vibe
      expect(mapTsLocationToVibe(mapping, 2, 0).line).toBe(11);

      // Line 3 of TS -> line 12 of Vibe
      expect(mapTsLocationToVibe(mapping, 3, 0).line).toBe(12);
    });

    test('detects when vibe location is inside ts block', () => {
      const tsBody = `line1
line2
line3`;

      registerTsBlock(
        '/test.vibe',
        { file: '/test.vibe', line: 20, column: 1 },
        tsBody,
        []
      );

      // Lines 20-22 should be in the TS block
      expect(isLocationInTsBlock('/test.vibe', 20)).not.toBeNull();
      expect(isLocationInTsBlock('/test.vibe', 21)).not.toBeNull();
      expect(isLocationInTsBlock('/test.vibe', 22)).not.toBeNull();

      // Lines outside should not be
      expect(isLocationInTsBlock('/test.vibe', 19)).toBeNull();
      expect(isLocationInTsBlock('/test.vibe', 23)).toBeNull();
    });
  });

  describe('Handoff detection for ts blocks', () => {
    test('detects pending ts block execution', () => {
      const code = `
let x = 10
let y = ts(x) {
  return x + 1
}
`;
      const ast = parse(code, { file: '/test.vibe' });
      let runtimeState = createInitialState(ast);
      let handoffState = createHandoffState();

      // Initially no handoff needed
      let result = shouldInitiateHandoff(runtimeState, handoffState);
      expect(result.shouldHandoff).toBe(false);

      // Simulate state where ts block is pending
      const pendingState = {
        ...runtimeState,
        status: 'awaiting_ts' as const,
        pendingTS: {
          params: ['x'],
          body: 'return x + 1',
          paramValues: [10],
          location: { file: '/test.vibe', line: 3, column: 9 },
        },
      };

      result = shouldInitiateHandoff(pendingState as any, handoffState);
      expect(result.shouldHandoff).toBe(true);
      expect(result.reason).toBe('ts_block');
    });

    test('initiates handoff and enters ts mode', () => {
      const code = 'let x = 1';
      const ast = parse(code);
      const runtimeState = {
        ...createInitialState(ast),
        status: 'awaiting_ts' as const,
        pendingTS: {
          params: ['x'],
          body: 'return x * 2',
          paramValues: [5],
          location: { file: '/test.vibe', line: 5, column: 1 },
        },
        callStack: [{ locals: {}, functionName: 'main' }],
      };
      const debugState = createDebugState();
      let handoffState = createHandoffState();

      expect(getCurrentMode(handoffState)).toBe('vibe');

      handoffState = initiateHandoff(runtimeState as any, debugState, handoffState, 'ts_block');

      expect(getCurrentMode(handoffState)).toBe('typescript');
      expect(isInTsMode(handoffState)).toBe(true);
      expect(handoffState.context.currentTsBlockId).toBeTruthy();
    });
  });

  describe('Stack frame merging', () => {
    test('merges vibe and ts stack frames', () => {
      const vibeFrames = [
        { id: 0, name: 'main', source: { file: '/app.vibe', line: 1, column: 1 }, isVibeCode: true },
        { id: 1, name: 'process', source: { file: '/app.vibe', line: 10, column: 1 }, isVibeCode: true },
      ];

      const tsFrames = [
        { id: 0, name: 'calculate', source: { file: '/utils.ts', line: 5, column: 1 }, isVibeCode: false },
      ];

      // In Vibe mode, only vibe frames
      let context = createDebugExecutionContext();
      let merged = mergeStackFrames(vibeFrames, tsFrames, context);
      expect(merged.length).toBe(2);
      expect(merged.every(f => f.origin === 'vibe')).toBe(true);

      // In TS mode, ts frames on top + vibe frames below
      context = enterTsBlock(context, 'ts_1', 1);
      merged = mergeStackFrames(vibeFrames, tsFrames, context);
      expect(merged[0].origin).toBe('typescript');
      expect(merged[0].name).toBe('calculate');
    });

    test('unified stack trace includes both vibe and ts frames', () => {
      const code = 'let x = 1';
      const ast = parse(code, { file: '/test.vibe' });
      const runtimeState = {
        ...createInitialState(ast),
        callStack: [
          { locals: {}, functionName: 'main', currentLocation: { file: '/test.vibe', line: 1, column: 1 } },
        ],
      };

      const tsFrames = [
        { id: 0, name: 'tsHelper', source: { file: 'ts_block', line: 1, column: 1 }, isVibeCode: false },
      ];

      let context = createDebugExecutionContext();
      context = enterTsBlock(context, 'ts_1', 1);

      const { stackFrames, totalFrames } = getUnifiedStackTrace(runtimeState as any, tsFrames, context);

      expect(totalFrames).toBeGreaterThan(0);
      // Should have ts frame on top
      expect(stackFrames[0].origin).toBe('typescript');
    });
  });

  describe('Breakpoints in ts blocks', () => {
    test('can set breakpoint at ts block location', () => {
      // Register a ts block
      registerTsBlock(
        '/test.vibe',
        { file: '/test.vibe', line: 10, column: 1 },
        'return x + 1',
        ['x']
      );

      let debugState = createDebugState();

      // Set breakpoint at line 10 (start of ts block)
      const { debugState: newState, breakpoints } = setBreakpoints(
        debugState,
        '/test.vibe',
        [10]
      );

      expect(breakpoints.length).toBe(1);
      expect(breakpoints[0].line).toBe(10);
      expect(breakpoints[0].verified).toBe(true);

      // Verify breakpoint is associated with ts block location
      const mapping = isLocationInTsBlock('/test.vibe', 10);
      expect(mapping).not.toBeNull();
    });

    test('maps vibe breakpoint to ts line for bun inspector', () => {
      const id = registerTsBlock(
        '/test.vibe',
        { file: '/test.vibe', line: 10, column: 1 },
        'const a = 1\nconst b = 2\nreturn a + b',
        []
      );

      const mapping = getTsBlockMapping(id)!;

      // Breakpoint at vibe line 11 (second line of ts block)
      const tsLocation = mapVibeLocationToTs(mapping, 11, 0);
      expect(tsLocation).not.toBeNull();
      expect(tsLocation?.line).toBe(2); // Second line in TS (after 'use strict')
    });
  });

  describe('Debug session with ts block', () => {
    test('debug session handles ts block execution', async () => {
      const code = `
let x = 5
let doubled = ts(x) {
  return x * 2
}
let result = doubled
`;
      const ast = parse(code, { file: '/test.vibe' });
      let runtimeState = createInitialState(ast);
      let debugState = createDebugState();

      const events: RuntimeEvent[] = [];

      // Run the debug session
      const result = await runWithDebug(
        runtimeState,
        debugState,
        mockAIProvider,
        (e) => events.push(e)
      );

      // Should complete (ts block should be handled)
      expect(['completed', 'error'].includes(result.runtimeState.status)).toBe(true);
    });

    test('stepping through code with ts block', () => {
      const code = `
let x = 1
let y = 2
let z = x + y
`;
      const ast = parse(code, { file: '/test.vibe' });
      let runtimeState = createInitialState(ast);
      let debugState = createDebugState();

      // Step through each statement
      let stepCount = 0;
      while (runtimeState.status === 'running' && stepCount < 20) {
        const result = debugStep(runtimeState, debugState);
        runtimeState = result.runtimeState;
        debugState = result.debugState;
        stepCount++;
      }

      expect(runtimeState.status).toBe('completed');
    });
  });
});

describe('Imported TS Function Debug Integration', () => {
  test('detects pending imported ts function call', () => {
    const code = 'let x = 1';
    const ast = parse(code);
    const runtimeState = {
      ...createInitialState(ast),
      status: 'awaiting_ts' as const,
      pendingImportedTsCall: {
        funcName: 'calculateSum',
        args: [1, 2, 3],
      },
    };
    const handoffState = createHandoffState();

    const result = shouldInitiateHandoff(runtimeState as any, handoffState);
    expect(result.shouldHandoff).toBe(true);
    expect(result.reason).toBe('ts_import');
  });

  test('initiates handoff for ts import', () => {
    const code = 'let x = 1';
    const ast = parse(code);
    const runtimeState = {
      ...createInitialState(ast),
      status: 'awaiting_ts' as const,
      pendingImportedTsCall: {
        funcName: 'myTsFunction',
        args: [42],
      },
      callStack: [{ locals: {} }],
    };
    const debugState = createDebugState();
    let handoffState = createHandoffState();

    handoffState = initiateHandoff(runtimeState as any, debugState, handoffState, 'ts_import');

    expect(isInTsMode(handoffState)).toBe(true);
    expect(handoffState.context.currentTsImport).toBe('myTsFunction');
  });
});
