import { describe, it, expect } from 'bun:test';
import { parse } from '../parse';
import type * as AST from '../../ast';

describe('async keyword parsing', () => {
  describe('async let declarations', () => {
    it('parses async let with do expression', () => {
      const code = 'async let x = do "prompt" myModel';
      const ast = parse(code);

      expect(ast.body.length).toBe(1);
      const decl = ast.body[0] as AST.LetDeclaration;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.name).toBe('x');
      expect(decl.isAsync).toBe(true);
      expect(decl.initializer?.type).toBe('VibeExpression');
    });

    it('parses async let with vibe expression', () => {
      const code = 'async let result = vibe "analyze this" myModel';
      const ast = parse(code);

      const decl = ast.body[0] as AST.LetDeclaration;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.name).toBe('result');
      expect(decl.isAsync).toBe(true);
      const vibeExpr = decl.initializer as AST.VibeExpression;
      expect(vibeExpr.operationType).toBe('vibe');
    });

    it('parses async let with type annotation', () => {
      const code = 'async let x: text = do "prompt" myModel';
      const ast = parse(code);

      const decl = ast.body[0] as AST.LetDeclaration;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.name).toBe('x');
      expect(decl.vibeType).toBe('text');
      expect(decl.isAsync).toBe(true);
    });

    it('parses async let with private modifier', () => {
      const code = 'async let private secret = do "get secret" myModel';
      const ast = parse(code);

      const decl = ast.body[0] as AST.LetDeclaration;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.name).toBe('secret');
      expect(decl.isAsync).toBe(true);
      expect(decl.isPrivate).toBe(true);
    });

    it('parses async let with ts block', () => {
      const code = 'async let data = ts() { return fetchData(); }';
      const ast = parse(code);

      const decl = ast.body[0] as AST.LetDeclaration;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.name).toBe('data');
      expect(decl.isAsync).toBe(true);
      expect(decl.initializer?.type).toBe('TsBlock');
    });

    it('parses async let with function call', () => {
      const code = 'async let result = fetchFromAPI()';
      const ast = parse(code);

      const decl = ast.body[0] as AST.LetDeclaration;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.name).toBe('result');
      expect(decl.isAsync).toBe(true);
      expect(decl.initializer?.type).toBe('CallExpression');
    });
  });

  describe('async const declarations', () => {
    it('parses async const with do expression', () => {
      const code = 'async const x = do "prompt" myModel';
      const ast = parse(code);

      const decl = ast.body[0] as AST.ConstDeclaration;
      expect(decl.type).toBe('ConstDeclaration');
      expect(decl.name).toBe('x');
      expect(decl.isAsync).toBe(true);
    });

    it('parses async const with type annotation', () => {
      const code = 'async const x: number = do "give number" myModel';
      const ast = parse(code);

      const decl = ast.body[0] as AST.ConstDeclaration;
      expect(decl.type).toBe('ConstDeclaration');
      expect(decl.name).toBe('x');
      expect(decl.vibeType).toBe('number');
      expect(decl.isAsync).toBe(true);
    });

    it('parses async const with private modifier', () => {
      const code = 'async const private API_KEY = fetchKey()';
      const ast = parse(code);

      const decl = ast.body[0] as AST.ConstDeclaration;
      expect(decl.type).toBe('ConstDeclaration');
      expect(decl.name).toBe('API_KEY');
      expect(decl.isAsync).toBe(true);
      expect(decl.isPrivate).toBe(true);
    });
  });

  describe('async destructuring declarations', () => {
    it('parses async let destructuring', () => {
      const code = 'async let {name: text, age: number} = do "get person" myModel';
      const ast = parse(code);

      const decl = ast.body[0] as AST.DestructuringDeclaration;
      expect(decl.type).toBe('DestructuringDeclaration');
      expect(decl.isConst).toBe(false);
      expect(decl.isAsync).toBe(true);
      expect(decl.fields.length).toBe(2);
      expect(decl.fields[0].name).toBe('name');
      expect(decl.fields[1].name).toBe('age');
    });

    it('parses async const destructuring', () => {
      const code = 'async const {x: number, y: number} = do "get coords" myModel';
      const ast = parse(code);

      const decl = ast.body[0] as AST.DestructuringDeclaration;
      expect(decl.type).toBe('DestructuringDeclaration');
      expect(decl.isConst).toBe(true);
      expect(decl.isAsync).toBe(true);
    });

    it('parses async destructuring with private fields', () => {
      const code = 'async let {private secret: text, public_data: json} = do "get data" myModel';
      const ast = parse(code);

      const decl = ast.body[0] as AST.DestructuringDeclaration;
      expect(decl.type).toBe('DestructuringDeclaration');
      expect(decl.isAsync).toBe(true);
      expect(decl.fields[0].isPrivate).toBe(true);
      expect(decl.fields[1].isPrivate).toBeUndefined();
    });
  });

  describe('async standalone statements (fire-and-forget)', () => {
    it('parses async do statement', () => {
      const code = 'async do "log something" myModel';
      const ast = parse(code);

      const stmt = ast.body[0] as AST.AsyncStatement;
      expect(stmt.type).toBe('AsyncStatement');
      const expr = stmt.expression as AST.VibeExpression;
      expect(expr.type).toBe('VibeExpression');
      expect(expr.operationType).toBe('do');
    });

    it('parses async vibe statement', () => {
      const code = 'async vibe "process data" myModel';
      const ast = parse(code);

      const stmt = ast.body[0] as AST.AsyncStatement;
      expect(stmt.type).toBe('AsyncStatement');
      const expr = stmt.expression as AST.VibeExpression;
      expect(expr.type).toBe('VibeExpression');
      expect(expr.operationType).toBe('vibe');
    });

    it('parses async ts block statement', () => {
      const code = 'async ts() { console.log("fire and forget"); }';
      const ast = parse(code);

      const stmt = ast.body[0] as AST.AsyncStatement;
      expect(stmt.type).toBe('AsyncStatement');
      expect(stmt.expression.type).toBe('TsBlock');
    });

    it('parses async function call statement', () => {
      const code = 'async logToAnalytics("event")';
      const ast = parse(code);

      const stmt = ast.body[0] as AST.AsyncStatement;
      expect(stmt.type).toBe('AsyncStatement');
      expect(stmt.expression.type).toBe('CallExpression');
    });

    it('parses async method call statement', () => {
      const code = 'async api.sendNotification("done")';
      const ast = parse(code);

      const stmt = ast.body[0] as AST.AsyncStatement;
      expect(stmt.type).toBe('AsyncStatement');
      expect(stmt.expression.type).toBe('CallExpression');
    });
  });

  describe('multiple async declarations', () => {
    it('parses multiple async operations in sequence', () => {
      const code = `
        async let a = do "1" myModel
        async let b = do "2" myModel
        async let c = tsFunc()
        let result = a + b + c
      `;
      const ast = parse(code);

      expect(ast.body.length).toBe(4);
      expect((ast.body[0] as AST.LetDeclaration).isAsync).toBe(true);
      expect((ast.body[1] as AST.LetDeclaration).isAsync).toBe(true);
      expect((ast.body[2] as AST.LetDeclaration).isAsync).toBe(true);
      expect((ast.body[3] as AST.LetDeclaration).isAsync).toBeUndefined();
    });

    it('parses mixed async and sync declarations', () => {
      const code = `
        let sync1 = "hello"
        async let async1 = do "prompt" myModel
        const sync2 = 42
        async const async2 = fetchData()
      `;
      const ast = parse(code);

      expect(ast.body.length).toBe(4);
      expect((ast.body[0] as AST.LetDeclaration).isAsync).toBeUndefined();
      expect((ast.body[1] as AST.LetDeclaration).isAsync).toBe(true);
      expect((ast.body[2] as AST.ConstDeclaration).isAsync).toBeUndefined();
      expect((ast.body[3] as AST.ConstDeclaration).isAsync).toBe(true);
    });
  });

  describe('regular declarations are not async', () => {
    it('regular let is not async', () => {
      const code = 'let x = do "prompt" myModel';
      const ast = parse(code);

      const decl = ast.body[0] as AST.LetDeclaration;
      expect(decl.isAsync).toBeUndefined();
    });

    it('regular const is not async', () => {
      const code = 'const x = 42';
      const ast = parse(code);

      const decl = ast.body[0] as AST.ConstDeclaration;
      expect(decl.isAsync).toBeUndefined();
    });
  });
});
