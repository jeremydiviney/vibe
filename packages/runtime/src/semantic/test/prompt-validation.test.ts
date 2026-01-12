import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';

describe('Semantic Analyzer - Prompt Parameter Validation', () => {
  const analyzer = new SemanticAnalyzer();

  function getErrors(code: string): string[] {
    const ast = parse(code);
    const errors = analyzer.analyze(ast, code);
    return errors.map((e) => e.message);
  }

  const modelDecl = 'model m = { name: "test", apiKey: "key", url: "http://test" }';

  // ============================================================================
  // Valid prompt parameters - String literals
  // ============================================================================

  describe('string literals as prompts', () => {
    test('vibe with string literal prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x: text = vibe "What is 2+2?" m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with question prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x: text = vibe "What is your name?" m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with string literal prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x: text = vibe "Generate a hello function" m default
      `);
      expect(errors).toEqual([]);
    });
  });

  // ============================================================================
  // Valid prompt parameters - Variables with prompt type
  // ============================================================================

  describe('prompt typed variables as prompts', () => {
    test('vibe with prompt typed variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let question: prompt = "What is 2+2?"
        let x: text = vibe question m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with const prompt variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        const userPrompt: prompt = "What is your name?"
        let x: text = vibe userPrompt m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with prompt typed variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let instruction: prompt = "Generate a hello function"
        let x: text = vibe instruction m default
      `);
      expect(errors).toEqual([]);
    });
  });

  // ============================================================================
  // Valid prompt parameters - Variables with text type
  // ============================================================================

  describe('text typed variables as prompts', () => {
    test('vibe with text typed variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let question: text = "What is 2+2?"
        let x: text = vibe question m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with const text variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        const userInput: text = "What is your name?"
        let x: text = vibe userInput m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with text typed variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let instruction: text = "Generate code"
        let x: text = vibe instruction m default
      `);
      expect(errors).toEqual([]);
    });
  });

  // ============================================================================
  // Valid prompt parameters - Variables without type annotation (implicitly text)
  // ============================================================================

  describe('untyped variables as prompts', () => {
    test('vibe with untyped variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let question = "What is 2+2?"
        let x: text = vibe question m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with const untyped variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        const userInput = "What is your name?"
        let x: text = vibe userInput m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with untyped variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let instruction = "Generate code"
        let x: text = vibe instruction m default
      `);
      expect(errors).toEqual([]);
    });
  });

  // ============================================================================
  // Invalid prompt parameters - JSON typed variables
  // ============================================================================

  describe('json typed variables as prompts (invalid)', () => {
    test('vibe with json typed variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let data: json = "{\\"key\\": \\"value\\"}"
        let x: text = vibe data m default
      `);
      expect(errors).toContain("Cannot use json typed variable 'data' as prompt");
    });

    test('vibe with const json variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        const config: json = "[]"
        let x: text = vibe config m default
      `);
      expect(errors).toContain("Cannot use json typed variable 'config' as prompt");
    });

    test('vibe with json typed variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let schema: json = "{}"
        let x: text = vibe schema m default
      `);
      expect(errors).toContain("Cannot use json typed variable 'schema' as prompt");
    });
  });

  // ============================================================================
  // Invalid prompt parameters - Model references
  // ============================================================================

  describe('model references as prompts (invalid)', () => {
    test('vibe with model as prompt errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x: text = vibe m m default
      `);
      expect(errors).toContain("Cannot use model 'm' as prompt");
    });

    test('vibe with model as both prompt and model errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x: text = vibe m m default
      `);
      expect(errors).toContain("Cannot use model 'm' as prompt");
    });
  });

  // ============================================================================
  // Invalid prompt parameters - Function references
  // ============================================================================

  describe('function references as prompts (invalid)', () => {
    test('vibe with function as prompt errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        function myFunc() {
          return "hello"
        }
        let x: text = vibe myFunc m default
      `);
      expect(errors).toContain("Cannot use function 'myFunc' as prompt");
    });

    test('vibe with another function as prompt errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        function getQuestion() {
          return "question"
        }
        let x: text = vibe getQuestion m default
      `);
      expect(errors).toContain("Cannot use function 'getQuestion' as prompt");
    });

    test('vibe with function as prompt errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        function generate() {
          return "code"
        }
        let x: text = vibe generate m default
      `);
      expect(errors).toContain("Cannot use function 'generate' as prompt");
    });
  });

  // ============================================================================
  // Undefined variables as prompts
  // ============================================================================

  describe('undefined variables as prompts', () => {
    test('vibe with undefined variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x: text = vibe undefinedVar m default
      `);
      expect(errors).toContain("'undefinedVar' is not defined");
    });

    test('vibe with missing variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x: text = vibe missingQuestion m default
      `);
      expect(errors).toContain("'missingQuestion' is not defined");
    });

    test('vibe with undefined variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x: text = vibe notDefined m default
      `);
      expect(errors).toContain("'notDefined' is not defined");
    });
  });

  // ============================================================================
  // Function parameters as prompts
  // ============================================================================

  describe('function parameters as prompts', () => {
    test('vibe with function parameter is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function askAI(question: text): text {
          return vibe question m default
        }
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with message parameter is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function getUserInput(message: text): text {
          return vibe message m default
        }
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with function parameter is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function generateCode(instruction: text): text {
          return vibe instruction m default
        }
      `);
      expect(errors).toEqual([]);
    });
  });

  // ============================================================================
  // Call expressions as prompts (valid - returns text at runtime)
  // ============================================================================

  describe('call expressions as prompts', () => {
    test('vibe with function call as prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function getQuestion(): text {
          return "What is 2+2?"
        }
        let x: text = vibe getQuestion() m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with buildPrompt function call is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function buildPrompt(): text {
          return "Enter name:"
        }
        let x: text = vibe buildPrompt() m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with function call as prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function getInstruction(): text {
          return "Generate code"
        }
        let x: text = vibe getInstruction() m default
      `);
      expect(errors).toEqual([]);
    });
  });
});
