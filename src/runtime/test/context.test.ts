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
} from '../index';

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
    expect(context).toHaveLength(2);

    const xVar = context.find((v) => v.name === 'x');
    expect(xVar).toBeDefined();
    expect(xVar?.value).toBe('hello');
    expect(xVar?.type).toBe('text'); // Inferred from string value
    expect(xVar?.frameName).toBe('<entry>');
    expect(xVar?.frameDepth).toBe(0);

    const yVar = context.find((v) => v.name === 'y');
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

    const outerVar = context.find((v) => v.name === 'outer');
    expect(outerVar).toBeDefined();
    expect(outerVar?.frameName).toBe('<entry>');
    expect(outerVar?.frameDepth).toBe(0);

    const resultVar = context.find((v) => v.name === 'result');
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
    expect(state.localContext.some((v) => v.name === 'a')).toBe(true);
  });

  test('context includes correct type annotations', () => {
    const ast = parse(`
      let textVar = "hello"
      let jsonVar: json = { data: "value" }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);

    const textVar = context.find((v) => v.name === 'textVar');
    expect(textVar?.type).toBe('text'); // Inferred from string value

    const jsonVar = context.find((v) => v.name === 'jsonVar');
    expect(jsonVar?.type).toBe('json');
  });

  test('context updates correctly after variable reassignment', () => {
    const ast = parse(`
      let x = "initial"
      x = "updated"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const context = buildLocalContext(state);
    const xVar = context.find((v) => v.name === 'x');
    expect(xVar?.value).toBe('updated');
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

      // Outer should be from <entry> frame (depth 0 = entry)
      const outerVar = globalCtx.find((v) => v.name === 'outer');
      expect(outerVar).toBeDefined();
      expect(outerVar?.frameName).toBe('<entry>');
      expect(outerVar?.frameDepth).toBe(0); // Entry frame is always depth 0
    }

    // Complete execution
    state = runUntilPause(state);

    // After completion, result should be set with correct frame info
    const finalContext = buildLocalContext(state);
    const resultVar = finalContext.find((v) => v.name === 'result');
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

    // Model should be filtered out of context (it's config, not data for AI)
    const modelVar = context.find((v) => v.name === 'm');
    expect(modelVar).toBeUndefined();

    // Regular variable should still be in context
    const xVar = context.find((v) => v.name === 'x');
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

    // Prompt variables should be filtered out (they are instructions, not data)
    const promptVar = context.find((v) => v.name === 'systemPrompt');
    expect(promptVar).toBeUndefined();

    const questionVar = context.find((v) => v.name === 'question');
    expect(questionVar).toBeUndefined();

    // Regular variable should still be in context
    const regularVarCtx = context.find((v) => v.name === 'regularVar');
    expect(regularVarCtx?.value).toBe('hello');

    // Only the regular variable should be in context
    expect(context).toHaveLength(1);
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
    const normalizeContext = (ctx: ContextVariable[]) =>
      [...ctx].sort((a, b) => a.name.localeCompare(b.name));

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
        { kind: 'variable', name: 'funcLocal', value: 'func_local', type: 'text', isConst: false, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'input', value: 'arg_value', type: 'text', isConst: false, frameName: 'processData', frameDepth: 1 },
      ]);

      // Global context should have <entry> frame (depth 0) + function frame (depth 1)
      expect(globalCtx).toEqual([
        { kind: 'variable', name: 'funcLocal', value: 'func_local', type: 'text', isConst: false, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'input', value: 'arg_value', type: 'text', isConst: false, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'outer', value: 'outer_value', type: 'text', isConst: false, frameName: '<entry>', frameDepth: 0 },
        { kind: 'variable', name: 'outerConst', value: { key: 'json_value' }, type: 'json', isConst: true, frameName: '<entry>', frameDepth: 0 },
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
        { kind: 'variable', name: 'blockVar', value: 'block_value', type: 'text', isConst: false, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'funcLocal', value: 'func_local', type: 'text', isConst: false, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'input', value: 'arg_value', type: 'text', isConst: false, frameName: 'processData', frameDepth: 1 },
      ]);

      // Global context includes everything
      expect(globalCtxInBlock).toEqual([
        { kind: 'variable', name: 'blockVar', value: 'block_value', type: 'text', isConst: false, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'funcLocal', value: 'func_local', type: 'text', isConst: false, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'input', value: 'arg_value', type: 'text', isConst: false, frameName: 'processData', frameDepth: 1 },
        { kind: 'variable', name: 'outer', value: 'outer_value', type: 'text', isConst: false, frameName: '<entry>', frameDepth: 0 },
        { kind: 'variable', name: 'outerConst', value: { key: 'json_value' }, type: 'json', isConst: true, frameName: '<entry>', frameDepth: 0 },
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

      // blockVar should have updated value
      const blockVar = localCtxUpdated.find((v) => v.name === 'blockVar');
      expect(blockVar?.value).toBe('updated_block');
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
      { kind: 'variable', name: 'outer', value: 'outer_value', type: 'text', isConst: false, frameName: '<entry>', frameDepth: 0 },
      { kind: 'variable', name: 'outerConst', value: { key: 'json_value' }, type: 'json', isConst: true, frameName: '<entry>', frameDepth: 0 },
      { kind: 'variable', name: 'result', value: 'arg_value', type: 'text', isConst: false, frameName: '<entry>', frameDepth: 0 },
    ]);

    // Local and global should be same when only one frame
    expect(finalGlobalCtx).toEqual(finalLocalCtx);
  });
});
