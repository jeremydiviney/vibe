# Plan: Export Constants Only

## Overview
Restrict exports to constants only. Mutable variables (`let`) cannot be exported to prevent shared mutable state across modules.

## Rationale
- Multiple modules importing the same `let` variable could mutate shared state
- This leads to hard-to-debug issues
- Constants are safe to share

## Implementation

### Semantic Analyzer
In `analyzer-visitors.ts`, validate export declarations:

```typescript
// In visitStatement for ExportDeclaration
if (node.declaration.type === 'LetDeclaration') {
  ctx.error(
    `Cannot export mutable variable '${node.declaration.name}'. Only constants can be exported.`,
    node.location
  );
}
```

## Files to Modify
- `packages/runtime/src/semantic/analyzer-visitors.ts`

## Tests
- `export let x = 1` → error "Cannot export mutable variable"
- `export const X = 1` → ok
- `export function foo() {}` → ok
- `export model m = {}` → ok (models are implicitly const)

## Verification
```bash
bun test packages/runtime/src/semantic/test/export.test.ts
bun run test
```

## Migration Notes
- Existing code with `export let` will need to change to `export const`
- This is a breaking change - document in changelog
