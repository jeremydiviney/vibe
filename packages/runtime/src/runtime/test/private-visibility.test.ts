import { describe, it, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { createInitialState, currentFrame } from '../state';
import { step } from '../step';
import { buildLocalContext, buildGlobalContext, formatContextForAI } from '../context';

describe('private variable visibility', () => {
  describe('runtime state', () => {
    it('stores isPrivate flag in VibeValue', () => {
      const code = 'let private secret: text = "hidden"';
      const ast = parse(code);
      let state = createInitialState(ast);

      // Execute until complete
      while (state.status === 'running') {
        state = step(state);
      }

      const frame = currentFrame(state);
      expect(frame.locals['secret']).toBeDefined();
      expect(frame.locals['secret'].value).toBe('hidden');
      expect(frame.locals['secret'].isPrivate).toBe(true);
    });

    it('stores isPrivate flag in orderedEntries', () => {
      const code = 'let private secret: text = "hidden"';
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const frame = currentFrame(state);
      const entry = frame.orderedEntries.find(
        (e) => e.kind === 'variable' && e.name === 'secret'
      );
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe('variable');
      if (entry?.kind === 'variable') {
        expect(entry.isPrivate).toBe(true);
      }
    });

    it('public variables do not have isPrivate flag', () => {
      const code = 'let visible: text = "shown"';
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const frame = currentFrame(state);
      expect(frame.locals['visible']).toBeDefined();
      expect(frame.locals['visible'].isPrivate).toBeUndefined();
    });
  });

  describe('context filtering', () => {
    it('filters private variables from local context', () => {
      const code = `
        let private secret: text = "hidden"
        let visible: text = "shown"
      `;
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const context = buildLocalContext(state);
      const varNames = context
        .filter((e) => e.kind === 'variable')
        .map((e) => (e as { name: string }).name);

      expect(varNames).toContain('visible');
      expect(varNames).not.toContain('secret');
    });

    it('filters private variables from global context', () => {
      const code = `
        let private secret: text = "hidden"
        let visible: text = "shown"
        const private API_KEY: text = "key"
        const PUBLIC: text = "pub"
      `;
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const context = buildGlobalContext(state);
      const varNames = context
        .filter((e) => e.kind === 'variable')
        .map((e) => (e as { name: string }).name);

      expect(varNames).toContain('visible');
      expect(varNames).toContain('PUBLIC');
      expect(varNames).not.toContain('secret');
      expect(varNames).not.toContain('API_KEY');
    });

    it('private variables still exist in runtime but hidden from context', () => {
      const code = `
        let private secret: text = "hidden"
        let visible: text = "shown"
      `;
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const frame = currentFrame(state);

      // Both exist in locals
      expect(frame.locals['secret']).toBeDefined();
      expect(frame.locals['visible']).toBeDefined();

      // Only visible appears in context
      const context = buildLocalContext(state);
      expect(context.length).toBe(1);
      expect((context[0] as { name: string }).name).toBe('visible');
    });

    it('filters private fields in destructuring from context', () => {
      // For destructuring, we test that the orderedEntries correctly store isPrivate
      const code = 'let private x: text = "a"';
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const frame = currentFrame(state);
      const entry = frame.orderedEntries[0];
      expect(entry.kind).toBe('variable');
      if (entry.kind === 'variable') {
        expect(entry.name).toBe('x');
        expect(entry.isPrivate).toBe(true);
      }

      // Verify filtered from context
      const context = buildLocalContext(state);
      expect(context.length).toBe(0);
    });
  });

  describe('mixed visibility scenarios', () => {
    it('handles multiple private and public vars correctly', () => {
      const code = `
        let private a: text = "1"
        let b: text = "2"
        let private c: text = "3"
        let d: text = "4"
        let private e: text = "5"
      `;
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const context = buildLocalContext(state);
      const varNames = context
        .filter((e) => e.kind === 'variable')
        .map((e) => (e as { name: string }).name);

      // Only b and d should be visible
      expect(varNames).toEqual(['b', 'd']);
    });
  });

  describe('destructuring with mixed visibility', () => {
    it('simulates destructuring: private x is hidden, public y is visible', () => {
      // Destructuring requires a do/vibe expression which needs AI.
      // We simulate the result by manually creating variables as if
      // `let {private x: text, y: number} = do "..." model` had executed.

      const code = 'let placeholder = 0';  // Need some code to initialize state
      const ast = parse(code);
      let state = createInitialState(ast);

      // Execute to get initial state set up
      while (state.status === 'running') {
        state = step(state);
      }

      // Now manually add variables as if destructuring had happened
      const frame = currentFrame(state);

      // Simulate: let {private x: text, y: number} = ...
      // x is private (isPrivate: true), y is public (no isPrivate)
      const newLocals = {
        ...frame.locals,
        x: {
          value: 'secret-value',
          err: false,
          errDetails: null,
          toolCalls: [],
          isConst: false,
          vibeType: 'text' as const,
          source: 'ai' as const,
          isPrivate: true,  // x is private
        },
        y: {
          value: 42,
          err: false,
          errDetails: null,
          toolCalls: [],
          isConst: false,
          vibeType: 'number' as const,
          source: 'ai' as const,
          // y has no isPrivate (public)
        },
      };

      const newOrderedEntries = [
        ...frame.orderedEntries,
        {
          kind: 'variable' as const,
          name: 'x',
          value: 'secret-value',
          type: 'text',
          isConst: false,
          source: 'ai' as const,
          isPrivate: true,  // x is private
        },
        {
          kind: 'variable' as const,
          name: 'y',
          value: 42,
          type: 'number',
          isConst: false,
          source: 'ai' as const,
          // y has no isPrivate (public)
        },
      ];

      state = {
        ...state,
        callStack: [
          ...state.callStack.slice(0, -1),
          { ...frame, locals: newLocals, orderedEntries: newOrderedEntries },
        ],
      };

      // Verify both exist in runtime
      const updatedFrame = currentFrame(state);
      expect(updatedFrame.locals['x']).toBeDefined();
      expect(updatedFrame.locals['x'].value).toBe('secret-value');
      expect(updatedFrame.locals['x'].isPrivate).toBe(true);

      expect(updatedFrame.locals['y']).toBeDefined();
      expect(updatedFrame.locals['y'].value).toBe(42);
      expect(updatedFrame.locals['y'].isPrivate).toBeUndefined();

      // Verify LOCAL context filtering: x hidden, y visible
      const localContext = buildLocalContext(state);
      const localVarNames = localContext
        .filter((e) => e.kind === 'variable')
        .map((e) => (e as { name: string }).name);

      expect(localVarNames).toContain('y');
      expect(localVarNames).not.toContain('x');
      expect(localVarNames).toContain('placeholder');  // public

      // Verify GLOBAL context filtering: x hidden, y visible
      const globalContext = buildGlobalContext(state);
      const globalVarNames = globalContext
        .filter((e) => e.kind === 'variable')
        .map((e) => (e as { name: string }).name);

      expect(globalVarNames).toContain('y');
      expect(globalVarNames).not.toContain('x');
      expect(globalVarNames).toContain('placeholder');  // public

      // Verify FORMATTED TEXT doesn't contain private variable
      // This is the actual text sent to AI
      const formattedLocal = formatContextForAI(localContext);
      expect(formattedLocal.text).toContain('y');
      expect(formattedLocal.text).not.toContain('secret-value');  // x's value
      expect(formattedLocal.text).not.toMatch(/\bx\b.*secret/);   // x: secret pattern

      const formattedGlobal = formatContextForAI(globalContext);
      expect(formattedGlobal.text).toContain('y');
      expect(formattedGlobal.text).not.toContain('secret-value');
      expect(formattedGlobal.text).not.toMatch(/\bx\b.*secret/);
    });
  });

  describe('private attribute propagation', () => {
    it('assigning private variable to new variable does NOT inherit private', () => {
      const code = `
        let private secret: text = "hidden"
        let copy = secret
      `;
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const frame = currentFrame(state);

      // Original is private
      expect(frame.locals['secret'].isPrivate).toBe(true);

      // Copy is NOT private - private applies to declaration, not value
      expect(frame.locals['copy'].isPrivate).toBeUndefined();

      // Context should show copy but not secret
      const context = buildLocalContext(state);
      const varNames = context
        .filter((e) => e.kind === 'variable')
        .map((e) => (e as { name: string }).name);

      expect(varNames).toContain('copy');
      expect(varNames).not.toContain('secret');
    });

    it('function return value from private input is NOT private', () => {
      const code = `
        let private secret: text = "hidden"

        function passThrough(val: text): text {
          return val
        }

        let result = passThrough(secret)
      `;
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const frame = currentFrame(state);

      // Original is private
      expect(frame.locals['secret'].isPrivate).toBe(true);

      // Result is NOT private - function return doesn't inherit privacy
      expect(frame.locals['result'].isPrivate).toBeUndefined();
      expect(frame.locals['result'].value).toBe('hidden');

      // Context should show result but not secret
      const context = buildLocalContext(state);
      const varNames = context
        .filter((e) => e.kind === 'variable')
        .map((e) => (e as { name: string }).name);

      expect(varNames).toContain('result');
      expect(varNames).not.toContain('secret');
    });

    it('function parameter does NOT inherit private from argument', () => {
      const code = `
        let private secret: text = "hidden"
        let captured: text = ""

        function capture(val: text): text {
          captured = val
          return val
        }

        let result = capture(secret)
      `;
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const frame = currentFrame(state);

      // Original is private
      expect(frame.locals['secret'].isPrivate).toBe(true);

      // Captured value is NOT private
      expect(frame.locals['captured'].isPrivate).toBeUndefined();
      expect(frame.locals['captured'].value).toBe('hidden');

      // Result is NOT private
      expect(frame.locals['result'].isPrivate).toBeUndefined();
    });

    it('explicitly declaring copy as private makes it private', () => {
      const code = `
        let private secret: text = "hidden"
        let private copy: text = secret
      `;
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const frame = currentFrame(state);

      // Both are private when explicitly declared
      expect(frame.locals['secret'].isPrivate).toBe(true);
      expect(frame.locals['copy'].isPrivate).toBe(true);

      // Neither appears in context
      const context = buildLocalContext(state);
      const varNames = context
        .filter((e) => e.kind === 'variable')
        .map((e) => (e as { name: string }).name);

      expect(varNames).not.toContain('secret');
      expect(varNames).not.toContain('copy');
    });
  });

  describe('formatted context text', () => {
    it('private variables do not appear in AI context text', () => {
      const code = `
        let private secret: text = "super-secret-password"
        let visible: text = "public-data"
      `;
      const ast = parse(code);
      let state = createInitialState(ast);

      while (state.status === 'running') {
        state = step(state);
      }

      const localContext = buildLocalContext(state);
      const globalContext = buildGlobalContext(state);

      // Format context as it would be sent to AI
      const formattedLocal = formatContextForAI(localContext);
      const formattedGlobal = formatContextForAI(globalContext);

      // Visible variable should appear in text
      expect(formattedLocal.text).toContain('visible');
      expect(formattedLocal.text).toContain('public-data');
      expect(formattedGlobal.text).toContain('visible');
      expect(formattedGlobal.text).toContain('public-data');

      // Private variable should NOT appear in text
      expect(formattedLocal.text).not.toContain('secret');
      expect(formattedLocal.text).not.toContain('super-secret-password');
      expect(formattedGlobal.text).not.toContain('secret');
      expect(formattedGlobal.text).not.toContain('super-secret-password');
    });
  });
});
