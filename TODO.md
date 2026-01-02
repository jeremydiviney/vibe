# Vibe Language - TODO

## Pending

### AI Integration
- [ ] Handle streaming responses
- [ ] AI tool calling integration
  - [ ] Pass tool schemas to AI providers
  - [ ] Extract tool call requests from AI responses
  - [ ] Execute tool calls and send results back to AI
- [ ] Parallel AI calls
  - [ ] Auto-parallelize independent AI calls (no data dependencies)
  - [ ] Configurable concurrency limit

### Language Features
- [ ] Implement the `vibe` keyword
  - [ ] Define semantics (code generation? simplified AI call?)
  - [ ] Parser support (already exists?)
  - [ ] Runtime execution

### Context Management Features
- [ ] Context checkpoints beyond local/global
- [ ] Context orchestration functions
- [ ] Variable visibility modifiers

### Claude Code Plugin Distribution
- [ ] Package symbol-tree as shareable plugin

## Completed (Last 10)

- [x] Tool calling system (foundation)
  - [x] Tool registry with built-in tools (sleep, now, jsonParse, jsonStringify, env, etc.)
  - [x] `tool` keyword for user-defined tools with `@description` and `@param` decorators
  - [x] TypeScript type extraction for complex parameter types (JSON Schema)
  - [x] Tool execution via `awaiting_tool` status and `resumeWithToolResult`
  - [x] Tools callable like functions in Vibe code

- [x] Context modes for loops and functions
  - [x] Trailing keywords: `forget`, `verbose`, `compress("prompt")`
  - [x] Snapshot values in orderedEntries (not references)
  - [x] Scope-enter/scope-exit markers for context output
  - [x] Store AI response in prompt entry when AI returns
  - [x] Default behavior: verbose (keep full history)

- [x] Anthropic prompt caching optimization
  - [x] Progressive chunked caching for growing context
  - [x] `cache_control: { type: "ephemeral" }` on system prompt
  - [x] Cache breakpoint on 2nd-to-last chunk (latest can change freely)

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

