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
    test('do with string literal prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x = do "What is 2+2?" m default
      `);
      expect(errors).toEqual([]);
    });

    test('ask with string literal prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x = ask "What is your name?" m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with string literal prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x = vibe "Generate a hello function" m
      `);
      expect(errors).toEqual([]);
    });
  });

  // ============================================================================
  // Valid prompt parameters - Variables with prompt type
  // ============================================================================

  describe('prompt typed variables as prompts', () => {
    test('do with prompt typed variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let question: prompt = "What is 2+2?"
        let x = do question m default
      `);
      expect(errors).toEqual([]);
    });

    test('ask with prompt typed variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        const userPrompt: prompt = "What is your name?"
        let x = ask userPrompt m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with prompt typed variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let instruction: prompt = "Generate a hello function"
        let x = vibe instruction m
      `);
      expect(errors).toEqual([]);
    });
  });

  // ============================================================================
  // Valid prompt parameters - Variables with text type
  // ============================================================================

  describe('text typed variables as prompts', () => {
    test('do with text typed variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let question: text = "What is 2+2?"
        let x = do question m default
      `);
      expect(errors).toEqual([]);
    });

    test('ask with text typed variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        const userInput: text = "What is your name?"
        let x = ask userInput m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with text typed variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let instruction: text = "Generate code"
        let x = vibe instruction m
      `);
      expect(errors).toEqual([]);
    });
  });

  // ============================================================================
  // Valid prompt parameters - Variables without type annotation (implicitly text)
  // ============================================================================

  describe('untyped variables as prompts', () => {
    test('do with untyped variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let question = "What is 2+2?"
        let x = do question m default
      `);
      expect(errors).toEqual([]);
    });

    test('ask with untyped variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        const userInput = "What is your name?"
        let x = ask userInput m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with untyped variable is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        let instruction = "Generate code"
        let x = vibe instruction m
      `);
      expect(errors).toEqual([]);
    });
  });

  // ============================================================================
  // Invalid prompt parameters - JSON typed variables
  // ============================================================================

  describe('json typed variables as prompts (invalid)', () => {
    test('do with json typed variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let data: json = "{\\"key\\": \\"value\\"}"
        let x = do data m default
      `);
      expect(errors).toContain("Cannot use json typed variable 'data' as prompt");
    });

    test('ask with json typed variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        const config: json = "[]"
        let x = ask config m default
      `);
      expect(errors).toContain("Cannot use json typed variable 'config' as prompt");
    });

    test('vibe with json typed variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let schema: json = "{}"
        let x = vibe schema m
      `);
      expect(errors).toContain("Cannot use json typed variable 'schema' as prompt");
    });
  });

  // ============================================================================
  // Invalid prompt parameters - Model references
  // ============================================================================

  describe('model references as prompts (invalid)', () => {
    test('do with model as prompt errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x = do m m default
      `);
      expect(errors).toContain("Cannot use model 'm' as prompt");
    });

    test('ask with model as prompt errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x = ask m m default
      `);
      expect(errors).toContain("Cannot use model 'm' as prompt");
    });
  });

  // ============================================================================
  // Invalid prompt parameters - Function references
  // ============================================================================

  describe('function references as prompts (invalid)', () => {
    test('do with function as prompt errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        function myFunc() {
          return "hello"
        }
        let x = do myFunc m default
      `);
      expect(errors).toContain("Cannot use function 'myFunc' as prompt");
    });

    test('ask with function as prompt errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        function getQuestion() {
          return "question"
        }
        let x = ask getQuestion m default
      `);
      expect(errors).toContain("Cannot use function 'getQuestion' as prompt");
    });

    test('vibe with function as prompt errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        function generate() {
          return "code"
        }
        let x = vibe generate m
      `);
      expect(errors).toContain("Cannot use function 'generate' as prompt");
    });
  });

  // ============================================================================
  // Undefined variables as prompts
  // ============================================================================

  describe('undefined variables as prompts', () => {
    test('do with undefined variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x = do undefinedVar m default
      `);
      expect(errors).toContain("'undefinedVar' is not defined");
    });

    test('ask with undefined variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x = ask missingQuestion m default
      `);
      expect(errors).toContain("'missingQuestion' is not defined");
    });

    test('vibe with undefined variable errors', () => {
      const errors = getErrors(`
        ${modelDecl}
        let x = vibe notDefined m
      `);
      expect(errors).toContain("'notDefined' is not defined");
    });
  });

  // ============================================================================
  // Function parameters as prompts
  // ============================================================================

  describe('function parameters as prompts', () => {
    test('do with function parameter is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function askAI(question: text): text {
          return do question m default
        }
      `);
      expect(errors).toEqual([]);
    });

    test('ask with function parameter is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function getUserInput(message: text): text {
          return ask message m default
        }
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with function parameter is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function generateCode(instruction: text): text {
          return vibe instruction m
        }
      `);
      expect(errors).toEqual([]);
    });
  });

  // ============================================================================
  // Call expressions as prompts (valid - returns text at runtime)
  // ============================================================================

  describe('call expressions as prompts', () => {
    test('do with function call as prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function getQuestion(): text {
          return "What is 2+2?"
        }
        let x = do getQuestion() m default
      `);
      expect(errors).toEqual([]);
    });

    test('ask with function call as prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function buildPrompt(): text {
          return "Enter name:"
        }
        let x = ask buildPrompt() m default
      `);
      expect(errors).toEqual([]);
    });

    test('vibe with function call as prompt is valid', () => {
      const errors = getErrors(`
        ${modelDecl}
        function getInstruction(): text {
          return "Generate code"
        }
        let x = vibe getInstruction() m
      `);
      expect(errors).toEqual([]);
    });
  });
});
