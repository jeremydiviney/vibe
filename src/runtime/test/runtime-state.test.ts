import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import {
  createInitialState,
  step,
  stepN,
  runUntilPause,
  resumeWithAIResponse,
  resumeWithUserInput,
  serializeState,
  deserializeState,
  getStateSummary,
  cloneState,
  getNextInstruction,
  stepUntilCondition,
  stepUntilStatement,
  stepUntilOp,
} from '../index';

describe('Functional Runtime - Step Execution', () => {
  test('createInitialState creates valid state', () => {
    const ast = parse('let x = "hello"');
    const state = createInitialState(ast);

    expect(state.status).toBe('running');
    expect(state.callStack).toHaveLength(1);
    expect(state.callStack[0].name).toBe('<entry>');
    expect(state.instructionStack.length).toBeGreaterThan(0);
    expect(state.lastResult).toBeNull();
  });

  test('step executes one instruction at a time', () => {
    const ast = parse('let x = "hello"');
    let state = createInitialState(ast);

    // Initial: 1 exec_statement instruction
    expect(state.instructionStack).toHaveLength(1);
    expect(state.instructionStack[0].op).toBe('exec_statement');

    // Step 1: exec_statement expands to exec_expression + declare_var
    state = step(state);
    expect(state.instructionStack.length).toBeGreaterThanOrEqual(2);

    // Continue stepping until complete
    // Need to keep stepping until status changes (step marks complete when no instructions left)
    while (state.status === 'running') {
      state = step(state);
    }

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['x']).toBeDefined();
    expect(state.callStack[0].locals['x'].value).toBe('hello');
  });

  test('runUntilPause runs to completion for simple program', () => {
    const ast = parse(`
      let x = "hello"
      let y = "world"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['x'].value).toBe('hello');
    expect(state.callStack[0].locals['y'].value).toBe('world');
  });

  test('runUntilPause pauses at AI call', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let response = do "prompt" m default
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ai');
    expect(state.pendingAI).not.toBeNull();
    expect(state.pendingAI?.type).toBe('do');
    expect(state.pendingAI?.prompt).toBe('prompt');
  });

  test('runUntilPause pauses at ask call', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let input = ask "question?" m default
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_user');
    expect(state.pendingAI).not.toBeNull();
    expect(state.pendingAI?.type).toBe('ask');
    expect(state.pendingAI?.prompt).toBe('question?');
  });
});

describe('Functional Runtime - Resume Execution', () => {
  test('resumeWithAIResponse continues after do expression', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let response = do "prompt" m default
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ai');

    state = resumeWithAIResponse(state, 'AI response');
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['response'].value).toBe('AI response');
  });

  test('resumeWithUserInput continues after ask expression', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let input = ask "What is your name?" m default
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_user');

    state = resumeWithUserInput(state, 'Alice');
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['input'].value).toBe('Alice');
  });

  test('multiple AI calls can be resumed sequentially', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let a = do "first" m default
      let b = do "second" m default
    `);
    let state = createInitialState(ast);

    // First pause
    state = runUntilPause(state);
    expect(state.status).toBe('awaiting_ai');
    expect(state.pendingAI?.prompt).toBe('first');

    // Resume and hit second pause
    state = resumeWithAIResponse(state, 'response1');
    state = runUntilPause(state);
    expect(state.status).toBe('awaiting_ai');
    expect(state.pendingAI?.prompt).toBe('second');

    // Resume and complete
    state = resumeWithAIResponse(state, 'response2');
    state = runUntilPause(state);
    expect(state.status).toBe('completed');

    expect(state.callStack[0].locals['a'].value).toBe('response1');
    expect(state.callStack[0].locals['b'].value).toBe('response2');
  });
});

