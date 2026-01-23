import { describe, it, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../../semantic';
import { createInitialState, resumeWithAIResponse } from '../state';
import { runUntilPause } from '../step';
import { isVibeValue } from '../types';
import type { ToolRoundResult } from '../ai/tool-loop';

// Helper to run with mock AI response
function runWithMockAI(
  state: ReturnType<typeof createInitialState>,
  response: unknown,
  toolRounds?: ToolRoundResult[]
) {
  state = runUntilPause(state);
  while (state.status === 'awaiting_ai') {
    state = resumeWithAIResponse(state, response, undefined, toolRounds);
    state = runUntilPause(state);
  }
  return state;
}

describe('VibeValue AI Results', () => {
  describe('basic structure', () => {
    it('AI response returns VibeValue with value and empty toolCalls', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "test prompt" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'test response');

      const vibeValue = state.callStack[0].locals['result'];
      expect(isVibeValue(vibeValue)).toBe(true);
      expect(vibeValue.value).toBe('test response');
      expect(vibeValue.toolCalls).toEqual([]);
      expect(vibeValue.err).toBe(false);  // err is now boolean
      expect(vibeValue.errDetails).toBe(null);
      expect(vibeValue.source).toBe('ai');
    });

    it('toolCalls array contains tool execution records with duration', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = vibe "test prompt" m default
      `);
      let state = createInitialState(ast);

      // Simulate tool rounds
      const toolRounds: ToolRoundResult[] = [
        {
          toolCalls: [
            { id: 'call_1', toolName: 'fetchData', args: { url: 'http://api.com' } },
          ],
          results: [
            { toolCallId: 'call_1', result: 'data from api', duration: 150 },
          ],
        },
      ];

      state = runUntilPause(state);
      state = resumeWithAIResponse(state, 'final response', undefined, toolRounds);
      state = runUntilPause(state);

      const vibeValue = state.callStack[0].locals['result'];
      expect(isVibeValue(vibeValue)).toBe(true);
      expect(vibeValue.toolCalls).toHaveLength(1);
      expect(vibeValue.toolCalls[0]).toEqual({
        toolName: 'fetchData',
        args: { url: 'http://api.com' },
        result: 'data from api',
        err: false,
        errDetails: null,
        duration: 150,
      });
    });

    it('captures tool errors in toolCalls', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = vibe "test prompt" m default
      `);
      let state = createInitialState(ast);

      const toolRounds: ToolRoundResult[] = [
        {
          toolCalls: [
            { id: 'call_1', toolName: 'failingTool', args: {} },
          ],
          results: [
            { toolCallId: 'call_1', error: 'Connection failed', duration: 50 },
          ],
        },
      ];

      state = runUntilPause(state);
      state = resumeWithAIResponse(state, 'error handled', undefined, toolRounds);
      state = runUntilPause(state);

      const vibeValue = state.callStack[0].locals['result'];
      expect(vibeValue.toolCalls[0]).toEqual({
        toolName: 'failingTool',
        args: {},
        result: null,
        err: true,
        errDetails: { message: 'Connection failed' },
        duration: 50,
      });
    });

    it('accumulates all tool calls across multiple rounds (vibe)', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = vibe "multi-step task" m default
      `);
      let state = createInitialState(ast);

      const toolRounds: ToolRoundResult[] = [
        {
          toolCalls: [{ id: 'call_1', toolName: 'step1', args: { n: 1 } }],
          results: [{ toolCallId: 'call_1', result: 'step1 done', duration: 10 }],
        },
        {
          toolCalls: [{ id: 'call_2', toolName: 'step2', args: { n: 2 } }],
          results: [{ toolCallId: 'call_2', result: 'step2 done', duration: 20 }],
        },
        {
          toolCalls: [{ id: 'call_3', toolName: 'step3', args: { n: 3 } }],
          results: [{ toolCallId: 'call_3', result: 'step3 done', duration: 30 }],
        },
      ];

      state = runUntilPause(state);
      state = resumeWithAIResponse(state, 'all steps complete', undefined, toolRounds);
      state = runUntilPause(state);

      const vibeValue = state.callStack[0].locals['result'];
      expect(vibeValue.toolCalls).toHaveLength(3);
      expect(vibeValue.toolCalls.map((tc: { toolName: string }) => tc.toolName)).toEqual(['step1', 'step2', 'step3']);
      expect(vibeValue.value).toBe('all steps complete');
    });
  });

  describe('primitive coercion', () => {
    it('string interpolation uses value', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "get name" m default
        let msg = "Hello {result}"
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'Alice');

      expect(state.callStack[0].locals['msg'].value).toBe('Hello Alice');
    });

    it('binary operations use value', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "get number" m default
        let doubled = result + result
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 5);

      expect(state.callStack[0].locals['doubled'].value).toBe(10);
    });

    it('comparison uses value', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "get answer" m default
        let isYes = result == "yes"
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'yes');

      expect(state.callStack[0].locals['isYes'].value).toBe(true);
    });
  });

  describe('property access', () => {
    it('.toolCalls returns the tool calls array', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = vibe "do something" m default
        let calls = result.toolCalls
      `);
      let state = createInitialState(ast);

      const toolRounds: ToolRoundResult[] = [
        {
          toolCalls: [{ id: 'call_1', toolName: 'myTool', args: { x: 1 } }],
          results: [{ toolCallId: 'call_1', result: 'done', duration: 100 }],
        },
      ];

      state = runUntilPause(state);
      state = resumeWithAIResponse(state, 'completed', undefined, toolRounds);
      state = runUntilPause(state);

      const calls = state.callStack[0].locals['calls'].value;
      expect(Array.isArray(calls)).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].toolName).toBe('myTool');
    });

    it('accessing properties on value works (when value is object)', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "get user" m default
        let name = result.name
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, { name: 'Bob', age: 30 });

      expect(state.callStack[0].locals['name'].value).toBe('Bob');
    });

    it('accessing individual toolCalls by index works', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = vibe "do tasks" m default
        let firstCall = result.toolCalls[0]
        let secondCall = result.toolCalls[1]
      `);
      let state = createInitialState(ast);

      const toolRounds: ToolRoundResult[] = [
        {
          toolCalls: [
            { id: 'call_1', toolName: 'tool1', args: { x: 1 } },
            { id: 'call_2', toolName: 'tool2', args: { x: 2 } },
          ],
          results: [
            { toolCallId: 'call_1', result: 'result1', duration: 10 },
            { toolCallId: 'call_2', result: 'result2', duration: 20 },
          ],
        },
      ];

      state = runUntilPause(state);
      state = resumeWithAIResponse(state, 'done', undefined, toolRounds);
      state = runUntilPause(state);

      const firstCall = state.callStack[0].locals['firstCall'].value;
      const secondCall = state.callStack[0].locals['secondCall'].value;
      expect(firstCall.toolName).toBe('tool1');
      expect(secondCall.toolName).toBe('tool2');
    });

    it('accessing toolCall properties by chained index works', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = vibe "do tasks" m default
        let firstCall = result.toolCalls[0]
        let secondCall = result.toolCalls[1]
        let firstName = firstCall.toolName
        let secondName = secondCall.toolName
      `);
      let state = createInitialState(ast);

      const toolRounds: ToolRoundResult[] = [
        {
          toolCalls: [
            { id: 'call_1', toolName: 'fetchData', args: { url: 'http://api.com' } },
            { id: 'call_2', toolName: 'processData', args: { format: 'json' } },
          ],
          results: [
            { toolCallId: 'call_1', result: 'data', duration: 10 },
            { toolCallId: 'call_2', result: 'processed', duration: 20 },
          ],
        },
      ];

      state = runUntilPause(state);
      state = resumeWithAIResponse(state, 'done', undefined, toolRounds);
      state = runUntilPause(state);

      // Verify indexing works
      expect(state.callStack[0].locals['firstCall'].value.toolName).toBe('fetchData');
      expect(state.callStack[0].locals['secondCall'].value.toolName).toBe('processData');
      // Verify property access on indexed element works
      expect(state.callStack[0].locals['firstName'].value).toBe('fetchData');
      expect(state.callStack[0].locals['secondName'].value).toBe('processData');
    });

    it('slicing toolCalls array works', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = vibe "do tasks" m default
        let firstTwo = result.toolCalls[0:2]
        let lastTwo = result.toolCalls[1:]
        let fromStart = result.toolCalls[:2]
        let allButLast = result.toolCalls[:-1]
      `);
      let state = createInitialState(ast);

      const toolRounds: ToolRoundResult[] = [
        {
          toolCalls: [
            { id: 'call_1', toolName: 'tool1', args: {} },
            { id: 'call_2', toolName: 'tool2', args: {} },
            { id: 'call_3', toolName: 'tool3', args: {} },
          ],
          results: [
            { toolCallId: 'call_1', result: 'r1', duration: 10 },
            { toolCallId: 'call_2', result: 'r2', duration: 20 },
            { toolCallId: 'call_3', result: 'r3', duration: 30 },
          ],
        },
      ];

      state = runUntilPause(state);
      state = resumeWithAIResponse(state, 'done', undefined, toolRounds);
      state = runUntilPause(state);

      const firstTwo = state.callStack[0].locals['firstTwo'].value;
      const lastTwo = state.callStack[0].locals['lastTwo'].value;
      const fromStart = state.callStack[0].locals['fromStart'].value;
      const allButLast = state.callStack[0].locals['allButLast'].value;

      // [0:2] - indices 0, 1 (Python-style exclusive end)
      expect(firstTwo).toHaveLength(2);
      expect(firstTwo.map((c: { toolName: string }) => c.toolName)).toEqual(['tool1', 'tool2']);

      // [1:] - from index 1 to end
      expect(lastTwo).toHaveLength(2);
      expect(lastTwo.map((c: { toolName: string }) => c.toolName)).toEqual(['tool2', 'tool3']);

      // [:2] - from start to index 2 (exclusive)
      expect(fromStart).toHaveLength(2);
      expect(fromStart.map((c: { toolName: string }) => c.toolName)).toEqual(['tool1', 'tool2']);

      // [:-1] - all but last (Python-style)
      expect(allButLast).toHaveLength(2);
      expect(allButLast.map((c: { toolName: string }) => c.toolName)).toEqual(['tool1', 'tool2']);
    });
  });

  describe('iteration', () => {
    it('iterating over VibeValue with array value works', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let items = do "get list" m default
        let sum = 0
        for n in items {
          sum = sum + n
        }
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, [1, 2, 3, 4, 5]);

      expect(state.callStack[0].locals['sum'].value).toBe(15);
    });

    it('iterating over VibeValue with non-array value throws', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "get string" m default
        for c in result {
          let x = c
        }
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'hello');

      expect(state.status).toBe('error');
      expect(state.error).toContain('Cannot iterate over VibeValue');
      expect(state.error).toContain('string');
    });

    it('accessing .toolCalls.len() works', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = vibe "do tasks" m default
        let count = result.toolCalls.len()
      `);
      let state = createInitialState(ast);

      const toolRounds: ToolRoundResult[] = [
        {
          toolCalls: [
            { id: 'call_1', toolName: 'tool1', args: {} },
            { id: 'call_2', toolName: 'tool2', args: {} },
          ],
          results: [
            { toolCallId: 'call_1', result: 'r1', duration: 10 },
            { toolCallId: 'call_2', result: 'r2', duration: 20 },
          ],
        },
      ];

      state = runUntilPause(state);
      state = resumeWithAIResponse(state, 'done', undefined, toolRounds);
      state = runUntilPause(state);

      expect(state.callStack[0].locals['count'].value).toBe(2);
    });
  });

  describe('context display', () => {
    it('context shows only the value, not the full VibeValue', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "get data" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'the response');

      // Check that localContext shows just the value
      const resultEntry = state.localContext.find(
        (e) => e.kind === 'variable' && e.name === 'result'
      );
      expect(resultEntry).toBeDefined();
      // The value in context should be resolved, not VibeValue
      expect((resultEntry as { value: unknown }).value).toBe('the response');
    });
  });

  describe('structural type results', () => {
    it('structural type variable stores full object and supports member access', () => {
      const ast = parse(`
        type GameResult {
          correct: boolean,
          response: boolean
        }
        model m = { name: "test", apiKey: "key", url: "http://test" }
        const result: GameResult = do "evaluate" m default
        let wasCorrect = result.correct
        let wasResponse = result.response
      `);
      analyze(ast, '', '');
      let state = createInitialState(ast);
      // AI returns the structural type as an object
      state = runWithMockAI(state, { correct: true, response: false });

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['wasCorrect'].value).toBe(true);
      expect(state.callStack[0].locals['wasResponse'].value).toBe(false);
    });

    it('structural type from function return supports member access', () => {
      const ast = parse(`
        type AnswerResult {
          correct: boolean,
          guess: text
        }
        model m = { name: "test", apiKey: "key", url: "http://test" }
        function getAnswer(q: text): AnswerResult {
          const answer: AnswerResult = do "answer {q}" m default
          return answer
        }
        const result = getAnswer("what is 2+2?")
        let isCorrect = result.correct
        let theGuess = result.guess
      `);
      analyze(ast, '', '');
      let state = createInitialState(ast);
      // AI returns the structural type as an object
      state = runWithMockAI(state, { correct: true, guess: 'four' });

      expect(state.status).toBe('completed');
      expect(state.callStack[0].locals['isCorrect'].value).toBe(true);
      expect(state.callStack[0].locals['theGuess'].value).toBe('four');
    });
  });
});
