// Tests for context modes: forget, verbose, compress
// These tests verify that context is correctly managed on loop/function exit

import { describe, test, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, resumeWithCompressResult } from '../state';
import { step, stepN } from '../step';
import { buildLocalContext, formatEntriesForSummarization } from '../context';
import { formatContextForAI } from '../context';
import type { RuntimeState } from '../types';

// Helper to run until pause or completion
function runUntilPause(state: RuntimeState, maxSteps = 1000): RuntimeState {
  let current = state;
  let steps = 0;
  while (current.status === 'running' && steps < maxSteps) {
    current = step(current);
    steps++;
  }
  return current;
}

describe('Context Modes - Parsing', () => {
  test('for loop with forget keyword parses correctly', () => {
    const ast = parse(`
      for i in [1, 2, 3] {
        let x = i
      } forget
    `);
    expect(ast.body[0].type).toBe('ForInStatement');
    const forStmt = ast.body[0] as { type: 'ForInStatement'; contextMode?: string };
    expect(forStmt.contextMode).toBe('forget');
  });

  test('for loop with verbose keyword parses correctly', () => {
    const ast = parse(`
      for i in [1, 2, 3] {
        let x = i
      } verbose
    `);
    const forStmt = ast.body[0] as { type: 'ForInStatement'; contextMode?: string };
    expect(forStmt.contextMode).toBe('verbose');
  });

  test('for loop with compress keyword parses correctly', () => {
    const ast = parse(`
      for i in [1, 2, 3] {
        let x = i
      } compress
    `);
    const forStmt = ast.body[0] as { type: 'ForInStatement'; contextMode?: unknown };
    expect(forStmt.contextMode).toEqual({ compress: { arg1: null, arg2: null } });
  });

  test('for loop with compress and prompt parses correctly', () => {
    const ast = parse(`
      for i in [1, 2, 3] {
        let x = i
      } compress("summarize the results")
    `);
    const forStmt = ast.body[0] as { type: 'ForInStatement'; contextMode?: unknown };
    expect(forStmt.contextMode).toEqual({ compress: { arg1: { kind: 'literal', value: 'summarize the results' }, arg2: null } });
  });

  test('while loop with forget keyword parses correctly', () => {
    const ast = parse(`
      let i = 0
      while (i < 3) {
        i = i + 1
      } forget
    `);
    const whileStmt = ast.body[1] as { type: 'WhileStatement'; contextMode?: string };
    expect(whileStmt.contextMode).toBe('forget');
  });

  test('while loop with verbose keyword parses correctly', () => {
    const ast = parse(`
      let i = 0
      while (i < 3) {
        i = i + 1
      } verbose
    `);
    const whileStmt = ast.body[1] as { type: 'WhileStatement'; contextMode?: string };
    expect(whileStmt.contextMode).toBe('verbose');
  });

  test('while loop with compress keyword parses correctly', () => {
    const ast = parse(`
      let i = 0
      while (i < 3) {
        i = i + 1
      } compress("summarize iterations")
    `);
    const whileStmt = ast.body[1] as { type: 'WhileStatement'; contextMode?: unknown };
    expect(whileStmt.contextMode).toEqual({ compress: { arg1: { kind: 'literal', value: 'summarize iterations' }, arg2: null } });
  });

  test('compress with model identifier parses correctly', () => {
    const ast = parse(`
      for i in [1, 2, 3] {
        let x = i
      } compress(myModel)
    `);
    const forStmt = ast.body[0] as { type: 'ForInStatement'; contextMode?: unknown };
    expect(forStmt.contextMode).toEqual({ compress: { arg1: { kind: 'identifier', name: 'myModel' }, arg2: null } });
  });

  test('compress with prompt literal and model identifier parses correctly', () => {
    const ast = parse(`
      for i in [1, 2, 3] {
        let x = i
      } compress("summarize", myModel)
    `);
    const forStmt = ast.body[0] as { type: 'ForInStatement'; contextMode?: unknown };
    expect(forStmt.contextMode).toEqual({
      compress: {
        arg1: { kind: 'literal', value: 'summarize' },
        arg2: { kind: 'identifier', name: 'myModel' },
      },
    });
  });

  test('compress with two identifiers parses correctly', () => {
    const ast = parse(`
      for i in [1, 2, 3] {
        let x = i
      } compress(SUMMARY_PROMPT, myModel)
    `);
    const forStmt = ast.body[0] as { type: 'ForInStatement'; contextMode?: unknown };
    expect(forStmt.contextMode).toEqual({
      compress: {
        arg1: { kind: 'identifier', name: 'SUMMARY_PROMPT' },
        arg2: { kind: 'identifier', name: 'myModel' },
      },
    });
  });

  test('loop without context mode defaults to verbose', () => {
    const ast = parse(`
      for i in [1, 2, 3] {
        let x = i
      }
    `);
    const forStmt = ast.body[0] as { type: 'ForInStatement'; contextMode?: unknown };
    expect(forStmt.contextMode).toBe('verbose');
  });
});