describe('Functional Runtime - Serialization', () => {
  test('serializeState produces valid JSON', () => {
    const ast = parse('let x = "hello"');
    const state = createInitialState(ast);

    const json = serializeState(state);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  test('deserializeState restores state', () => {
    const ast = parse('let x = "hello"');
    const original = createInitialState(ast);

    const json = serializeState(original);
    const restored = deserializeState(json);

    expect(restored.status).toBe(original.status);
    expect(restored.callStack).toHaveLength(original.callStack.length);
    expect(restored.instructionStack).toHaveLength(original.instructionStack.length);
  });

  test('state can be serialized mid-execution and resumed', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let response = do "prompt" m default
      response
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('awaiting_ai');

    // Serialize paused state
    const json = serializeState(state);

    // Simulate restart - deserialize and resume
    let restored = deserializeState(json);
    restored = resumeWithAIResponse(restored, 'AI response');
    restored = runUntilPause(restored);

    expect(restored.status).toBe('completed');
    expect(restored.lastResult).toBe('AI response');
  });

  test('cloneState creates independent copy', () => {
    const ast = parse('let x = "hello"');
    const original = createInitialState(ast);

    const cloned = cloneState(original);

    // Modify original
    original.lastResult = 'modified';

    // Clone should be unaffected
    expect(cloned.lastResult).toBeNull();
  });

  test('getStateSummary provides useful debug info', () => {
    const ast = parse(`
      let x = "hello"
      let y = "world"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const summary = getStateSummary(state);

    expect(summary.status).toBe('completed');
    expect(summary.currentFrame).toBe('<entry>');
    expect(summary.variables).toHaveProperty('x');
    expect(summary.variables).toHaveProperty('y');
  });
});

describe('Functional Runtime - Execution Log', () => {
  test('execution log tracks variable declarations', () => {
    const ast = parse(`
      let x = "hello"
      let y = "world"
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const letDeclarations = state.executionLog.filter(
      (e) => e.instructionType === 'let_declaration'
    );
    expect(letDeclarations).toHaveLength(2);
    expect(letDeclarations[0].details?.name).toBe('x');
    expect(letDeclarations[1].details?.name).toBe('y');
  });

  test('execution log tracks AI requests', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let response = do "test prompt" m default
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const aiRequests = state.executionLog.filter(
      (e) => e.instructionType === 'ai_do_request'
    );
    expect(aiRequests).toHaveLength(1);
    expect(aiRequests[0].details?.prompt).toBe('test prompt');
  });

  test('execution log tracks AI responses', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let response = do "test prompt" m default
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);
    state = resumeWithAIResponse(state, 'AI response');
    state = runUntilPause(state);

    const aiResponses = state.executionLog.filter(
      (e) => e.instructionType === 'ai_do_response'
    );
    expect(aiResponses).toHaveLength(1);
    expect(aiResponses[0].result).toBe('AI response');
  });
});

