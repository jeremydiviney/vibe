import { describe, it, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, resumeWithAIResponse } from '../state';
import { runUntilPause } from '../step';
import { isVibeValue } from '../types';
import type { ModelUsageRecord } from '../ai/types';

const mockUsageRecord: ModelUsageRecord = {
  requestId: 1,
  inputTokens: 100,
  outputTokens: 50,
  cachedInputTokens: 20,
  thinkingTokens: 10,
};

// Helper to run until AI pause and resume with mock response + usage
function runWithMockAI(
  state: ReturnType<typeof createInitialState>,
  response: unknown,
  usageRecord?: ModelUsageRecord
) {
  state = runUntilPause(state);
  while (state.status === 'awaiting_ai') {
    state = resumeWithAIResponse(state, response, undefined, undefined, usageRecord);
    state = runUntilPause(state);
  }
  return state;
}

describe('Usage Tracking', () => {
  describe('result.usage (per-request)', () => {
    it('AI result VibeValue has usage record attached', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "test" m default
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'answer', mockUsageRecord);

      const vibeValue = state.callStack[0].locals['result'];
      expect(isVibeValue(vibeValue)).toBe(true);
      expect(vibeValue.usage).toEqual(mockUsageRecord);
    });

    it('result.usage is accessible via member access in Vibe', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "test" m default
        let u = result.usage
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'answer', mockUsageRecord);

      const u = state.callStack[0].locals['u'];
      expect(isVibeValue(u)).toBe(true);
      expect(u.value).toEqual(mockUsageRecord);
    });

    it('result.usage fields are accessible via nested member access', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "test" m default
        let tokens = result.usage.inputTokens
      `);
      let state = createInitialState(ast);
      state = runWithMockAI(state, 'answer', mockUsageRecord);

      const tokens = state.callStack[0].locals['tokens'];
      expect(isVibeValue(tokens)).toBe(true);
      expect(tokens.value).toBe(100);
    });

    it('result.usage is null when no usage data provided', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "test" m default
        let u = result.usage
      `);
      let state = createInitialState(ast);
      // No usage record passed
      state = runWithMockAI(state, 'answer', undefined);

      const vibeValue = state.callStack[0].locals['result'];
      expect(vibeValue.usage).toBeUndefined();
    });
  });

  describe('model.usage (accumulated array)', () => {
    it('model.usage returns empty array before any AI calls', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let u = m.usage
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      const u = state.callStack[0].locals['u'];
      expect(isVibeValue(u)).toBe(true);
      expect(u.value).toEqual([]);
    });

    it('model.usage returns array with one record after one AI call', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "test" m default
        let u = m.usage
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);
      // Resume with AI response and usage record
      state = resumeWithAIResponse(state, 'answer', undefined, undefined, mockUsageRecord);
      // Push usage onto model (simulating what index.ts does)
      const modelVar = state.callStack[0].locals['m'];
      const modelValue = modelVar.value as { usage: ModelUsageRecord[] };
      modelValue.usage.push(mockUsageRecord);
      // Continue running
      state = runUntilPause(state);

      const u = state.callStack[0].locals['u'];
      expect(isVibeValue(u)).toBe(true);
      expect(u.value).toEqual([mockUsageRecord]);
    });

    it('model.usage accumulates multiple records from multiple AI calls', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let r1 = do "first" m default
        let r2 = do "second" m default
        let u = m.usage
      `);
      let state = createInitialState(ast);

      const record1: ModelUsageRecord = { ...mockUsageRecord, requestId: 1 };
      const record2: ModelUsageRecord = { ...mockUsageRecord, requestId: 2, inputTokens: 200 };

      // First AI call
      state = runUntilPause(state);
      const modelVar1 = state.callStack[0].locals['m'];
      (modelVar1.value as { usage: ModelUsageRecord[] }).usage.push(record1);
      state = resumeWithAIResponse(state, 'first answer', undefined, undefined, record1);

      // Second AI call
      state = runUntilPause(state);
      const modelVar2 = state.callStack[0].locals['m'];
      (modelVar2.value as { usage: ModelUsageRecord[] }).usage.push(record2);
      state = resumeWithAIResponse(state, 'second answer', undefined, undefined, record2);

      // Continue to assign u
      state = runUntilPause(state);

      const u = state.callStack[0].locals['u'];
      expect(isVibeValue(u)).toBe(true);
      expect(u.value).toEqual([record1, record2]);
    });
  });

  describe('immutability', () => {
    it('push on model.usage does not mutate the original array', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "test" m default
        let u = m.usage
        u.push("hacked")
        let u2 = m.usage
      `);
      let state = createInitialState(ast);

      // Run until AI pause
      state = runUntilPause(state);
      // Push usage record onto model (simulating index.ts behavior)
      const modelVar = state.callStack[0].locals['m'];
      (modelVar.value as { usage: ModelUsageRecord[] }).usage.push(mockUsageRecord);
      state = resumeWithAIResponse(state, 'answer', undefined, undefined, mockUsageRecord);
      // Continue running to completion
      state = runUntilPause(state);

      // u2 should still have only the original record (push on u didn't affect model)
      const u2 = state.callStack[0].locals['u2'];
      expect(isVibeValue(u2)).toBe(true);
      expect(u2.value).toEqual([mockUsageRecord]);
    });

    it('pop on model.usage does not mutate the original array', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "test" m default
        let u = m.usage
        u.pop()
        let u2 = m.usage
      `);
      let state = createInitialState(ast);

      state = runUntilPause(state);
      const modelVar = state.callStack[0].locals['m'];
      (modelVar.value as { usage: ModelUsageRecord[] }).usage.push(mockUsageRecord);
      state = resumeWithAIResponse(state, 'answer', undefined, undefined, mockUsageRecord);
      state = runUntilPause(state);

      // u2 should still have the record (pop on u didn't affect model)
      const u2 = state.callStack[0].locals['u2'];
      expect(isVibeValue(u2)).toBe(true);
      expect(u2.value).toEqual([mockUsageRecord]);
    });

    it('modifying a usage record from the array does not affect the model', () => {
      // Since we return a shallow copy of the array, the objects inside are
      // the same references. But Vibe has no member assignment, so this
      // tests that accessing a record and trying to use it doesn't corrupt things.
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "test" m default
        let u = m.usage
        let first = u[0]
        let id = first.requestId
      `);
      let state = createInitialState(ast);

      state = runUntilPause(state);
      const modelVar = state.callStack[0].locals['m'];
      (modelVar.value as { usage: ModelUsageRecord[] }).usage.push(mockUsageRecord);
      state = resumeWithAIResponse(state, 'answer', undefined, undefined, mockUsageRecord);
      state = runUntilPause(state);

      // Can read fields but can't modify (no assignment syntax in Vibe)
      const id = state.callStack[0].locals['id'];
      expect(isVibeValue(id)).toBe(true);
      expect(id.value).toBe(1);
    });

    it('each access to model.usage returns a fresh copy', () => {
      const ast = parse(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let result = do "test" m default
        let u1 = m.usage
        let u2 = m.usage
        u1.push("extra")
        let u3 = m.usage
      `);
      let state = createInitialState(ast);

      state = runUntilPause(state);
      const modelVar = state.callStack[0].locals['m'];
      (modelVar.value as { usage: ModelUsageRecord[] }).usage.push(mockUsageRecord);
      state = resumeWithAIResponse(state, 'answer', undefined, undefined, mockUsageRecord);
      state = runUntilPause(state);

      // All three accesses to m.usage should return independent copies
      const u2 = state.callStack[0].locals['u2'];
      const u3 = state.callStack[0].locals['u3'];
      expect(isVibeValue(u2)).toBe(true);
      expect(u2.value).toEqual([mockUsageRecord]);
      expect(isVibeValue(u3)).toBe(true);
      expect(u3.value).toEqual([mockUsageRecord]); // push on u1 didn't affect u3
    });
  });

  describe('const array immutability', () => {
    it('push on const array produces runtime error', () => {
      const ast = parse(`
        const arr = [1, 2, 3]
        arr.push(4)
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('error');
      expect(state.error).toContain('Cannot push on a constant array');
    });

    it('pop on const array produces runtime error', () => {
      const ast = parse(`
        const arr = [1, 2, 3]
        arr.pop()
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('error');
      expect(state.error).toContain('Cannot pop on a constant array');
    });

    it('push on let array still works', () => {
      const ast = parse(`
        let arr = [1, 2, 3]
        arr.push(4)
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      const arr = state.callStack[0].locals['arr'];
      expect(isVibeValue(arr)).toBe(true);
      expect(arr.value).toEqual([1, 2, 3, 4]);
    });

    it('pop on let array still works', () => {
      const ast = parse(`
        let arr = [1, 2, 3]
        let popped = arr.pop()
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      const arr = state.callStack[0].locals['arr'];
      expect(arr.value).toEqual([1, 2]);
      const popped = state.callStack[0].locals['popped'];
      expect(isVibeValue(popped)).toBe(true);
      expect(popped.value).toBe(3);
    });

    it('const array reassignment produces runtime error', () => {
      const ast = parse(`
        const arr = [1, 2, 3]
        arr = [4, 5, 6]
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      expect(state.status).toBe('error');
      expect(state.error).toContain("Cannot assign to constant 'arr'");
    });

    it('len on const array still works', () => {
      const ast = parse(`
        const arr = [1, 2, 3]
        let size = arr.len()
      `);
      let state = createInitialState(ast);
      state = runUntilPause(state);

      const size = state.callStack[0].locals['size'];
      expect(isVibeValue(size)).toBe(true);
      expect(size.value).toBe(3);
    });
  });
});
