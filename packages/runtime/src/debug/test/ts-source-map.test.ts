import { describe, test, expect, beforeEach } from 'bun:test';
import {
  registerTsBlock,
  getTsBlockMapping,
  setScriptId,
  findMappingByScriptId,
  mapTsLocationToVibe,
  mapVibeLocationToTs,
  isLocationInTsBlock,
  getMappingsForFile,
  clearTsBlockMappings,
  getAllMappings,
} from '../ts-source-map';

describe('TS Block Source Mapping', () => {
  beforeEach(() => {
    clearTsBlockMappings();
  });

  describe('registerTsBlock', () => {
    test('registers a TS block and returns unique ID', () => {
      const id = registerTsBlock(
        '/test.vibe',
        { file: '/test.vibe', line: 10, column: 5 },
        'return x + y',
        ['x', 'y']
      );

      expect(id).toMatch(/^ts_block_\d+$/);

      const mapping = getTsBlockMapping(id);
      expect(mapping).toBeDefined();
      expect(mapping?.vibeFile).toBe('/test.vibe');
      expect(mapping?.vibeStartLine).toBe(10);
      expect(mapping?.vibeStartColumn).toBe(5);
      expect(mapping?.tsBody).toBe('return x + y');
      expect(mapping?.params).toEqual(['x', 'y']);
    });

    test('generates unique IDs for each block', () => {
      const id1 = registerTsBlock('/a.vibe', { file: '/a.vibe', line: 1, column: 1 }, 'a', []);
      const id2 = registerTsBlock('/b.vibe', { file: '/b.vibe', line: 2, column: 1 }, 'b', []);

      expect(id1).not.toBe(id2);
    });
  });

  describe('script ID association', () => {
    test('associates script ID with mapping', () => {
      const id = registerTsBlock('/test.vibe', { file: '/test.vibe', line: 5, column: 1 }, 'code', []);

      setScriptId(id, 'script_123');

      const mapping = getTsBlockMapping(id);
      expect(mapping?.scriptId).toBe('script_123');
    });

    test('finds mapping by script ID', () => {
      const id = registerTsBlock('/test.vibe', { file: '/test.vibe', line: 5, column: 1 }, 'code', []);
      setScriptId(id, 'script_456');

      const found = findMappingByScriptId('script_456');
      expect(found).toBeDefined();
      expect(found?.vibeStartLine).toBe(5);
    });

    test('returns undefined for unknown script ID', () => {
      const found = findMappingByScriptId('unknown');
      expect(found).toBeUndefined();
    });
  });

  describe('mapTsLocationToVibe', () => {
    test('maps TS line to Vibe line', () => {
      const id = registerTsBlock('/test.vibe', { file: '/test.vibe', line: 10, column: 3 }, 'line1\nline2\nline3', []);
      const mapping = getTsBlockMapping(id)!;

      // Line 1 of TS (after 'use strict') maps to line 10 of Vibe
      const loc1 = mapTsLocationToVibe(mapping, 1, 0);
      expect(loc1.line).toBe(10);
      expect(loc1.column).toBe(3);

      // Line 2 of TS maps to line 11 of Vibe
      const loc2 = mapTsLocationToVibe(mapping, 2, 5);
      expect(loc2.line).toBe(11);
      expect(loc2.column).toBe(5);
    });
  });

  describe('mapVibeLocationToTs', () => {
    test('maps Vibe location to TS location', () => {
      const id = registerTsBlock('/test.vibe', { file: '/test.vibe', line: 10, column: 3 }, 'line1\nline2\nline3', []);
      const mapping = getTsBlockMapping(id)!;

      // Vibe line 10 maps to TS line 1 (after 'use strict')
      const ts1 = mapVibeLocationToTs(mapping, 10, 5);
      expect(ts1).not.toBeNull();
      expect(ts1?.line).toBe(1);
      expect(ts1?.column).toBe(2); // 5 - 3 start column

      // Vibe line 11 maps to TS line 2
      const ts2 = mapVibeLocationToTs(mapping, 11, 0);
      expect(ts2).not.toBeNull();
      expect(ts2?.line).toBe(2);
    });

    test('returns null for location outside TS block', () => {
      const id = registerTsBlock('/test.vibe', { file: '/test.vibe', line: 10, column: 1 }, 'single', []);
      const mapping = getTsBlockMapping(id)!;

      expect(mapVibeLocationToTs(mapping, 5, 0)).toBeNull();
      expect(mapVibeLocationToTs(mapping, 15, 0)).toBeNull();
    });
  });

  describe('isLocationInTsBlock', () => {
    test('returns mapping when location is in TS block', () => {
      registerTsBlock('/test.vibe', { file: '/test.vibe', line: 10, column: 1 }, 'line1\nline2\nline3', []);

      expect(isLocationInTsBlock('/test.vibe', 10)).not.toBeNull();
      expect(isLocationInTsBlock('/test.vibe', 11)).not.toBeNull();
      expect(isLocationInTsBlock('/test.vibe', 12)).not.toBeNull();
    });

    test('returns null when location is outside TS block', () => {
      registerTsBlock('/test.vibe', { file: '/test.vibe', line: 10, column: 1 }, 'single', []);

      expect(isLocationInTsBlock('/test.vibe', 5)).toBeNull();
      expect(isLocationInTsBlock('/test.vibe', 15)).toBeNull();
    });

    test('returns null for different file', () => {
      registerTsBlock('/a.vibe', { file: '/a.vibe', line: 10, column: 1 }, 'code', []);

      expect(isLocationInTsBlock('/b.vibe', 10)).toBeNull();
    });
  });

  describe('getMappingsForFile', () => {
    test('returns all mappings for a file', () => {
      registerTsBlock('/a.vibe', { file: '/a.vibe', line: 5, column: 1 }, 'block1', []);
      registerTsBlock('/a.vibe', { file: '/a.vibe', line: 15, column: 1 }, 'block2', []);
      registerTsBlock('/b.vibe', { file: '/b.vibe', line: 10, column: 1 }, 'other', []);

      const mappings = getMappingsForFile('/a.vibe');
      expect(mappings.length).toBe(2);
      expect(mappings.map(m => m.vibeStartLine).sort((a, b) => a - b)).toEqual([5, 15]);
    });

    test('returns empty array for file with no TS blocks', () => {
      registerTsBlock('/a.vibe', { file: '/a.vibe', line: 5, column: 1 }, 'code', []);

      expect(getMappingsForFile('/c.vibe')).toEqual([]);
    });
  });

  describe('clearTsBlockMappings', () => {
    test('clears all mappings', () => {
      registerTsBlock('/a.vibe', { file: '/a.vibe', line: 1, column: 1 }, 'a', []);
      registerTsBlock('/b.vibe', { file: '/b.vibe', line: 2, column: 1 }, 'b', []);

      expect(getAllMappings().size).toBe(2);

      clearTsBlockMappings();

      expect(getAllMappings().size).toBe(0);
    });
  });
});
