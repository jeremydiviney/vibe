import { describe, it, expect } from 'bun:test';
import { findTSImports, getTSImportForIdentifier } from '../utils/ast-utils';
import { parse } from '@vibe-lang/runtime/parser/parse';

describe('TypeScript Import Tracking', () => {
  describe('findTSImports', () => {
    it('should find TypeScript imports', () => {
      const code = `
import { add, multiply } from "./utils.ts"

let result = add(1, 2)
`;
      const ast = parse(code, { file: 'test.vibe' });
      const imports = findTSImports(ast);

      expect(imports.size).toBe(2);
      expect(imports.get('add')).toEqual({
        localName: 'add',
        importedName: 'add',
        sourcePath: './utils.ts',
      });
      expect(imports.get('multiply')).toEqual({
        localName: 'multiply',
        importedName: 'multiply',
        sourcePath: './utils.ts',
      });
    });

    it('should not include Vibe imports', () => {
      const code = `
import { helper } from "./helper.vibe"

helper()
`;
      const ast = parse(code, { file: 'test.vibe' });
      const imports = findTSImports(ast);

      expect(imports.size).toBe(0);
    });

    it('should handle multiple TS imports', () => {
      const code = `
import { add } from "./math.ts"
import { format } from "./strings.ts"

let result = format(add(1, 2))
`;
      const ast = parse(code, { file: 'test.vibe' });
      const imports = findTSImports(ast);

      expect(imports.size).toBe(2);
      expect(imports.has('add')).toBe(true);
      expect(imports.has('format')).toBe(true);
      expect(imports.get('add')!.sourcePath).toBe('./math.ts');
      expect(imports.get('format')!.sourcePath).toBe('./strings.ts');
    });

    it('should return empty map for no imports', () => {
      const code = `
function greet() {
  return "hello"
}
`;
      const ast = parse(code, { file: 'test.vibe' });
      const imports = findTSImports(ast);

      expect(imports.size).toBe(0);
    });
  });

  describe('getTSImportForIdentifier', () => {
    it('should return import info for TS imported identifier', () => {
      const code = `
import { add } from "./utils.ts"

let result = add(1, 2)
`;
      const ast = parse(code, { file: 'test.vibe' });
      const importInfo = getTSImportForIdentifier(ast, 'add');

      expect(importInfo).not.toBeNull();
      expect(importInfo!.importedName).toBe('add');
      expect(importInfo!.sourcePath).toBe('./utils.ts');
    });

    it('should return null for local identifier', () => {
      const code = `
function add(a: number, b: number): number {
  return a + b
}

let result = add(1, 2)
`;
      const ast = parse(code, { file: 'test.vibe' });
      const importInfo = getTSImportForIdentifier(ast, 'add');

      expect(importInfo).toBeNull();
    });

    it('should return null for non-existent identifier', () => {
      const code = `
import { add } from "./utils.ts"

let result = add(1, 2)
`;
      const ast = parse(code, { file: 'test.vibe' });
      const importInfo = getTSImportForIdentifier(ast, 'nonExistent');

      expect(importInfo).toBeNull();
    });

    it('should return null for Vibe imported identifier', () => {
      const code = `
import { helper } from "./helper.vibe"

helper()
`;
      const ast = parse(code, { file: 'test.vibe' });
      const importInfo = getTSImportForIdentifier(ast, 'helper');

      expect(importInfo).toBeNull();
    });
  });
});
