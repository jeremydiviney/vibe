# Plan: Break Statement for Loops

## Overview
Add `break` keyword support to exit `for` and `while` loops early.

## Scope
- Lexer: Add `break` keyword token
- Parser: Parse `break` as a statement inside loops
- Semantic: Validate `break` only appears inside loops
- Runtime: Implement loop exit behavior

## Implementation

### 1. Lexer (`tokens.ts`)
Add `Break` to keywords:
```typescript
Break: createToken({ name: 'Break', pattern: /break/, longer_alt: Identifier }),
```

### 2. AST (`ast.ts`)
Add BreakStatement node:
```typescript
export interface BreakStatement extends BaseNode {
  type: 'BreakStatement';
}
```

### 3. Parser (`index.ts`)
- Add `break` to statement rule
- Create `breakStatement` rule

### 4. Semantic Analyzer
- Track loop depth during analysis
- Error if `break` appears outside loop

### 5. Runtime (`step.ts`)
- Handle BreakStatement by setting a `breaking` flag
- Check flag in loop handlers to exit early

## Files to Modify
- `packages/runtime/src/parser/tokens.ts`
- `packages/runtime/src/ast.ts`
- `packages/runtime/src/parser/index.ts`
- `packages/runtime/src/parser/visitor.ts`
- `packages/runtime/src/semantic/analyzer-visitors.ts`
- `packages/runtime/src/runtime/step.ts`

## Tests
- Parser: `break` inside for loop
- Parser: `break` inside while loop
- Semantic: error for `break` outside loop
- Runtime: `break` exits for loop
- Runtime: `break` exits while loop
- Runtime: `break` in nested loop only exits inner

## Verification
```bash
bun test packages/runtime/src/parser/test/break.test.ts
bun test packages/runtime/src/semantic/test/break.test.ts
bun test packages/runtime/src/runtime/test/break.test.ts
bun run test
```
