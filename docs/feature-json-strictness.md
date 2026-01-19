# Plan: JSON Type Strictness

## Overview
Enforce that `json` type only accepts objects, not arrays. Arrays should use `json[]`.

## Current Behavior
- `json` accepts both objects and arrays
- No distinction at compile time

## New Behavior
- `json` = objects only (`Record<string, unknown>`)
- `json[]` = array of objects
- Primitive arrays use `text[]`, `number[]`, `boolean[]`

## Implementation

### 1. Semantic Analyzer
In `analyzer-validators.ts`, add validation for json assignments:
- Check if value is array literal → error
- Check if TS function returns array → error

### 2. Runtime Validation (`validation.ts`)
Add runtime check in `validateType()`:
```typescript
if (typeAnnotation === 'json' && Array.isArray(value)) {
  throw new Error('json type expects an object, not an array. Use json[] for arrays.');
}
```

### 3. Type Checking
In `ts-types.ts`, ensure `json` maps to `Record<string, unknown>` (already correct).

## Files to Modify
- `packages/runtime/src/semantic/analyzer-validators.ts`
- `packages/runtime/src/runtime/validation.ts`

## Tests
- Semantic: `let x: json = [1, 2, 3]` → error
- Semantic: `let x: json = { a: 1 }` → ok
- Runtime: json from AI that's an array → error
- Runtime: json from TS function that's array → error

## Verification
```bash
bun test packages/runtime/src/semantic/test/json-type.test.ts
bun test packages/runtime/src/runtime/test/validation.test.ts
bun run test
```

## Migration Notes
- Existing code using `json` for arrays will need to change to `json[]`
- This is a breaking change - document in changelog
