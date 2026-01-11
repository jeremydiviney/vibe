import { describe, test, expect, beforeEach } from 'bun:test';
import {
  registerTsImport,
  getTsImportInfo,
  isTsImportCall,
  setTsImportEntryLine,
  registerTempBreakpoint,
  popTempBreakpoint,
  clearTempBreakpoints,
  getAllTsImports,
  getTsImportsForFile,
  clearTsImports,
  buildTsEntryPointId,
  parseTsEntryPointId,
} from '../ts-import-tracker';

describe('TS Import Tracker', () => {
  beforeEach(() => {
    clearTsImports();
  });

  describe('registerTsImport', () => {
    test('registers a TS import', () => {
      registerTsImport('add', '/utils.ts', 'add', '/main.vibe', 5);

      const info = getTsImportInfo('/main.vibe', 'add');
      expect(info).toBeDefined();
      expect(info?.vibeName).toBe('add');
      expect(info?.tsFile).toBe('/utils.ts');
      expect(info?.tsFunctionName).toBe('add');
      expect(info?.importedBy).toBe('/main.vibe');
      expect(info?.importLine).toBe(5);
    });
  });

  describe('isTsImportCall', () => {
    test('returns true for registered import', () => {
      registerTsImport('calculate', '/math.ts', 'calculate', '/app.vibe', 10);

      expect(isTsImportCall('/app.vibe', 'calculate')).toBe(true);
    });

    test('returns false for unregistered function', () => {
      expect(isTsImportCall('/app.vibe', 'unknown')).toBe(false);
    });
  });

  describe('setTsImportEntryLine', () => {
    test('sets entry line for registered import', () => {
      registerTsImport('foo', '/foo.ts', 'foo', '/main.vibe', 1);
      setTsImportEntryLine('/main.vibe', 'foo', 42);

      const info = getTsImportInfo('/main.vibe', 'foo');
      expect(info?.entryLine).toBe(42);
    });
  });

  describe('temporary breakpoints', () => {
    test('registers and pops temp breakpoint', () => {
      registerTempBreakpoint('/utils.ts', 10, 'bp_123');

      const id = popTempBreakpoint('/utils.ts', 10);
      expect(id).toBe('bp_123');

      // Should be gone after pop
      const id2 = popTempBreakpoint('/utils.ts', 10);
      expect(id2).toBeUndefined();
    });

    test('clearTempBreakpoints returns all and clears', () => {
      registerTempBreakpoint('/a.ts', 5, 'bp_1');
      registerTempBreakpoint('/b.ts', 10, 'bp_2');

      const all = clearTempBreakpoints();
      expect(all.size).toBe(2);
      expect(all.get('/a.ts:5')).toBe('bp_1');
      expect(all.get('/b.ts:10')).toBe('bp_2');

      // Should be empty now
      const empty = clearTempBreakpoints();
      expect(empty.size).toBe(0);
    });
  });

  describe('getAllTsImports', () => {
    test('returns all registered imports', () => {
      registerTsImport('a', '/a.ts', 'a', '/main.vibe', 1);
      registerTsImport('b', '/b.ts', 'b', '/main.vibe', 2);

      const all = getAllTsImports();
      expect(all.length).toBe(2);
    });
  });

  describe('getTsImportsForFile', () => {
    test('returns imports for specific file', () => {
      registerTsImport('a', '/a.ts', 'a', '/main.vibe', 1);
      registerTsImport('b', '/b.ts', 'b', '/other.vibe', 2);
      registerTsImport('c', '/c.ts', 'c', '/main.vibe', 3);

      const mainImports = getTsImportsForFile('/main.vibe');
      expect(mainImports.length).toBe(2);
      expect(mainImports.map(i => i.vibeName).sort()).toEqual(['a', 'c']);
    });
  });

  describe('entry point ID helpers', () => {
    test('buildTsEntryPointId creates unique ID', () => {
      const id = buildTsEntryPointId('/utils.ts', 'calculate');
      expect(id).toBe('ts:/utils.ts:calculate');
    });

    test('parseTsEntryPointId extracts components', () => {
      const parsed = parseTsEntryPointId('ts:/path/to/file.ts:myFunc');
      expect(parsed).not.toBeNull();
      expect(parsed?.tsFile).toBe('/path/to/file.ts');
      expect(parsed?.functionName).toBe('myFunc');
    });

    test('parseTsEntryPointId returns null for invalid format', () => {
      expect(parseTsEntryPointId('invalid')).toBeNull();
      expect(parseTsEntryPointId('wrong:format')).toBeNull();
    });
  });
});
