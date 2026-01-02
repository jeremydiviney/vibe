import { describe, expect, test, beforeAll } from 'bun:test';
import { vibeTypeToJsonSchema, extractTypeSchema, createTypeExtractor, clearSchemaCache } from '../ts-schema';
import type { TypeExtractor } from '../ts-schema';
import { join } from 'path';

describe('vibeTypeToJsonSchema', () => {
  // ============================================================================
  // Primitive types
  // ============================================================================

  test('converts text type to string schema', () => {
    const schema = vibeTypeToJsonSchema('text');
    expect(schema).toEqual({ type: 'string' });
  });

  test('converts prompt type to string schema', () => {
    const schema = vibeTypeToJsonSchema('prompt');
    expect(schema).toEqual({ type: 'string' });
  });

  test('converts number type to number schema', () => {
    const schema = vibeTypeToJsonSchema('number');
    expect(schema).toEqual({ type: 'number' });
  });

  test('converts boolean type to boolean schema', () => {
    const schema = vibeTypeToJsonSchema('boolean');
    expect(schema).toEqual({ type: 'boolean' });
  });

  test('converts json type to object schema', () => {
    const schema = vibeTypeToJsonSchema('json');
    expect(schema).toEqual({ type: 'object', additionalProperties: true });
  });

  // ============================================================================
  // Array types
  // ============================================================================

  test('converts text[] to array of strings', () => {
    const schema = vibeTypeToJsonSchema('text[]');
    expect(schema).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  test('converts number[] to array of numbers', () => {
    const schema = vibeTypeToJsonSchema('number[]');
    expect(schema).toEqual({
      type: 'array',
      items: { type: 'number' },
    });
  });

  test('converts boolean[] to array of booleans', () => {
    const schema = vibeTypeToJsonSchema('boolean[]');
    expect(schema).toEqual({
      type: 'array',
      items: { type: 'boolean' },
    });
  });

  test('converts json[] to array of objects', () => {
    const schema = vibeTypeToJsonSchema('json[]');
    expect(schema).toEqual({
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    });
  });

  // ============================================================================
  // Unknown types
  // ============================================================================

  test('returns generic object for unknown type', () => {
    const schema = vibeTypeToJsonSchema('UnknownType');
    expect(schema).toEqual({ type: 'object', additionalProperties: true });
  });

  test('falls back to generic object for unmapped type', () => {
    const importedTypes = new Map<string, string>();
    const schema = vibeTypeToJsonSchema('UnknownType', importedTypes);
    expect(schema).toEqual({ type: 'object', additionalProperties: true });
  });
});

// ============================================================================
// TypeScript type extraction tests using fixtures
// Compiles once in beforeAll for efficiency (~1s instead of ~10s)
// ============================================================================

describe('extractTypeSchema with fixtures', () => {
  const fixturesDir = join(__dirname, 'fixtures');
  const testTypesFile = join(fixturesDir, 'test-types.ts');
  const baseTypesFile = join(fixturesDir, 'base-types.ts');

  let extractor: TypeExtractor;

  beforeAll(() => {
    clearSchemaCache();
    // Compile both files once - this is where the time is spent
    extractor = createTypeExtractor([testTypesFile, baseTypesFile]);
  });

  // ============================================================================
  // Simple primitives from test-types.ts
  // ============================================================================

  test('extracts Person interface with primitives', () => {
    const schema = extractor.extract('Person');
    expect(schema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        active: { type: 'boolean' },
      },
      required: ['name', 'age', 'active'],
    });
  });

  test('extracts Config interface with optional properties', () => {
    const schema = extractor.extract('Config');
    expect(schema.properties).toHaveProperty('required');
    expect(schema.properties).toHaveProperty('optional');
    expect(schema.required).toContain('required');
    expect(schema.required).not.toContain('optional');
  });

  test('extracts Container interface with array property', () => {
    const schema = extractor.extract('Container');
    expect(schema.properties?.items).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  test('extracts Status type alias', () => {
    const schema = extractor.extract('Status');
    expect(schema).toEqual({ type: 'string' });
  });

  // ============================================================================
  // JSDoc extraction
  // ============================================================================

  test('extracts JSDoc descriptions from Documented interface', () => {
    const schema = extractor.extract('Documented');
    expect(schema.properties?.id.description).toBe("The user's unique identifier");
    expect(schema.properties?.name.description).toBe("The user's display name");
  });

  // ============================================================================
  // Types from base-types.ts (imported by test-types.ts)
  // ============================================================================

  test('extracts Address interface from base-types', () => {
    const schema = extractor.extract('Address');
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        street: { type: 'string' },
        city: { type: 'string' },
        zipCode: { type: 'string' },
        country: { type: 'string' },
      },
    });
    expect(schema.required).toContain('street');
    expect(schema.required).toContain('city');
    expect(schema.required).not.toContain('country'); // optional
  });

  test('extracts ContactInfo with nested Address', () => {
    const schema = extractor.extract('ContactInfo');
    expect(schema.properties?.email).toEqual({ type: 'string' });
    expect(schema.properties?.address).toMatchObject({
      type: 'object',
      properties: {
        street: { type: 'string' },
        city: { type: 'string' },
      },
    });
  });

  test('extracts Metadata interface with JSDoc and optional array', () => {
    const schema = extractor.extract('Metadata');
    expect(schema.properties?.createdAt.description).toBe('When the entity was created');
    expect(schema.properties?.updatedAt.description).toBe('When the entity was last updated');
    expect(schema.properties?.tags).toMatchObject({
      type: 'array',
      items: { type: 'string' },
    });
    expect(schema.required).not.toContain('tags'); // optional
  });

  test('extracts OrderItem interface', () => {
    const schema = extractor.extract('OrderItem');
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        productId: { type: 'string' },
        productName: { type: 'string' },
        quantity: { type: 'number' },
        unitPrice: { type: 'number' },
      },
    });
  });

  // ============================================================================
  // Complex types using imports (test-types.ts using base-types.ts)
  // ============================================================================

  test('extracts User with imported ContactInfo and Metadata', () => {
    const schema = extractor.extract('User');
    expect(schema.properties?.id).toEqual({ type: 'string' });
    expect(schema.properties?.username).toEqual({ type: 'string' });
    expect(schema.properties?.contact).toMatchObject({
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
    });
    expect(schema.properties?.metadata).toMatchObject({
      type: 'object',
      properties: {
        createdAt: { type: 'string' },
      },
    });
  });

  test('extracts Customer with optional shippingAddress', () => {
    const schema = extractor.extract('Customer');
    expect(schema.required).toContain('billingAddress');
    expect(schema.required).not.toContain('shippingAddress'); // optional
  });

  test('extracts Order with array of OrderItems', () => {
    const schema = extractor.extract('Order');
    expect(schema.properties?.items).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'number' },
        },
      },
    });
  });

  // ============================================================================
  // Array types interface
  // ============================================================================

  test('extracts ArrayTypes with various array properties', () => {
    const schema = extractor.extract('ArrayTypes');
    expect(schema.properties?.strings).toEqual({ type: 'array', items: { type: 'string' } });
    expect(schema.properties?.numbers).toEqual({ type: 'array', items: { type: 'number' } });
    expect(schema.properties?.booleans).toEqual({ type: 'array', items: { type: 'boolean' } });
    expect(schema.properties?.nested).toMatchObject({
      type: 'array',
      items: { type: 'object' },
    });
  });

  // ============================================================================
  // Optional-only types
  // ============================================================================

  test('extracts AllOptional with no required fields', () => {
    const schema = extractor.extract('AllOptional');
    expect(schema.required).toBeUndefined();
  });

  // ============================================================================
  // Error handling
  // ============================================================================

  test('throws error for non-existent type', () => {
    expect(() => extractor.extract('NonExistentType')).toThrow(
      "Type 'NonExistentType' not found"
    );
  });
});

