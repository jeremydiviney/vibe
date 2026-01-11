import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import {
  createInitialState,
  step,
  runUntilPause,
  buildLocalContext,
  buildGlobalContext,
  stepUntilCondition,
  type ContextVariable,
  type ContextEntry,
} from '../index';

// Helper to filter context entries to only variables
function getVariables(entries: ContextEntry[]): ContextVariable[] {
  return entries.filter((e): e is ContextVariable => e.kind === 'variable');
}

describe('Context Building Functions', () => {
  test('buildLocalContext returns empty array for initial state', () => {
    const ast = parse('let x = "hello"');
    const state = createInitialState(ast);

    const context = buildLocalContext(state);
    expect(context).toEqual([]);
  });

  test('buildLocalContext returns variables from current frame with frame info', () => {
    const ast = parse(`
      let x = "hello"
      const y: json = { key: "value" }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const variables = getVariables(context);
    expect(variables).toHaveLength(2);

    const xVar = variables.find((v) => v.name === 'x');
    expect(xVar).toBeDefined();
    expect(xVar?.value).toBe('hello');
    expect(xVar?.type).toBe('text'); // Inferred from string value
    expect(xVar?.frameName).toBe('<entry>');
    expect(xVar?.frameDepth).toBe(0);

    const yVar = variables.find((v) => v.name === 'y');
    expect(yVar).toBeDefined();
    expect(yVar?.value).toEqual({ key: 'value' });
    expect(yVar?.type).toBe('json');
    expect(yVar?.frameName).toBe('<entry>');
    expect(yVar?.frameDepth).toBe(0);
  });

  test('buildGlobalContext returns empty array for initial state', () => {
    const ast = parse('let x = "hello"');
    const state = createInitialState(ast);

    const context = buildGlobalContext(state);
    expect(context).toEqual([]);
  });

  test('buildGlobalContext returns variables from all frames with frame info', () => {
    const ast = parse(`
      let outer = "outer value"
      function inner(): text {
        let innerVar = "inner value"
        return innerVar
      }
      let result = inner()
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // After completion, only main frame remains
    const context = buildGlobalContext(state);
    const variables = getVariables(context);

    const outerVar = variables.find((v) => v.name === 'outer');
    expect(outerVar).toBeDefined();
    expect(outerVar?.frameName).toBe('<entry>');
    expect(outerVar?.frameDepth).toBe(0);

    const resultVar = variables.find((v) => v.name === 'result');
    expect(resultVar).toBeDefined();
    expect(resultVar?.frameName).toBe('<entry>');
    expect(resultVar?.frameDepth).toBe(0);
  });

  test('context is rebuilt before each instruction in step()', () => {
    const ast = parse(`
      let a = "first"
      let b = "second"
    `);
    let state = createInitialState(ast);

    // Initial state - context should be empty
    expect(state.localContext).toEqual([]);
    expect(state.globalContext).toEqual([]);

    // Step through until first variable is declared
    while (state.status === 'running' && !state.callStack[0]?.locals['a']) {
      state = step(state);
    }

    // After declaring 'a', step once more and context should reflect it
    state = step(state);
    expect(getVariables(state.localContext).some((v) => v.name === 'a')).toBe(true);
  });

  test('context includes correct type annotations', () => {
    const ast = parse(`
      let textVar = "hello"
      let jsonVar: json = { data: "value" }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const variables = getVariables(context);

    const textVar = variables.find((v) => v.name === 'textVar');
    expect(textVar?.type).toBe('text'); // Inferred from string value

    const jsonVar = variables.find((v) => v.name === 'jsonVar');
    expect(jsonVar?.type).toBe('json');
  });

  test('context updates correctly after variable reassignment', () => {
    const ast = parse(`
      let x = "initial"
      x = "updated"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // With snapshotting, context preserves history: both 'initial' and 'updated' entries
    const context = buildLocalContext(state);
    const xEntries = getVariables(context).filter((v) => v.name === 'x');
    expect(xEntries).toHaveLength(2);
    expect(xEntries[0]?.value).toBe('initial');
    expect(xEntries[1]?.value).toBe('updated');
  });

  test('context works with nested function calls and shows frame depth', () => {
    const ast = parse(`
      let outer = "outer"
      function getInner(): text {
        let inner = "inner"
        return inner
      }
      let result = getInner()
    `);
    let state = createInitialState(ast);

    // Run until we're inside the function (have 2 frames)
    while (state.status === 'running' && state.callStack.length < 2) {
      state = step(state);
    }

    // If we got inside the function, check global context with frame depths
    if (state.callStack.length >= 2) {
      const globalCtx = buildGlobalContext(state);
      const globalVars = getVariables(globalCtx);

      // Outer should be from <entry> frame (depth 0 = entry)
      const outerVar = globalVars.find((v) => v.name === 'outer');
      expect(outerVar).toBeDefined();
      expect(outerVar?.frameName).toBe('<entry>');
      expect(outerVar?.frameDepth).toBe(0); // Entry frame is always depth 0
    }

    // Complete execution
    state = runUntilPause(state);

    // After completion, result should be set with correct frame info
    const finalContext = buildLocalContext(state);
    const resultVar = getVariables(finalContext).find((v) => v.name === 'result');
    expect(resultVar?.value).toBe('inner');
    expect(resultVar?.frameName).toBe('<entry>');
    expect(resultVar?.frameDepth).toBe(0);
  });

  test('localContext and globalContext are stored in state', () => {
    const ast = parse(`
      let x = "value"
    `);
    let state = createInitialState(ast);

    // Step through execution
    while (state.status === 'running') {
      state = step(state);
    }

    // State should have context properties
    expect(Array.isArray(state.localContext)).toBe(true);
    expect(Array.isArray(state.globalContext)).toBe(true);
  });

  test('context filters out model declarations', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let x = "hello"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const variables = getVariables(context);

    // Model should be filtered out of context (it's config, not data for AI)
    const modelVar = variables.find((v) => v.name === 'm');
    expect(modelVar).toBeUndefined();

    // Regular variable should still be in context
    const xVar = variables.find((v) => v.name === 'x');
    expect(xVar?.value).toBe('hello');
  });

  test('context filters out prompt type variables', () => {
    const ast = parse(`
      let systemPrompt: prompt = "You are a helpful assistant"
      const question: prompt = "What is 2+2?"
      let regularVar = "hello"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const variables = getVariables(context);

    // Prompt variables should be filtered out (they are instructions, not data)
    const promptVar = variables.find((v) => v.name === 'systemPrompt');
    expect(promptVar).toBeUndefined();

    const questionVar = variables.find((v) => v.name === 'question');
    expect(questionVar).toBeUndefined();

    // Regular variable should still be in context
    const regularVarCtx = variables.find((v) => v.name === 'regularVar');
    expect(regularVarCtx?.value).toBe('hello');

    // Only the regular variable should be in context
    expect(variables).toHaveLength(1);
  });

  test('full context array verification with nested blocks and function calls', () => {
    const ast = parse(`
      let outer = "outer_value"
      const outerConst: json = { key: "json_value" }

      function processData(input: text): text {
        let funcLocal = "func_local"
        if true {
          let blockVar = "block_value"
          blockVar = "updated_block"
        }
        return input
      }

      let result = processData("arg_value")
    `);

    let state = createInitialState(ast);

    // Helper to normalize context for comparison (sort by name)
    const normalizeContext = (ctx: ContextEntry[]) =>
      [...getVariables(ctx)].sort((a, b) => a.name.localeCompare(b.name));

    // Step until we're inside the function (2 frames)
    state = stepUntilCondition(state, (s) => s.callStack.length >= 2);

    // Continue stepping until funcLocal is declared
    while (
      state.status === 'running' &&
      state.callStack.length >= 2 &&
      !state.callStack[1]?.locals['funcLocal']
    ) {
      state = step(state);
    }

    // Take snapshot inside function, after funcLocal declared
    if (state.callStack.length >= 2 && state.callStack[1]?.locals['funcLocal']) {
      state = step(state); // Step once more to rebuild context

      const localCtx = normalizeContext(buildLocalContext(state));
      const globalCtx = normalizeContext(buildGlobalContext(state));

      // Local context should only have function frame variables (depth 1 = called from entry)
      // Function parameters now have explicit type annotations
      expect(localCtx).toEqual([
        { kind: 'variable', name: 'funcLocal', value: 'func_local', type: 'text', isConst: false, source: null, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'input', value: 'arg_value', type: 'text', isConst: false, source: null, frameName: 'processData', frameDepth: 1 },
      ]);

      // Global context should have <entry> frame (depth 0) + function frame (depth 1)
      expect(globalCtx).toEqual([
        { kind: 'variable', name: 'funcLocal', value: 'func_local', type: 'text', isConst: false, source: null, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'input', value: 'arg_value', type: 'text', isConst: false, source: null, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'outer', value: 'outer_value', type: 'text', isConst: false, source: null, frameName: '<entry>', frameDepth: 0 },
        { kind: 'variable', name: 'outerConst', value: { key: 'json_value' }, type: 'json', isConst: true, source: null, frameName: '<entry>', frameDepth: 0 },
      ]);
    }

    // Continue stepping until we're inside the if block (blockVar declared)
    while (
      state.status === 'running' &&
      state.callStack.length >= 2 &&
      !state.callStack[1]?.locals['blockVar']
    ) {
      state = step(state);
    }

    // Take snapshot inside the nested block
    if (state.callStack.length >= 2 && state.callStack[1]?.locals['blockVar']) {
      state = step(state); // Step once more to rebuild context

      const localCtxInBlock = normalizeContext(buildLocalContext(state));
      const globalCtxInBlock = normalizeContext(buildGlobalContext(state));

      // Local context now includes blockVar (blocks share frame with function)
      // Function parameters now have explicit type annotations
      expect(localCtxInBlock).toEqual([
        { kind: 'variable', name: 'blockVar', value: 'block_value', type: 'text', isConst: false, source: null, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'funcLocal', value: 'func_local', type: 'text', isConst: false, source: null, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'input', value: 'arg_value', type: 'text', isConst: false, source: null, frameName: 'processData', frameDepth: 1 },
      ]);

      // Global context includes everything
      expect(globalCtxInBlock).toEqual([
        { kind: 'variable', name: 'blockVar', value: 'block_value', type: 'text', isConst: false, source: null, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'funcLocal', value: 'func_local', type: 'text', isConst: false, source: null, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'input', value: 'arg_value', type: 'text', isConst: false, source: null, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'outer', value: 'outer_value', type: 'text', isConst: false, source: null, frameName: '<entry>', frameDepth: 0 },
        { kind: 'variable', name: 'outerConst', value: { key: 'json_value' }, type: 'json', isConst: true, source: null, frameName: '<entry>', frameDepth: 0 },
      ]);
    }

    // Continue until blockVar is updated
    while (
      state.status === 'running' &&
      state.callStack.length >= 2 &&
      state.callStack[1]?.locals['blockVar']?.value !== 'updated_block'
    ) {
      state = step(state);
    }

    // Verify updated value in context (check immediately, don't step again
    // since next instruction might be exit_block which removes blockVar)
    if (state.callStack[1]?.locals['blockVar']?.value === 'updated_block') {
      const localCtxUpdated = normalizeContext(buildLocalContext(state));

      // With snapshotting, blockVar has two entries - find the last one (updated value)
      const blockVarEntries = localCtxUpdated.filter((v) => v.name === 'blockVar');
      const lastBlockVar = blockVarEntries[blockVarEntries.length - 1];
      expect(lastBlockVar?.value).toBe('updated_block');
    }

    // Run to completion
    state = runUntilPause(state);
    expect(state.status).toBe('completed');

    // Final context - back to main frame only, block variables gone
    const finalLocalCtx = normalizeContext(buildLocalContext(state));
    const finalGlobalCtx = normalizeContext(buildGlobalContext(state));

    // Should have outer, outerConst, and result (blockVar and funcLocal are gone)
    // All in <entry> frame at depth 0 since it's the only frame
    expect(finalLocalCtx).toEqual([
      { kind: 'variable', name: 'outer', value: 'outer_value', type: 'text', isConst: false, source: null, frameName: '<entry>', frameDepth: 0 },
      { kind: 'variable', name: 'outerConst', value: { key: 'json_value' }, type: 'json', isConst: true, source: null, frameName: '<entry>', frameDepth: 0 },
      { kind: 'variable', name: 'result', value: 'arg_value', type: 'text', isConst: false, source: null, frameName: '<entry>', frameDepth: 0 },
    ]);

    // Local and global should be same when only one frame
    expect(finalGlobalCtx).toEqual(finalLocalCtx);
  });
});

describe('Tool Call Context Entries', () => {
  test('tool-call entries in orderedEntries appear in context', () => {
    const ast = parse('let x = "test"');
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // Add a tool-call entry directly to test buildLocalContext handles them
    const frame = state.callStack[state.callStack.length - 1];
    frame.orderedEntries.push({
      kind: 'tool-call',
      toolName: 'getWeather',
      args: { city: 'Seattle' },
      result: { temp: 55, condition: 'rainy' },
    });

    const context = buildLocalContext(state);

    // Should have the variable and the tool call
    expect(context).toHaveLength(2);

    const toolCall = context.find((e) => e.kind === 'tool-call');
    expect(toolCall).toBeDefined();
    expect(toolCall?.kind).toBe('tool-call');
    if (toolCall?.kind === 'tool-call') {
      expect(toolCall.toolName).toBe('getWeather');
      expect(toolCall.args).toEqual({ city: 'Seattle' });
      expect(toolCall.result).toEqual({ temp: 55, condition: 'rainy' });
      expect(toolCall.frameName).toBe('<entry>');
      expect(toolCall.frameDepth).toBe(0);
    }
  });

  test('tool-call entries with errors appear in context', () => {
    const ast = parse('let x = "test"');
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // Add a failed tool call
    const frame = state.callStack[state.callStack.length - 1];
    frame.orderedEntries.push({
      kind: 'tool-call',
      toolName: 'readFile',
      args: { path: '/nonexistent' },
      error: 'File not found',
    });

    const context = buildLocalContext(state);

    const toolCall = context.find((e) => e.kind === 'tool-call');
    expect(toolCall).toBeDefined();
    if (toolCall?.kind === 'tool-call') {
      expect(toolCall.toolName).toBe('readFile');
      expect(toolCall.error).toBe('File not found');
      expect(toolCall.result).toBeUndefined();
    }
  });

  test('multiple tool calls appear in order', () => {
    const ast = parse('let x = "test"');
    let state = createInitialState(ast);
    state = runUntilPause(state);

    // Add multiple tool calls
    const frame = state.callStack[state.callStack.length - 1];
    frame.orderedEntries.push(
      {
        kind: 'tool-call',
        toolName: 'step1',
        args: {},
        result: 'done1',
      },
      {
        kind: 'tool-call',
        toolName: 'step2',
        args: {},
        result: 'done2',
      }
    );

    const context = buildLocalContext(state);
    const toolCalls = context.filter((e) => e.kind === 'tool-call');

    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0].kind === 'tool-call' && toolCalls[0].toolName).toBe('step1');
    expect(toolCalls[1].kind === 'tool-call' && toolCalls[1].toolName).toBe('step2');
  });
});
