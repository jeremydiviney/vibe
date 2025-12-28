# Vibe Language - TODO

## Completed

### Type System Enhancements
- [x] Add `boolean` type support (strict - no truthy coercion)
  - [x] Add `boolean` to supported type annotations for variables
  - [x] Add `boolean` as function parameter type
  - [x] Add `boolean` as function return type
  - [x] Update semantic analyzer for boolean type validation
  - [x] Update runtime for boolean type validation
  - [x] Replace truthy coercion with strict boolean check in if statements

### Developer Tools
- [x] Create symbol tree visualization tool
  - [x] Build TypeScript script to parse project files
  - [x] Extract functions, types, variables, classes with hierarchical relationships
  - [x] Assign unique IDs to track symbol usage across files
  - [x] Output tree structure to configurable depth
  - [x] Show symbol names and identifiers (not full implementations)

### Scoping & Expression Evaluation
- [x] Evaluate scoping model and document design decisions
  - [x] Audit scope chain implementation (C-style: function → global)
  - [x] Confirm block scope cleanup via exit_block
  - [x] Verify shadowing behavior works correctly
  - [x] Decision: No closures - functions always pure (params + global only)
  - [x] Decision: Keep simple scoping model, fits AI orchestration use case

### Type System
- [x] Add list/array types
  - [x] Syntax: `text[]`, `boolean[]`, `json[]`, `text[][]` (nested)
  - [x] Parser support for type annotations
  - [x] Strict runtime validation of element types
  - [x] Function parameters and return types support arrays

### Code Quality
- [x] Refactor runtime/step.ts (1284 lines → 223 lines, 83% reduction)
  - [x] Extract `validation.ts` - type validation and coercion (94 lines)
  - [x] Extract `exec/variables.ts` - lookup, declare, assign (116 lines)
  - [x] Extract `exec/ai.ts` - AI do/ask/vibe operations (197 lines)
  - [x] Extract `exec/statements.ts` - statement + return execution (305 lines)
  - [x] Extract `exec/expressions.ts` - expression execution (242 lines)
  - [x] Extract `exec/typescript.ts` - interpolation and TS blocks (78 lines)
  - [x] Extract `exec/functions.ts` - function call with shared helpers (109 lines)
  - [x] Extract `exec/frames.ts` - push/pop frame operations (23 lines)
  - [x] `step.ts` contains core stepping + instruction dispatch (223 lines)

### Control Flow
- [x] Add `number` type
  - [x] Lexer: `NumberLiteral` token and `NumberType` keyword
  - [x] AST: `NumberLiteral` interface
  - [x] Parser: number literal and type annotation support
  - [x] Semantic analyzer: number type validation
  - [x] Runtime: number type coercion and validation
- [x] For-in loop
  - [x] Syntax: `for item in items { ... }` (array iteration)
  - [x] Syntax: `for i in 5 { ... }` (range 1-5 inclusive)
  - [x] Syntax: `for i in [2, 10] { ... }` (explicit range 2-10)
  - [x] Loop variable scoping (cleaned up after loop)
  - [x] Nested loops work correctly
  - [x] Non-integer range throws RuntimeError

## Pending

### Control Flow
- [ ] While loop (`while condition { ... }`)
- [ ] Implement break/continue (currently stubbed)

### AI Integration
- [ ] Implement actual AI model API calls
  - [ ] HTTP client for model endpoints
  - [ ] Support for OpenAI-compatible APIs
  - [ ] Support for Anthropic API
  - [ ] Handle streaming responses
  - [ ] Error handling and retries

### Language Features
- [ ] Implement the `vibe` keyword
  - [ ] Define semantics (code generation? simplified AI call?)
  - [ ] Parser support (already exists?)
  - [ ] Runtime execution

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

### Claude Code Plugin Distribution
- [ ] Package symbol-tree as shareable plugin
  - [ ] Refactor from MCP server to standalone CLI script
  - [ ] Update skill to invoke script via Bash instead of MCP
  - [ ] Create plugin manifest and structure
  - [ ] Publish to Claude Code plugin marketplace or npm
  - [x] Add begin/end line numbers for each symbol in output (helps Claude know exact code block boundaries)

