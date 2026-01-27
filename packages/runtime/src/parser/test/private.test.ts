import { describe, it, expect } from 'bun:test';
import { parse } from '../parse';
import type * as AST from '../../ast';

describe('private keyword parsing', () => {
  describe('let private', () => {
    it('parses let private with type annotation', () => {
      const code = 'let private apiKey: text = "secret"';
      const ast = parse(code);

      expect(ast.body.length).toBe(1);
      const decl = ast.body[0] as AST.LetDeclaration;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.name).toBe('apiKey');
      expect(decl.vibeType).toBe('text');
      expect(decl.isPrivate).toBe(true);
    });

    it('parses let private without type annotation', () => {
      const code = 'let private counter = 0';
      const ast = parse(code);

      const decl = ast.body[0] as AST.LetDeclaration;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.name).toBe('counter');
      expect(decl.vibeType).toBeNull();
      expect(decl.isPrivate).toBe(true);
    });

    it('parses regular let without private', () => {
      const code = 'let publicVar: text = "visible"';
      const ast = parse(code);

      const decl = ast.body[0] as AST.LetDeclaration;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.name).toBe('publicVar');
      expect(decl.isPrivate).toBeUndefined();
    });
  });

  describe('const private', () => {
    it('parses const private with type annotation', () => {
      const code = 'const private SECRET: text = "password"';
      const ast = parse(code);

      expect(ast.body.length).toBe(1);
      const decl = ast.body[0] as AST.ConstDeclaration;
      expect(decl.type).toBe('ConstDeclaration');
      expect(decl.name).toBe('SECRET');
      expect(decl.vibeType).toBe('text');
      expect(decl.isPrivate).toBe(true);
    });

    it('parses const private without type annotation', () => {
      const code = 'const private MAX_RETRIES = 3';
      const ast = parse(code);

      const decl = ast.body[0] as AST.ConstDeclaration;
      expect(decl.type).toBe('ConstDeclaration');
      expect(decl.name).toBe('MAX_RETRIES');
      expect(decl.isPrivate).toBe(true);
    });

    it('parses regular const without private', () => {
      const code = 'const publicConst = "visible"';
      const ast = parse(code);

      const decl = ast.body[0] as AST.ConstDeclaration;
      expect(decl.type).toBe('ConstDeclaration');
      expect(decl.name).toBe('publicConst');
      expect(decl.isPrivate).toBeUndefined();
    });
  });

  describe('destructuring with private fields', () => {
    it('parses destructuring with private field', () => {
      const code = 'let {private x: text, y: number} = someExpr';
      const ast = parse(code);

      const decl = ast.body[0] as AST.DestructuringDeclaration;
      expect(decl.type).toBe('DestructuringDeclaration');
      expect(decl.fields.length).toBe(2);

      expect(decl.fields[0].name).toBe('x');
      expect(decl.fields[0].type).toBe('text');
      expect(decl.fields[0].isPrivate).toBe(true);

      expect(decl.fields[1].name).toBe('y');
      expect(decl.fields[1].type).toBe('number');
      expect(decl.fields[1].isPrivate).toBeUndefined();
    });

    it('parses destructuring with all private fields', () => {
      const code = 'const {private a: text, private b: number} = someExpr';
      const ast = parse(code);

      const decl = ast.body[0] as AST.DestructuringDeclaration;
      expect(decl.isConst).toBe(true);
      expect(decl.fields.length).toBe(2);

      expect(decl.fields[0].name).toBe('a');
      expect(decl.fields[0].isPrivate).toBe(true);

      expect(decl.fields[1].name).toBe('b');
      expect(decl.fields[1].isPrivate).toBe(true);
    });

    it('parses destructuring with no private fields', () => {
      const code = 'let {x: text, y: number} = someExpr';
      const ast = parse(code);

      const decl = ast.body[0] as AST.DestructuringDeclaration;
      expect(decl.fields[0].isPrivate).toBeUndefined();
      expect(decl.fields[1].isPrivate).toBeUndefined();
    });
  });

  describe('mixed declarations', () => {
    it('parses multiple declarations with mixed visibility', () => {
      const code = `
        let private secret: text = "hidden"
        let visible: text = "shown"
        const private PASSWORD: text = "***"
        const PUBLIC_KEY: text = "key"
      `;
      const ast = parse(code);

      expect(ast.body.length).toBe(4);

      expect((ast.body[0] as AST.LetDeclaration).isPrivate).toBe(true);
      expect((ast.body[1] as AST.LetDeclaration).isPrivate).toBeUndefined();
      expect((ast.body[2] as AST.ConstDeclaration).isPrivate).toBe(true);
      expect((ast.body[3] as AST.ConstDeclaration).isPrivate).toBeUndefined();
    });
  });

  describe('function parameters with private', () => {
    it('parses function with private parameter', () => {
      const code = `
        function process(private secret: text, visible: text): text {
          return visible
        }
      `;
      const ast = parse(code);

      expect(ast.body.length).toBe(1);
      const func = ast.body[0] as AST.FunctionDeclaration;
      expect(func.type).toBe('FunctionDeclaration');
      expect(func.name).toBe('process');
      expect(func.params.length).toBe(2);

      expect(func.params[0].name).toBe('secret');
      expect(func.params[0].vibeType).toBe('text');
      expect(func.params[0].isPrivate).toBe(true);

      expect(func.params[1].name).toBe('visible');
      expect(func.params[1].vibeType).toBe('text');
      expect(func.params[1].isPrivate).toBeUndefined();
    });

    it('parses function with all private parameters', () => {
      const code = `
        function secure(private key: text, private value: json): boolean {
          return true
        }
      `;
      const ast = parse(code);

      const func = ast.body[0] as AST.FunctionDeclaration;
      expect(func.params.length).toBe(2);
      expect(func.params[0].isPrivate).toBe(true);
      expect(func.params[1].isPrivate).toBe(true);
    });

    it('parses function with no private parameters', () => {
      const code = `
        function public(a: text, b: number): text {
          return a
        }
      `;
      const ast = parse(code);

      const func = ast.body[0] as AST.FunctionDeclaration;
      expect(func.params.length).toBe(2);
      expect(func.params[0].isPrivate).toBeUndefined();
      expect(func.params[1].isPrivate).toBeUndefined();
    });

    it('parses exported function with private parameter', () => {
      const code = `
        export function runBench(guesser: model, answerer: model, private secretEntry: json, runId: text): text {
          return runId
        }
      `;
      const ast = parse(code);

      expect(ast.body.length).toBe(1);
      const exportDecl = ast.body[0] as AST.ExportDeclaration;
      expect(exportDecl.type).toBe('ExportDeclaration');

      const func = exportDecl.declaration as AST.FunctionDeclaration;
      expect(func.params.length).toBe(4);

      expect(func.params[0].name).toBe('guesser');
      expect(func.params[0].isPrivate).toBeUndefined();

      expect(func.params[1].name).toBe('answerer');
      expect(func.params[1].isPrivate).toBeUndefined();

      expect(func.params[2].name).toBe('secretEntry');
      expect(func.params[2].isPrivate).toBe(true);

      expect(func.params[3].name).toBe('runId');
      expect(func.params[3].isPrivate).toBeUndefined();
    });
  });
});
