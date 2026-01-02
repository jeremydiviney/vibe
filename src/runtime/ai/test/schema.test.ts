// Schema generation tests

import { describe, test, expect } from 'bun:test';
import {
  typeToSchema,
  getTypeInstruction,
  parseResponse,
  validateResponseType,
} from '../schema';

describe('typeToSchema', () => {
  test('returns null for null type', () => {
    expect(typeToSchema(null)).toBeNull();
  });

  test('converts text to string schema', () => {
    expect(typeToSchema('text')).toEqual({ type: 'string' });
  });

  test('converts number to number schema', () => {
    expect(typeToSchema('number')).toEqual({ type: 'number' });
  });

  test('converts boolean to boolean schema', () => {
    expect(typeToSchema('boolean')).toEqual({ type: 'boolean' });
  });

  test('converts json to object schema', () => {
    expect(typeToSchema('json')).toEqual({ type: 'object', additionalProperties: true });
  });

  test('converts text[] to array of strings', () => {
    expect(typeToSchema('text[]')).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  test('converts number[] to array of numbers', () => {
    expect(typeToSchema('number[]')).toEqual({
      type: 'array',
      items: { type: 'number' },
    });
  });
});

describe('getTypeInstruction', () => {
  test('returns null for null type', () => {
    expect(getTypeInstruction(null)).toBeNull();
  });

  test('returns null for text type', () => {
    expect(getTypeInstruction('text')).toBeNull();
  });

  test('returns instruction for number type', () => {
    const instruction = getTypeInstruction('number');
    expect(instruction).toContain('number');
    expect(instruction).toContain('numeric');
  });

  test('returns instruction for boolean type', () => {
    const instruction = getTypeInstruction('boolean');
    expect(instruction).toContain('true');
    expect(instruction).toContain('false');
  });

  test('returns instruction for json type', () => {
    const instruction = getTypeInstruction('json');
    expect(instruction).toContain('JSON');
  });

  test('returns instruction for array type', () => {
    const instruction = getTypeInstruction('text[]');
    expect(instruction).toContain('array');
  });
});

describe('parseResponse', () => {
  test('returns content for null type', () => {
    expect(parseResponse('hello', null)).toBe('hello');
  });

  test('returns content for text type', () => {
    expect(parseResponse('hello', 'text')).toBe('hello');
  });

  test('parses number from string', () => {
    expect(parseResponse('42', 'number')).toBe(42);
    expect(parseResponse('3.14', 'number')).toBe(3.14);
    expect(parseResponse('  -5  ', 'number')).toBe(-5);
  });

  test('throws on invalid number', () => {
    expect(() => parseResponse('not a number', 'number')).toThrow();
  });

  test('parses boolean true', () => {
    expect(parseResponse('true', 'boolean')).toBe(true);
    expect(parseResponse('TRUE', 'boolean')).toBe(true);
    expect(parseResponse('  True  ', 'boolean')).toBe(true);
  });

  test('parses boolean false', () => {
    expect(parseResponse('false', 'boolean')).toBe(false);
    expect(parseResponse('FALSE', 'boolean')).toBe(false);
  });

  test('throws on invalid boolean', () => {
    expect(() => parseResponse('yes', 'boolean')).toThrow();
    expect(() => parseResponse('1', 'boolean')).toThrow();
  });

  test('parses JSON object', () => {
    expect(parseResponse('{"a": 1}', 'json')).toEqual({ a: 1 });
  });

  test('parses JSON array', () => {
    expect(parseResponse('[1, 2, 3]', 'json')).toEqual([1, 2, 3]);
  });

  test('throws on invalid JSON', () => {
    expect(() => parseResponse('not json', 'json')).toThrow();
  });

  test('parses array type', () => {
    expect(parseResponse('["a", "b"]', 'text[]')).toEqual(['a', 'b']);
    expect(parseResponse('[1, 2, 3]', 'number[]')).toEqual([1, 2, 3]);
  });
});

describe('validateResponseType', () => {
  test('returns true for null type', () => {
    expect(validateResponseType('anything', null)).toBe(true);
  });

  test('validates text type', () => {
    expect(validateResponseType('hello', 'text')).toBe(true);
    expect(validateResponseType(42, 'text')).toBe(false);
  });

  test('validates number type', () => {
    expect(validateResponseType(42, 'number')).toBe(true);
    expect(validateResponseType('42', 'number')).toBe(false);
    expect(validateResponseType(NaN, 'number')).toBe(false);
  });

  test('validates boolean type', () => {
    expect(validateResponseType(true, 'boolean')).toBe(true);
    expect(validateResponseType(false, 'boolean')).toBe(true);
    expect(validateResponseType(1, 'boolean')).toBe(false);
  });

  test('validates json type', () => {
    expect(validateResponseType({ a: 1 }, 'json')).toBe(true);
    expect(validateResponseType([1, 2], 'json')).toBe(true);
    expect(validateResponseType('string', 'json')).toBe(false);
    expect(validateResponseType(null, 'json')).toBe(false);
  });

  test('validates array types', () => {
    expect(validateResponseType(['a', 'b'], 'text[]')).toBe(true);
    expect(validateResponseType([1, 2, 3], 'number[]')).toBe(true);
    expect(validateResponseType(['a', 1], 'text[]')).toBe(false);
    expect(validateResponseType('not array', 'text[]')).toBe(false);
  });
});
