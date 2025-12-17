# Vibe Language - TODO

## Pending

(none)

## Completed

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
