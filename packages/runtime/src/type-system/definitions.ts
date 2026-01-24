/**
 * Type Definitions
 *
 * Central registry of all built-in Vibe types. Each type's validation rules,
 * TS equivalent, coercion logic, and metadata are defined in one place.
 */

export interface TypeDefinition {
  /** The Vibe type name (e.g., 'text', 'number') */
  name: string;
  /** Equivalent TypeScript type for TS blocks */
  tsEquivalent: string;
  /** Whether this type supports [] suffix */
  isArrayable: boolean;
  /** Runtime: check if a JS value matches this type */
  jsValidate: (value: unknown) => boolean;
  /** Human-readable type description for error messages */
  jsTypeName: string;
  /** Optional coercion from string (e.g., JSON.parse for json) */
  coerce?: (value: string) => unknown;
  /** Custom error message when coercion fails (defaults to "invalid {name} string") */
  coerceErrorMessage?: string;
  /** Additional validation after primary check (e.g., json must not be array, number must be finite) */
  postCoerceValidate?: (value: unknown) => string | null;
  /** Whether null is a valid value for this type */
  acceptsNull: boolean;
  /** JS typeof value that infers this type (for untyped variables) */
  inferFrom?: string;
}

export const TYPE_DEFINITIONS: ReadonlyMap<string, TypeDefinition> = new Map([
  ['text', {
    name: 'text',
    tsEquivalent: 'string',
    isArrayable: true,
    jsValidate: (v: unknown) => typeof v === 'string',
    jsTypeName: 'text (string)',
    acceptsNull: true,
    inferFrom: 'string',
  }],
  ['number', {
    name: 'number',
    tsEquivalent: 'number',
    isArrayable: true,
    jsValidate: (v: unknown) => typeof v === 'number',
    jsTypeName: 'number',
    postCoerceValidate: (v: unknown) => {
      if (typeof v === 'number' && !Number.isFinite(v)) {
        return `number must be finite, got ${v}`;
      }
      return null;
    },
    acceptsNull: true,
    inferFrom: 'number',
  }],
  ['boolean', {
    name: 'boolean',
    tsEquivalent: 'boolean',
    isArrayable: true,
    jsValidate: (v: unknown) => typeof v === 'boolean',
    jsTypeName: 'boolean',
    acceptsNull: false,
    inferFrom: 'boolean',
  }],
  ['json', {
    name: 'json',
    tsEquivalent: 'Record<string, unknown>',
    isArrayable: true,
    jsValidate: (v: unknown) => typeof v === 'object' && v !== null,
    jsTypeName: 'json (object)',
    coerce: (v: string) => JSON.parse(v),
    coerceErrorMessage: 'invalid JSON string',
    postCoerceValidate: (v: unknown) => {
      if (Array.isArray(v)) return 'json type expects an object, not an array. Use json[] for arrays.';
      return null;
    },
    acceptsNull: true,
  }],
  ['prompt', {
    name: 'prompt',
    tsEquivalent: 'string',
    isArrayable: true,
    jsValidate: (_v: unknown) => true, // prompt accepts any value (strings primarily)
    jsTypeName: 'prompt',
    acceptsNull: true,
  }],
  ['model', {
    name: 'model',
    tsEquivalent: 'any',
    isArrayable: true,
    jsValidate: (_v: unknown) => true, // model validation is structural
    jsTypeName: 'model',
    acceptsNull: true,
  }],
]);

/** All valid base type names */
export const VALID_BASE_TYPES = [...TYPE_DEFINITIONS.keys()] as readonly string[];
