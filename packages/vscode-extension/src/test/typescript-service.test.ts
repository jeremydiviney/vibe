import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TypeScriptService } from '../services/typescript-service';

// Normalize paths for cross-platform comparison
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

describe('TypeScriptService', () => {
  let service: TypeScriptService;
  let tempDir: string;
  let sampleTsFile: string;

  beforeAll(() => {
    service = new TypeScriptService();

    // Create a temp directory with a sample TypeScript file
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-ts-test-'));
    sampleTsFile = path.join(tempDir, 'utils.ts');

    fs.writeFileSync(sampleTsFile, `
/**
 * Adds two numbers together
 */
export function add(a: number, b: number): number {
  return a + b;
}

export const PI = 3.14159;

export class Calculator {
  multiply(a: number, b: number): number {
    return a * b;
  }
}

export interface Config {
  name: string;
  value: number;
}
`);
  });

  afterAll(() => {
    service.clear();
    // Clean up temp files
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('resolveImportPath', () => {
    it('should resolve relative paths with .ts extension', () => {
      const vibeFile = path.join(tempDir, 'test.vibe');
      const resolved = service.resolveImportPath(vibeFile, './utils.ts');
      expect(resolved).toBe(sampleTsFile);
    });

    it('should resolve relative paths without extension', () => {
      const vibeFile = path.join(tempDir, 'test.vibe');
      const resolved = service.resolveImportPath(vibeFile, './utils');
      expect(resolved).toBe(sampleTsFile);
    });

    it('should return null for non-existent files', () => {
      const vibeFile = path.join(tempDir, 'test.vibe');
      const resolved = service.resolveImportPath(vibeFile, './nonexistent');
      expect(resolved).toBeNull();
    });
  });

  describe('getDefinition', () => {
    it('should find function definition', () => {
      const def = service.getDefinition(sampleTsFile, 'add');
      expect(def).not.toBeNull();
      expect(normalizePath(def!.file)).toBe(normalizePath(sampleTsFile));
      expect(def!.line).toBeGreaterThanOrEqual(0);
    });

    it('should find const definition', () => {
      const def = service.getDefinition(sampleTsFile, 'PI');
      expect(def).not.toBeNull();
      expect(normalizePath(def!.file)).toBe(normalizePath(sampleTsFile));
    });

    it('should find class definition', () => {
      const def = service.getDefinition(sampleTsFile, 'Calculator');
      expect(def).not.toBeNull();
      expect(normalizePath(def!.file)).toBe(normalizePath(sampleTsFile));
    });

    it('should find interface definition', () => {
      const def = service.getDefinition(sampleTsFile, 'Config');
      expect(def).not.toBeNull();
      expect(normalizePath(def!.file)).toBe(normalizePath(sampleTsFile));
    });

    it('should return null for non-existent symbol', () => {
      const def = service.getDefinition(sampleTsFile, 'nonExistent');
      expect(def).toBeNull();
    });
  });

  describe('getHoverInfo', () => {
    it('should get hover info for function', () => {
      const hover = service.getHoverInfo(sampleTsFile, 'add');
      expect(hover).not.toBeNull();
      expect(hover!.displayString).toContain('add');
      expect(hover!.displayString).toContain('number');
    });

    it('should get hover info with documentation', () => {
      const hover = service.getHoverInfo(sampleTsFile, 'add');
      expect(hover).not.toBeNull();
      expect(hover!.documentation).toContain('Adds two numbers');
    });

    it('should get hover info for const', () => {
      const hover = service.getHoverInfo(sampleTsFile, 'PI');
      expect(hover).not.toBeNull();
      expect(hover!.displayString).toContain('PI');
    });

    it('should get hover info for class', () => {
      const hover = service.getHoverInfo(sampleTsFile, 'Calculator');
      expect(hover).not.toBeNull();
      expect(hover!.displayString).toContain('Calculator');
    });

    it('should return null for non-existent symbol', () => {
      const hover = service.getHoverInfo(sampleTsFile, 'nonExistent');
      expect(hover).toBeNull();
    });
  });

  describe('invalidateFile', () => {
    it('should clear cached file content', () => {
      // First read to cache
      service.getHoverInfo(sampleTsFile, 'add');

      // Invalidate
      service.invalidateFile(sampleTsFile);

      // Should still work after invalidation (re-reads file)
      const hover = service.getHoverInfo(sampleTsFile, 'add');
      expect(hover).not.toBeNull();
    });
  });
});
