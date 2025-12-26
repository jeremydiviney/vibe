# Vibe Language - TODO

## Pending

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
