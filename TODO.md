# Vibe Language - TODO

## Pending

### AI Integration
- [ ] Handle streaming responses
- [ ] Anthropic prompt caching optimization
  - [ ] Add `anthropic-beta: prompt-caching-2024-07-31` header support
  - [ ] Use `cache_control: { type: "ephemeral" }` for system prompts
- [ ] Tool/function calling support
  - [ ] Define tool schemas in Vibe
  - [ ] Pass tools to AI providers
  - [ ] Handle tool call responses and execute tools
- [ ] Parallel AI calls
  - [ ] Auto-parallelize independent AI calls (no data dependencies)
  - [ ] Configurable concurrency limit

### Language Features
- [ ] Implement the `vibe` keyword
  - [ ] Define semantics (code generation? simplified AI call?)
  - [ ] Parser support (already exists?)
  - [ ] Runtime execution

### Context Management Features (Future)
- [ ] Context checkpoints beyond local/global
- [ ] Context orchestration functions
- [ ] Variable visibility modifiers

### Claude Code Plugin Distribution
- [ ] Package symbol-tree as shareable plugin

## Completed (Last 10)

- [x] Add TypeScript types, interfaces, and enums to symbol tree output
  - [x] Include in symbol summary section with start/end line numbers
  - [x] Show type dependencies (extends, uses relationships)

- [x] Context improvements for AI conversation history
  - [x] Track value source on variables (`ai`, `user`, or `undefined`)
  - [x] Show AI responses with `<--` prefix vs `-` for regular variables
  - [x] Format: `--> do: "prompt"` followed by `<-- varName: response`

- [x] Source location tracking
  - [x] Add required `location: SourceLocation` to all Instruction types
  - [x] Propagate location from AST nodes to Instructions
  - [x] RuntimeError uses instruction location for accurate error messages

- [x] AI model API calls
  - [x] Support for OpenAI, Anthropic, Google Gemini (official SDKs)
  - [x] Error handling and retries (exponential backoff)
  - [x] Structured outputs (type-aware responses)
  - [x] Provider auto-detection + thinkingLevel support

- [x] Refactor runtime/step.ts (1284 → 223 lines, 83% reduction)
  - [x] Extract validation, variables, ai, statements, expressions, functions modules

- [x] Control Flow
  - [x] Add `number` type with full support
  - [x] For-in loop with array iteration and range syntax
  - [x] While loop with strict boolean condition

- [x] Operators and Built-ins
  - [x] Arithmetic, comparison, logical operators with proper precedence
  - [x] Array indexing, slicing, member access
  - [x] Built-in methods: len(), push(), pop()

- [x] Type System (arrays)
  - [x] Syntax: `text[]`, `boolean[]`, `json[]`, nested arrays
  - [x] Strict runtime validation of element types

- [x] Scoping & Expression Evaluation
  - [x] C-style scope chain (function → global)
  - [x] No closures - functions always pure

- [x] Developer Tools
  - [x] Symbol tree visualization tool with call graphs
