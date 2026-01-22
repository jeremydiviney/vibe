import { describe, expect, test } from 'bun:test';
import { TypeRegistry } from '../type-registry';
import type { StructuralType } from '../../ast';

describe('TypeRegistry', () => {
  test('registers and looks up a simple type', () => {
    const registry = new TypeRegistry();
    const structure: StructuralType = {
      fields: [
        { name: 'value', type: 'number' },
        { name: 'message', type: 'text' },
      ],
    };
    registry.register('Result', structure);

    const result = registry.lookup('Result');
    expect(result).toEqual(structure);
  });

  test('returns undefined for unknown type', () => {
    const registry = new TypeRegistry();
    expect(registry.lookup('Unknown')).toBeUndefined();
  });

  test('has() returns true for registered types', () => {
    const registry = new TypeRegistry();
    registry.register('MyType', { fields: [] });
    expect(registry.has('MyType')).toBe(true);
    expect(registry.has('Other')).toBe(false);
  });

  test('getTypeNames() returns all registered types', () => {
    const registry = new TypeRegistry();
    registry.register('TypeA', { fields: [] });
    registry.register('TypeB', { fields: [] });
    registry.register('TypeC', { fields: [] });
    expect(registry.getTypeNames()).toEqual(['TypeA', 'TypeB', 'TypeC']);
  });
});

describe('TypeRegistry - resolveSingleMember', () => {
  test('resolves field type for simple type', () => {
    const registry = new TypeRegistry();
    registry.register('Person', {
      fields: [
        { name: 'name', type: 'text' },
        { name: 'age', type: 'number' },
      ],
    });

    expect(registry.resolveSingleMember('Person', 'name')).toBe('text');
    expect(registry.resolveSingleMember('Person', 'age')).toBe('number');
  });

  test('returns null for unknown field', () => {
    const registry = new TypeRegistry();
    registry.register('Person', { fields: [{ name: 'name', type: 'text' }] });

    expect(registry.resolveSingleMember('Person', 'unknown')).toBeNull();
  });

  test('returns null for unknown type', () => {
    const registry = new TypeRegistry();
    expect(registry.resolveSingleMember('Unknown', 'field')).toBeNull();
  });

  test('returns len for array types', () => {
    const registry = new TypeRegistry();
    expect(registry.resolveSingleMember('number[]', 'len')).toBe('number');
    expect(registry.resolveSingleMember('text[]', 'len')).toBe('number');
  });

  test('resolves nested type field as type name', () => {
    const registry = new TypeRegistry();
    registry.register('Inner', { fields: [{ name: 'value', type: 'number' }] });
    registry.register('Outer', { fields: [{ name: 'inner', type: 'Inner' }] });

    expect(registry.resolveSingleMember('Outer', 'inner')).toBe('Inner');
  });

  test('returns object for inline nested type', () => {
    const registry = new TypeRegistry();
    registry.register('Result', {
      fields: [
        {
          name: 'metadata',
          type: 'object',
          nestedType: {
            fields: [{ name: 'timestamp', type: 'number' }],
          },
        },
      ],
    });

    expect(registry.resolveSingleMember('Result', 'metadata')).toBe('object');
  });
});

describe('TypeRegistry - resolveMemberType (multi-level)', () => {
  test('resolves single-level path', () => {
    const registry = new TypeRegistry();
    registry.register('Person', { fields: [{ name: 'name', type: 'text' }] });

    expect(registry.resolveMemberType('Person', ['name'])).toBe('text');
  });

  test('resolves multi-level path through named types', () => {
    const registry = new TypeRegistry();
    registry.register('Address', { fields: [{ name: 'city', type: 'text' }] });
    registry.register('Person', { fields: [{ name: 'address', type: 'Address' }] });

    expect(registry.resolveMemberType('Person', ['address', 'city'])).toBe('text');
  });

  test('resolves path through inline nested type', () => {
    const registry = new TypeRegistry();
    registry.register('Result', {
      fields: [
        {
          name: 'metadata',
          type: 'object',
          nestedType: {
            fields: [{ name: 'timestamp', type: 'number' }],
          },
        },
      ],
    });

    expect(registry.resolveMemberType('Result', ['metadata', 'timestamp'])).toBe('number');
  });

  test('returns null for invalid path', () => {
    const registry = new TypeRegistry();
    registry.register('Person', { fields: [{ name: 'name', type: 'text' }] });

    expect(registry.resolveMemberType('Person', ['name', 'invalid'])).toBeNull();
  });

  test('returns null for empty path', () => {
    const registry = new TypeRegistry();
    registry.register('Person', { fields: [] });

    expect(registry.resolveMemberType('Person', [])).toBe('Person');
  });
});

describe('TypeRegistry - flattenType', () => {
  test('flattens simple type', () => {
    const registry = new TypeRegistry();
    registry.register('Result', {
      fields: [
        { name: 'success', type: 'boolean' },
        { name: 'message', type: 'text' },
      ],
    });

    expect(registry.flattenType('Result')).toEqual([
      { path: 'success', type: 'boolean' },
      { path: 'message', type: 'text' },
    ]);
  });

  test('flattens nested inline type', () => {
    const registry = new TypeRegistry();
    registry.register('Result', {
      fields: [
        { name: 'ok', type: 'boolean' },
        {
          name: 'metadata',
          type: 'object',
          nestedType: {
            fields: [
              { name: 'timestamp', type: 'number' },
              { name: 'source', type: 'text' },
            ],
          },
        },
      ],
    });

    expect(registry.flattenType('Result')).toEqual([
      { path: 'ok', type: 'boolean' },
      { path: 'metadata.timestamp', type: 'number' },
      { path: 'metadata.source', type: 'text' },
    ]);
  });

  test('flattens nested named type', () => {
    const registry = new TypeRegistry();
    registry.register('Meta', {
      fields: [{ name: 'version', type: 'number' }],
    });
    registry.register('Result', {
      fields: [
        { name: 'data', type: 'text' },
        { name: 'meta', type: 'Meta' },
      ],
    });

    expect(registry.flattenType('Result')).toEqual([
      { path: 'data', type: 'text' },
      { path: 'meta.version', type: 'number' },
    ]);
  });

  test('returns empty array for unknown type', () => {
    const registry = new TypeRegistry();
    expect(registry.flattenType('Unknown')).toEqual([]);
  });

  test('flattens deeply nested structure', () => {
    const registry = new TypeRegistry();
    registry.register('DeepType', {
      fields: [
        {
          name: 'level1',
          type: 'object',
          nestedType: {
            fields: [
              {
                name: 'level2',
                type: 'object',
                nestedType: {
                  fields: [{ name: 'value', type: 'number' }],
                },
              },
            ],
          },
        },
      ],
    });

    expect(registry.flattenType('DeepType')).toEqual([
      { path: 'level1.level2.value', type: 'number' },
    ]);
  });
});