describe('Context Modes - Scope Markers', () => {
  test('for loop adds scope-enter marker at start', () => {
    const ast = parse(`
      let outer = "before"
      for i in [1, 2] {
        let x = i
      }
    `);
    let state = createInitialState(ast);

    // Run until we're inside the loop (after first iteration starts)
    state = stepN(state, 20);

    const context = buildLocalContext(state);
    const scopeEnter = context.find(e => e.kind === 'scope-enter');
    expect(scopeEnter).toBeDefined();
    expect(scopeEnter?.kind).toBe('scope-enter');
    if (scopeEnter?.kind === 'scope-enter') {
      expect(scopeEnter.scopeType).toBe('for');
    }
  });

  test('for loop with verbose adds scope-exit marker at end', () => {
    const ast = parse(`
      for i in [1, 2] {
        let x = i
      } verbose
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const scopeExit = context.find(e => e.kind === 'scope-exit');
    expect(scopeExit).toBeDefined();
    expect(scopeExit?.kind).toBe('scope-exit');
    if (scopeExit?.kind === 'scope-exit') {
      expect(scopeExit.scopeType).toBe('for');
    }
  });
});

describe('Context Modes - Forget Mode', () => {
  test('for loop with forget clears all loop entries on exit', () => {
    const ast = parse(`
      let outer = "before"
      for i in [1, 2] {
        let x = i
      } forget
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);

    // Should have outer and after, but no scope markers or loop variables
    const varNames = context.filter(e => e.kind === 'variable').map(e => (e as { name: string }).name);
    expect(varNames).toContain('outer');
    expect(varNames).toContain('after');

    // Should NOT have scope-enter or scope-exit markers (forget removes them)
    const scopeMarkers = context.filter(e => e.kind === 'scope-enter' || e.kind === 'scope-exit');
    expect(scopeMarkers).toHaveLength(0);
  });
});