describe('Functional Runtime - Complex Programs', () => {
  test('function calls work with step execution', () => {
    const ast = parse(`
      function greet(name: text): text {
        return "Hello, {name}!"
      }
      let result = greet("World")
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('Hello, World!');
  });

  test('if statements work correctly', () => {
    const ast = parse(`
      let x = true
      let result = ""
      if x {
        result = "yes"
      } else {
        result = "no"
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    expect(state.callStack[0].locals['result'].value).toBe('yes');
  });

  test('nested object literals work', () => {
    const ast = parse(`
      let data: json = {
        user: {
          name: "Alice",
          settings: {
            theme: "dark"
          }
        }
      }
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const data = state.callStack[0].locals['data'].value as any;
    expect(data.user.name).toBe('Alice');
    expect(data.user.settings.theme).toBe('dark');
  });

  test('array literals work', () => {
    const ast = parse(`
      let items = ["a", "b", "c"]
    `);
    let state = createInitialState(ast);
    state = runUntilPause(state);

    expect(state.status).toBe('completed');
    const items = state.callStack[0].locals['items'].value as any;
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('Functional Runtime - Pause at Any Instruction', () => {
  test('getNextInstruction returns next instruction', () => {
    const ast = parse(`
      let x = "hello"
      const y = "world"
    `);
    let state = createInitialState(ast);

    const next = getNextInstruction(state);
    expect(next).not.toBeNull();
    expect(next?.op).toBe('exec_statement');
  });

  test('getNextInstruction returns null when complete', () => {
    const ast = parse('let x = "hello"');
    let state = createInitialState(ast);
    state = runUntilPause(state);

    const next = getNextInstruction(state);
    expect(next).toBeNull();
  });

  test('stepN executes exactly N instructions', () => {
    const ast = parse(`
      let a = "1"
      let b = "2"
      let c = "3"
    `);
    let state = createInitialState(ast);

    // Step 3 times from initial
    state = stepN(state, 3);

    // Should still be running (not complete yet)
    expect(state.status).toBe('running');
    expect(state.instructionStack.length).toBeGreaterThan(0);
  });

  test('stepUntilStatement pauses before specific statement type', () => {
    const ast = parse(`
      let x = "hello"
      const y = "world"
      let z = "!"
    `);
    let state = createInitialState(ast);

    // Step until we're about to execute a ConstDeclaration
    state = stepUntilStatement(state, 'ConstDeclaration');

    // We should be paused just before the const declaration
    const next = getNextInstruction(state);
    expect(next?.op).toBe('exec_statement');
    if (next?.op === 'exec_statement') {
      expect(next.stmt.type).toBe('ConstDeclaration');
    }

    // x should already be declared
    expect(state.callStack[0].locals['x']).toBeDefined();
    expect(state.callStack[0].locals['x'].value).toBe('hello');

    // y should NOT be declared yet
    expect(state.callStack[0].locals['y']).toBeUndefined();
  });

  test('stepUntilOp pauses before specific instruction op', () => {
    const ast = parse(`
      let x = "hello"
    `);
    let state = createInitialState(ast);

    // Step until we're about to execute declare_var
    state = stepUntilOp(state, 'declare_var');

    const next = getNextInstruction(state);
    expect(next?.op).toBe('declare_var');

    // Variable should not exist yet
    expect(state.callStack[0].locals['x']).toBeUndefined();

    // Now step once more to declare it
    state = step(state);
    expect(state.callStack[0].locals['x']).toBeDefined();
  });

  test('stepUntilCondition with custom predicate', () => {
    const ast = parse(`
      let a = "first"
      let b = "second"
      let target = "found"
      let c = "third"
    `);
    let state = createInitialState(ast);

    // Step until we're about to declare a variable named "target"
    state = stepUntilCondition(state, (_state, next) => {
      if (next?.op === 'declare_var') {
        return next.name === 'target';
      }
      return false;
    });

    const next = getNextInstruction(state);
    expect(next?.op).toBe('declare_var');
    if (next?.op === 'declare_var') {
      expect(next.name).toBe('target');
    }

    // Previous variables should be declared
    expect(state.callStack[0].locals['a']?.value).toBe('first');
    expect(state.callStack[0].locals['b']?.value).toBe('second');

    // target should not be declared yet
    expect(state.callStack[0].locals['target']).toBeUndefined();
  });

  test('can pause before AI call and inspect pending prompt', () => {
    const ast = parse(`
      model m = { name: "test", apiKey: "key", url: "http://test" }
      let setup = "done"
      let response = do "my prompt" m default
    `);
    let state = createInitialState(ast);

    // Step until we're about to do the AI call
    state = stepUntilOp(state, 'ai_do');

    // We're paused just before the AI call
    const next = getNextInstruction(state);
    expect(next?.op).toBe('ai_do');

    // setup should be done
    expect(state.callStack[0].locals['setup']?.value).toBe('done');

    // The prompt should be in lastResult (already evaluated)
    expect(state.lastResult).toBe('my prompt');
  });

  test('serialization works at any pause point', () => {
    const ast = parse(`
      let a = "first"
      const b = "second"
      let c = "third"
    `);
    let state = createInitialState(ast);

    // Pause before const declaration
    state = stepUntilStatement(state, 'ConstDeclaration');

    // Serialize at this point
    const json = serializeState(state);

    // Deserialize and continue
    let restored = deserializeState(json);
    restored = runUntilPause(restored);

    expect(restored.status).toBe('completed');
    expect(restored.callStack[0].locals['a']?.value).toBe('first');
    expect(restored.callStack[0].locals['b']?.value).toBe('second');
    expect(restored.callStack[0].locals['c']?.value).toBe('third');
  });
});