// ============================================================================
// Tests for extractTypeSchema (the single-file API with caching)
// ============================================================================

describe('extractTypeSchema caching', () => {
  const fixturesDir = join(__dirname, 'fixtures');
  const testTypesFile = join(fixturesDir, 'test-types.ts');

  test('caches schema for same file and type', () => {
    clearSchemaCache();

    // First call - compiles the file
    const schema1 = extractTypeSchema(testTypesFile, 'Person');

    // Second call - should use cache
    const schema2 = extractTypeSchema(testTypesFile, 'Person');

    expect(schema1).toEqual(schema2);
  });

  test('throws error for non-existent file', () => {
    expect(() => extractTypeSchema('/nonexistent/path/file.ts', 'SomeType')).toThrow();
  });

  test('throws error for non-existent type in file', () => {
    expect(() => extractTypeSchema(testTypesFile, 'NonExistentType')).toThrow(
      "Type 'NonExistentType' not found"
    );
  });
});

// ============================================================================
// vibeTypeToJsonSchema with imported types (uses fixture file)
// ============================================================================

describe('vibeTypeToJsonSchema with imported types', () => {
  const fixturesDir = join(__dirname, 'fixtures');
  const testTypesFile = join(fixturesDir, 'test-types.ts');

  test('resolves imported type from map', () => {
    clearSchemaCache();
    const importedTypes = new Map<string, string>();
    importedTypes.set('Person', testTypesFile);

    const schema = vibeTypeToJsonSchema('Person', importedTypes);
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        active: { type: 'boolean' },
      },
    });
  });

  test('handles array of imported type', () => {
    const importedTypes = new Map<string, string>();
    importedTypes.set('Person', testTypesFile);

    const schema = vibeTypeToJsonSchema('Person[]', importedTypes);
    expect(schema).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
    });
  });
});