describe('Context Modes - Verbose Mode', () => {
  test('for loop with verbose preserves all history', () => {
    const ast = parse(`
      let outer = "before"
      for i in [1, 2] {
        let x = i
      } verbose
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);

    // Should have scope markers
    const scopeEnter = context.find(e => e.kind === 'scope-enter');
    const scopeExit = context.find(e => e.kind === 'scope-exit');
    expect(scopeEnter).toBeDefined();
    expect(scopeExit).toBeDefined();

    // Should have multiple entries for i and x (each iteration)
    const iEntries = context.filter(e => e.kind === 'variable' && (e as { name: string }).name === 'i');
    const xEntries = context.filter(e => e.kind === 'variable' && (e as { name: string }).name === 'x');
    expect(iEntries.length).toBeGreaterThanOrEqual(2);
    expect(xEntries.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Context Modes - Value Snapshotting', () => {
  test('loop iterations preserve snapshotted values', () => {
    const ast = parse(`
      for i in [10, 20, 30] {
        let x = i
      } verbose
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const iEntries = context.filter(e => e.kind === 'variable' && (e as { name: string }).name === 'i');

    // Each iteration should have snapshotted the value at that time
    const iValues = iEntries.map(e => (e as { value: unknown }).value);
    expect(iValues).toContain(10);
    expect(iValues).toContain(20);
    expect(iValues).toContain(30);
  });

  test('variable reassignment creates new entry with snapshotted value', () => {
    const ast = parse(`
      let x = 1
      x = 2
      x = 3
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const xEntries = context.filter(e => e.kind === 'variable' && (e as { name: string }).name === 'x');

    // Should have 3 entries: 1, 2, 3
    expect(xEntries).toHaveLength(3);
    const xValues = xEntries.map(e => (e as { value: unknown }).value);
    expect(xValues).toEqual([1, 2, 3]);
  });
});

describe('Context Modes - Default Behavior', () => {
  test('for loop without explicit mode defaults to verbose', () => {
    const ast = parse(`
      for i in [1, 2] {
        let x = i
      }
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);

    // Default should be verbose, so scope markers should be present
    const scopeExit = context.find(e => e.kind === 'scope-exit');
    expect(scopeExit).toBeDefined();
  });

  test('while loop without explicit mode defaults to verbose', () => {
    const ast = parse(`
      let i = 0
      while (i < 2) {
        i = i + 1
      }
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);

    // Default should be verbose, so scope markers should be present
    const scopeExit = context.find(e => e.kind === 'scope-exit');
    expect(scopeExit).toBeDefined();
  });
});

describe('Context Modes - While Loop Runtime', () => {
  test('while loop with forget clears all loop entries on exit', () => {
    const ast = parse(`
      let outer = "before"
      let i = 0
      while (i < 2) {
        let x = i
        i = i + 1
      } forget
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);

    // Should have outer, i (initial), after - but no scope markers
    const varNames = context.filter(e => e.kind === 'variable').map(e => (e as { name: string }).name);
    expect(varNames).toContain('outer');
    expect(varNames).toContain('after');

    // Should NOT have scope-enter or scope-exit markers (forget removes them)
    const scopeMarkers = context.filter(e => e.kind === 'scope-enter' || e.kind === 'scope-exit');
    expect(scopeMarkers).toHaveLength(0);
  });

  test('while loop with verbose preserves all history', () => {
    const ast = parse(`
      let outer = "before"
      let i = 0
      while (i < 2) {
        i = i + 1
      } verbose
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);

    // Should have scope markers
    const scopeEnter = context.find(e => e.kind === 'scope-enter');
    const scopeExit = context.find(e => e.kind === 'scope-exit');
    expect(scopeEnter).toBeDefined();
    expect(scopeExit).toBeDefined();

    if (scopeEnter?.kind === 'scope-enter') {
      expect(scopeEnter.scopeType).toBe('while');
    }
    if (scopeExit?.kind === 'scope-exit') {
      expect(scopeExit.scopeType).toBe('while');
    }

    // Should have multiple entries for i (each iteration assignment)
    const iEntries = context.filter(e => e.kind === 'variable' && (e as { name: string }).name === 'i');
    expect(iEntries.length).toBeGreaterThanOrEqual(2);
  });

  test('while loop with compress pauses for AI summarization', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let i = 0
      while (i < 2) {
        i = i + 1
      } compress("summarize")
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // Compress pauses for AI summarization
    expect(state.status).toBe('awaiting_compress');
    expect(state.pendingCompress).toBeDefined();
    expect(state.pendingCompress?.prompt).toBe('summarize');
    expect(state.pendingCompress?.model).toBe('m');
    expect(state.pendingCompress?.scopeType).toBe('while');
  });
});

describe('Context Modes - For Loop All Modes', () => {
  test('for loop with compress pauses for AI summarization', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      for i in [1, 2] {
        let x = i
      } compress
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // Compress pauses for AI summarization (uses lastUsedModel from model declaration)
    expect(state.status).toBe('awaiting_compress');
    expect(state.pendingCompress).toBeDefined();
    expect(state.pendingCompress?.prompt).toBeNull(); // No custom prompt
    expect(state.pendingCompress?.model).toBe('m');
    expect(state.pendingCompress?.scopeType).toBe('for');
  });

  test('for loop with compress and explicit model', () => {
    const ast = parse(`
      model gpt = { name: "gpt-4", apiKey: "key1", url: "http://test1" }
      model claude = { name: "claude", apiKey: "key2", url: "http://test2" }
      for i in [1, 2] {
        let x = i
      } compress(claude)
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // Compress uses explicit model
    expect(state.status).toBe('awaiting_compress');
    expect(state.pendingCompress?.model).toBe('claude');
  });

  test('for loop with compress prompt and model', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      for i in [1, 2] {
        let x = i
      } compress("summarize results", m)
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_compress');
    expect(state.pendingCompress?.prompt).toBe('summarize results');
    expect(state.pendingCompress?.model).toBe('m');
  });
});

// Note: Function context modes are parsed but not yet applied at runtime
// because function scope handling differs from loop scope handling.
// The context mode field is available on FunctionDeclaration for future implementation.

describe('Context Modes - Formatted Output', () => {
  test('for loop verbose shows scope markers and all iterations in formatted output', () => {
    const ast = parse(`
      let outer = "before"
      for i in [1, 2] {
        let x = i
      } verbose
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    expect(formatted.text).toBe(
      `  <entry> (current scope)
    - outer (text): before
    ==> for i
    - i (number): 1
    - x (number): 1
    - i (number): 2
    - x (number): 2
    <== for i
    - after (text): done`
    );
  });

  test('for loop forget shows no loop entries in formatted output', () => {
    const ast = parse(`
      let outer = "before"
      for i in [1, 2] {
        let x = i
      } forget
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    // Should only have outer and after - no loop entries or scope markers
    expect(formatted.text).toBe(
      `  <entry> (current scope)
    - outer (text): before
    - after (text): done`
    );
  });

  test('while loop verbose shows scope markers in formatted output', () => {
    const ast = parse(`
      let count = 0
      while (count < 2) {
        count = count + 1
      } verbose
      let done = "yes"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    expect(formatted.text).toBe(
      `  <entry> (current scope)
    - count (number): 0
    ==> while
    - count (number): 1
    - count (number): 2
    <== while
    - done (text): yes`
    );
  });

  test('while loop forget shows no loop entries in formatted output', () => {
    const ast = parse(`
      let count = 0
      while (count < 2) {
        count = count + 1
      } forget
      let done = "yes"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    // Should only have initial count and done - no loop iterations or scope markers
    expect(formatted.text).toBe(
      `  <entry> (current scope)
    - count (number): 0
    - done (text): yes`
    );
  });

  test('nested loops with different modes show correct formatted output', () => {
    const ast = parse(`
      let result = 0
      for i in [1, 2] {
        for j in [10, 20] {
          result = result + 1
        } forget
      } verbose
      let final = result
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const formatted = formatContextForAI(context, { includeInstructions: false });

    // Outer loop (verbose) should show markers and i values
    // Inner loop (forget) should not show j values or its markers
    expect(formatted.text).toContain('==> for i');
    expect(formatted.text).toContain('<== for i');
    expect(formatted.text).toContain('- i (number): 1');
    expect(formatted.text).toContain('- i (number): 2');
    // Inner loop entries should be forgotten
    expect(formatted.text).not.toContain('- j');
  });
});

describe('Compress Resume Flow', () => {
  test('resumeWithCompressResult replaces entries with summary', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      for i in [1, 2, 3] {
        let x = i
      } compress
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // Should be awaiting_compress
    expect(state.status).toBe('awaiting_compress');
    expect(state.pendingCompress).toBeDefined();

    // Resume with a summary
    state = resumeWithCompressResult(state, 'Loop processed items 1, 2, 3');

    // Should be running again
    expect(state.status).toBe('running');
    expect(state.pendingCompress).toBeNull();

    // Run to completion
    state = runUntilPause(state);
    expect(state.status).toBe('completed');

    // Context should have the summary
    const context = buildLocalContext(state);
    const summaryEntry = context.find(e => e.kind === 'summary');
    expect(summaryEntry).toBeDefined();
    expect((summaryEntry as { text: string }).text).toBe('Loop processed items 1, 2, 3');
  });

  test('formatEntriesForSummarization formats entries correctly', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      for i in [1, 2] {
        let x = i * 10
      } compress
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_compress');
    const entries = state.pendingCompress?.entriesToSummarize ?? [];

    const formatted = formatEntriesForSummarization(entries);

    // Should include loop entries
    expect(formatted).toContain('for (i) started');
    expect(formatted).toContain('Variable i');
    expect(formatted).toContain('Variable x');
  });

  test('compress with empty loop skips summarization', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      for i in [] {
        let x = i
      } compress
      let after = "done"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // Empty loop should complete without awaiting compress
    expect(state.status).toBe('completed');
  });
});
