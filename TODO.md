# Vibe Language - TODO

## Pending

### Type System Enhancements
- [ ] Add `boolean` type support
  - [ ] Add `boolean` to supported type annotations for variables
  - [ ] Add `boolean` as function parameter type
  - [ ] Add `boolean` as function return type
  - [ ] Update semantic analyzer for boolean type validation
  - [ ] Update runtime for boolean type coercion
  - [ ] Add parser/semantic/runtime tests for boolean type

### Scoping & Expression Evaluation
- [ ] Test/evaluate expression scope in fine detail
  - [ ] Audit all expression types for correct scope chain access
  - [ ] Verify variable resolution in nested blocks, functions, and closures
  - [ ] Test shadowing behavior across all expression contexts
  - [ ] Validate scope behavior in string interpolation, do/ask/vibe expressions
  - [ ] Ensure proper scope isolation between parallel blocks and functions

### Context Management Features (Future)
- [ ] Context checkpoints beyond local/global
  - [ ] Auto-checkpoint based on call stack depth (e.g., last N frames)
  - [ ] Named context checkpoints
- [ ] Context orchestration functions
  - [ ] Create custom context bundles
  - [ ] Merge/filter contexts programmatically
- [ ] Variable visibility modifiers
  - [ ] Hide variables from default contexts (global/default/local)
  - [ ] Hide from auto-checkpoints
  - [ ] Example: `let:hidden username = "secret"` or similar syntax

## Completed

- [x] Add typed function parameters and return types
  - [x] Parameters REQUIRE type annotations (`text`, `json`, or `prompt`)
  - [x] Return type is OPTIONAL - if omitted, no return value validation
  - [x] Add `FunctionParameter` interface to AST
  - [x] Update parser with `parameter` rule and return type parsing
  - [x] Update visitor to build new AST structure
  - [x] Add compile-time type validation in semantic analyzer
  - [x] Add runtime type validation for function arguments and return values
  - [x] Update all existing tests to use new function syntax
- [x] Filter model variables from AI context
  - [x] Models are config, not data - exclude from localContext/globalContext
  - [x] Update ContextVariable type to remove 'model' from type union
  - [x] Add complex formatted context tests (nested blocks, functions, mixed types)
- [x] Add context formatter for AI calls
  - [x] Add `isConst` field to ContextVariable type
  - [x] Create `formatContextForAI()` with sorting (const first, let last)
  - [x] Add instructional wrapping for AI models
  - [x] Create test helpers (`createMockAIRunner`, `runWithMockAI`)
  - [x] Add comprehensive AI context tests
- [x] Fix TypeScript errors (9 errors fixed)
  - [x] Export conflict for RuntimeStatus
  - [x] Implicit any for frame helpers
  - [x] AST type mismatches (ModelConfig, Expression vs string)
  - [x] tsconfig module setting for import.meta
- [x] Disallow nested function declarations (functions only at top level)
  - [x] Add `atTopLevel` tracking to semantic analyzer
  - [x] Error on function declarations inside blocks or functions
  - [x] Add 5 tests for nested function rejection
- [x] Add lexical scoping to runtime (functions can access global scope)
  - [x] Add parentFrameIndex to StackFrame type
  - [x] Add lookupVariable() scope chain helper
  - [x] Update execIdentifier to use scope chain
  - [x] Update execAssignVar to use scope chain
  - [x] Update execCallFunction with parentFrameIndex
  - [x] Update execInterpolateString to use scope chain
  - [x] Add runtime scoping tests (17 tests)
- [x] Add ContextVariable type to types.ts
- [x] Add localContext/globalContext to RuntimeState
- [x] Create context.ts with buildLocalContext/buildGlobalContext
- [x] Update step() to rebuild context before each instruction
- [x] Add context tests
