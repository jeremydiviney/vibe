import { describe, expect, test } from 'bun:test';
import { parse } from '../parse';
import type * as AST from '../../ast';

describe('Parser - Import Declarations', () => {
  test('single import from TypeScript file', () => {
    const source = `import { add } from "./math.ts"`;
    const ast = parse(source);

    expect(ast.body).toHaveLength(1);
    const importDecl = ast.body[0] as AST.ImportDeclaration;
    expect(importDecl.type).toBe('ImportDeclaration');
    expect(importDecl.specifiers).toEqual([{ imported: 'add', local: 'add' }]);
    expect(importDecl.source).toBe('./math.ts');
    expect(importDecl.sourceType).toBe('ts');
  });

  test('multiple imports from TypeScript file', () => {
    const source = `import { add, subtract, multiply } from "./math.ts"`;
    const ast = parse(source);

    const importDecl = ast.body[0] as AST.ImportDeclaration;
    expect(importDecl.specifiers).toEqual([
      { imported: 'add', local: 'add' },
      { imported: 'subtract', local: 'subtract' },
      { imported: 'multiply', local: 'multiply' },
    ]);
    expect(importDecl.sourceType).toBe('ts');
  });

  test('import from Vibe file', () => {
    const source = `import { greet } from "./utils.vibe"`;
    const ast = parse(source);

    const importDecl = ast.body[0] as AST.ImportDeclaration;
    expect(importDecl.specifiers).toEqual([{ imported: 'greet', local: 'greet' }]);
    expect(importDecl.source).toBe('./utils.vibe');
    expect(importDecl.sourceType).toBe('vibe');
  });

  test('import from JavaScript file', () => {
    const source = `import { helper } from "./helper.js"`;
    const ast = parse(source);

    const importDecl = ast.body[0] as AST.ImportDeclaration;
    expect(importDecl.sourceType).toBe('ts'); // JS files are treated as TS
  });

  test('multiple import statements', () => {
    const source = `
      import { add } from "./math.ts"
      import { greet } from "./greet.vibe"
      let x = add("a", "b")
    `;
    const ast = parse(source);

    expect(ast.body).toHaveLength(3);
    expect((ast.body[0] as AST.ImportDeclaration).type).toBe('ImportDeclaration');
    expect((ast.body[1] as AST.ImportDeclaration).type).toBe('ImportDeclaration');
    expect((ast.body[2] as AST.LetDeclaration).type).toBe('LetDeclaration');
  });
});

describe('Parser - Export Declarations', () => {
  test('export function', () => {
    const source = `
      export function greet(name: text): text {
        return do "Hello {name}" gpt default
      }
    `;
    const ast = parse(source);

    expect(ast.body).toHaveLength(1);
    const exportDecl = ast.body[0] as AST.ExportDeclaration;
    expect(exportDecl.type).toBe('ExportDeclaration');
    expect(exportDecl.declaration.type).toBe('FunctionDeclaration');
    expect((exportDecl.declaration as AST.FunctionDeclaration).name).toBe('greet');
  });

  test('export let', () => {
    const source = `export let counter = "0"`;
    const ast = parse(source);

    const exportDecl = ast.body[0] as AST.ExportDeclaration;
    expect(exportDecl.type).toBe('ExportDeclaration');
    expect(exportDecl.declaration.type).toBe('LetDeclaration');
    expect((exportDecl.declaration as AST.LetDeclaration).name).toBe('counter');
  });

  test('export const', () => {
    const source = `export const API_KEY = "secret123"`;
    const ast = parse(source);

    const exportDecl = ast.body[0] as AST.ExportDeclaration;
    expect(exportDecl.type).toBe('ExportDeclaration');
    expect(exportDecl.declaration.type).toBe('ConstDeclaration');
    expect((exportDecl.declaration as AST.ConstDeclaration).name).toBe('API_KEY');
  });

  test('export model', () => {
    const source = `export model gpt = { name: "gpt-4" }`;
    const ast = parse(source);

    const exportDecl = ast.body[0] as AST.ExportDeclaration;
    expect(exportDecl.type).toBe('ExportDeclaration');
    expect(exportDecl.declaration.type).toBe('ModelDeclaration');
    expect((exportDecl.declaration as AST.ModelDeclaration).name).toBe('gpt');
  });

  test('multiple exports', () => {
    const source = `
      export function add(a: text, b: text): text {
        return ts(a, b) { return a + b }
      }
      export const PI = "3.14159"
      export model gpt = { name: "gpt-4" }
    `;
    const ast = parse(source);

    expect(ast.body).toHaveLength(3);
    expect((ast.body[0] as AST.ExportDeclaration).declaration.type).toBe('FunctionDeclaration');
    expect((ast.body[1] as AST.ExportDeclaration).declaration.type).toBe('ConstDeclaration');
    expect((ast.body[2] as AST.ExportDeclaration).declaration.type).toBe('ModelDeclaration');
  });
});

describe('Parser - Import and Export Combined', () => {
  test('import and export in same file', () => {
    const source = `
      import { helper } from "./helper.ts"

      export function greet(name: text): text {
        let greeting = helper(name)
        return do "{greeting}" gpt default
      }
    `;
    const ast = parse(source);

    expect(ast.body).toHaveLength(2);
    expect((ast.body[0] as AST.ImportDeclaration).type).toBe('ImportDeclaration');
    expect((ast.body[1] as AST.ExportDeclaration).type).toBe('ExportDeclaration');
  });
});
