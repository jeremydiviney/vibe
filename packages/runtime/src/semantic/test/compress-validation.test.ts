import { describe, test, expect } from 'bun:test';
import { parse } from '../../parser/parse';
import { SemanticAnalyzer } from '../analyzer';

function getErrors(source: string): string[] {
  const ast = parse(source);
  const analyzer = new SemanticAnalyzer();
  return analyzer.analyze(ast, source).map((e) => e.message);
}

describe('Compress Context Mode Validation', () => {
  describe('valid compress usage', () => {
    test('compress with no arguments is valid', () => {
      const errors = getErrors(`
        for i in [1, 2, 3] {
          let x = i
        } compress
      `);
      expect(errors).toEqual([]);
    });

    test('compress with string literal is valid', () => {
      const errors = getErrors(`
        for i in [1, 2, 3] {
          let x = i
        } compress("summarize")
      `);
      expect(errors).toEqual([]);
    });

    test('compress with model identifier is valid', () => {
      const errors = getErrors(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        for i in [1, 2, 3] {
          let x = i
        } compress(m)
      `);
      expect(errors).toEqual([]);
    });

    test('compress with prompt variable is valid', () => {
      const errors = getErrors(`
        const SUMMARY: prompt = "summarize the loop"
        for i in [1, 2, 3] {
          let x = i
        } compress(SUMMARY)
      `);
      expect(errors).toEqual([]);
    });

    test('compress with text variable is valid (treated as prompt)', () => {
      const errors = getErrors(`
        const summary: text = "summarize the loop"
        for i in [1, 2, 3] {
          let x = i
        } compress(summary)
      `);
      expect(errors).toEqual([]);
    });

    test('compress with string literal and model is valid', () => {
      const errors = getErrors(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        for i in [1, 2, 3] {
          let x = i
        } compress("summarize", m)
      `);
      expect(errors).toEqual([]);
    });

    test('compress with prompt variable and model is valid', () => {
      const errors = getErrors(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        const SUMMARY: prompt = "summarize the loop"
        for i in [1, 2, 3] {
          let x = i
        } compress(SUMMARY, m)
      `);
      expect(errors).toEqual([]);
    });
  });

  describe('invalid compress usage', () => {
    test('compress with undeclared identifier reports error', () => {
      const errors = getErrors(`
        for i in [1, 2, 3] {
          let x = i
        } compress(undeclared)
      `);
      expect(errors).toContain("compress argument 'undeclared' is not declared");
    });

    test('compress with undeclared model identifier reports error', () => {
      const errors = getErrors(`
        const SUMMARY: prompt = "summarize"
        for i in [1, 2, 3] {
          let x = i
        } compress(SUMMARY, undeclaredModel)
      `);
      expect(errors).toContain("compress model 'undeclaredModel' is not declared");
    });

    test('compress with json variable reports error', () => {
      const errors = getErrors(`
        const config: json = { key: "value" }
        for i in [1, 2, 3] {
          let x = i
        } compress(config)
      `);
      expect(errors).toContain("compress argument 'config' must be prompt or model type, got json");
    });

    test('compress with number variable reports error', () => {
      const errors = getErrors(`
        const num: number = 42
        for i in [1, 2, 3] {
          let x = i
        } compress(num)
      `);
      expect(errors).toContain("compress argument 'num' must be prompt or model type, got number");
    });

    test('compress with function as argument reports error', () => {
      const errors = getErrors(`
        function myFunc(x: text): text { return x }
        for i in [1, 2, 3] {
          let x = i
        } compress(myFunc)
      `);
      expect(errors).toContain("compress argument 'myFunc' must be prompt or model type, got function");
    });

    test('compress second arg must be model type', () => {
      const errors = getErrors(`
        const SUMMARY: prompt = "summarize"
        const notModel: text = "not a model"
        for i in [1, 2, 3] {
          let x = i
        } compress(SUMMARY, notModel)
      `);
      expect(errors).toContain("compress second argument 'notModel' must be model type, got text");
    });

    test('compress first arg must be prompt type when two args provided', () => {
      const errors = getErrors(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        const config: json = { key: "value" }
        for i in [1, 2, 3] {
          let x = i
        } compress(config, m)
      `);
      expect(errors).toContain("compress first argument 'config' must be prompt type when two arguments provided, got json");
    });
  });

  describe('while loop compress validation', () => {
    test('while loop compress with model is valid', () => {
      const errors = getErrors(`
        model m = { name: "test", apiKey: "key", url: "http://test" }
        let i = 0
        while (i < 3) {
          i = i + 1
        } compress(m)
      `);
      expect(errors).toEqual([]);
    });

    test('while loop compress with invalid type reports error', () => {
      const errors = getErrors(`
        const num: number = 42
        let i = 0
        while (i < 3) {
          i = i + 1
        } compress(num)
      `);
      expect(errors).toContain("compress argument 'num' must be prompt or model type, got number");
    });
  });
});
