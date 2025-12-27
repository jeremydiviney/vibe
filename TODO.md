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

### Claude Code Plugin Distribution
- [ ] Package symbol-tree as shareable plugin
  - [ ] Refactor from MCP server to standalone CLI script
  - [ ] Update skill to invoke script via Bash instead of MCP
  - [ ] Create plugin manifest and structure
  - [ ] Publish to Claude Code plugin marketplace or npm

