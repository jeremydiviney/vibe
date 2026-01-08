# Vibe Language - TODO

## Pending

### AI Integration
- [ ] Handle streaming responses
- [ ] Parallel AI calls
  - [ ] Auto-parallelize independent AI calls (no data dependencies)
  - [ ] Configurable concurrency limit
- [ ] Structured multi-value AI returns
  - [ ] `const ret = do "get x, y, z"` → `ret.x`, `ret.y`, `ret.z`
  - [ ] Destructuring syntax: `const {x, y, z} = do "get x, y, z"`
  - [ ] AI prompted to return JSON with requested fields
  - [ ] Automatic parsing and validation

### Context Management Features
- [ ] Context checkpoints beyond local/global
- [ ] Context orchestration functions
- [ ] Variable visibility modifiers

### Permission System
- [ ] Command permission scheme (like Claude Code settings)
  - [ ] Config file format (`.vibe/settings.json` or `vibe.config.json`)
  - [ ] Allow/deny lists with glob patterns for tools and commands
  - [ ] Interactive prompts for unknown/dangerous operations
  - [ ] Global config (`~/.vibe/settings.json`) and project config
  - [ ] CLI flags: `--yes-all`, `--safe-mode`

### npm Publishing
- [ ] Publish Vibe CLI to npm as `@vibe-lang/vibe` (PLAN: PLAN-npm-publish.md)
  - [x] Create publish script (`scripts/publish.ts`)
  - [ ] Test local install with `npm pack`
  - [ ] Publish to npm registry
  - [ ] Update README with installation instructions

### Real-World Examples
- [ ] Code review assistant (`examples/code-review.vibe`)
  - Takes git diff, AI analyzes, outputs structured review
- [ ] Changelog generator (`examples/changelog.vibe`)
  - Reads git log between tags, AI summarizes into categories
- [ ] File organizer (`examples/file-organizer.vibe`)
  - Scans directory, AI categorizes, moves files to folders
- [ ] Interactive chat (`examples/chat.vibe`)
  - Simple REPL chat demonstrating context management

### VSCode Integration
- [ ] Build VSCode LSP for Vibe
  - [ ] Syntax highlighting
  - [ ] Diagnostics (errors, warnings)
  - [ ] Go to definition
  - [ ] Hover information
  - [ ] Autocomplete
- [ ] Build debug support for VSCode
  - [ ] Debug Adapter Protocol (DAP) implementation
  - [ ] Breakpoints
  - [ ] Step through execution
  - [ ] Variable inspection
  - [ ] Call stack visualization
- [ ] Publish VSCode extension to marketplace
  - [ ] Create publisher account on VS Marketplace
  - [ ] Package extension with `vsce package`
  - [ ] Publish with `vsce publish`
  - [ ] Add marketplace badge to README

### Claude Code Plugin Distribution
- [ ] Package symbol-tree as shareable plugin

## Completed (Last 10)

- [x] Optional model and context modifiers for `do`/`vibe`
  - [x] Valid syntaxes: `do ""`, `do "" model`, `do "" context`, `do "" model context`
  - [x] Default context: `default` (global) when omitted
  - [x] Default model: last used model when omitted (uses `lastUsedModel` tracking)
  - [x] GATE lookahead to disambiguate model identifiers from function calls
  - [x] Integration test: hello-world-translator

- [x] Codebase cleanup
  - [x] Remove all `do` keyword references from docs (replaced by `vibe`)
  - [x] Remove `cache` keyword from lexer and docs
  - [x] Fix all TypeScript errors (`bun tsc --noEmit`)

- [x] AIResultObject with toolCalls and Python-style array slicing
  - [x] AI calls return `{value, toolCalls}` object with primitive coercion
  - [x] `.toolCalls` array with `{tool, args, result, error, duration}` records
  - [x] Python-style slicing: `arr[1:3]`, `arr[:-1]`, `arr[::2]`
  - [x] Logical indexing: `arr[boolArray]` for array filtering

- [x] Implement `compress` keyword runtime functionality
  - [x] Flexible syntax: `compress`, `compress(model)`, `compress("prompt")`, `compress("prompt", model)`, `compress(promptVar)`, `compress(promptVar, model)`
  - [x] AST updates for CompressArg type with model/prompt support
  - [x] Parser handles all compress syntax patterns
  - [x] Semantic validation: type checking for model/prompt arguments
  - [x] Runtime: `awaiting_compress` status, `pendingCompress` state, `resumeWithCompressResult`
  - [x] `lastUsedModel` tracking - set on model declaration, updated on AI calls
  - [x] `formatEntriesForSummarization` helper for AI summarization
  - [x] Integration with Runtime class for automatic compress handling
  - [x] Integration tests: for/while loops, custom prompts, explicit models (4 tests)
  - [x] 1373 unit tests passing

- [x] Remove context modes from functions (e3014ad)
  - [x] Functions now always "forget" context on exit like traditional callstack
  - [x] Loops retain forget/verbose/compress modes
  - [x] Return values are the interface for passing data out

- [x] Single-round AI command (`do` keyword)
  - [x] `do` keyword for single-round AI call (executes tools once, no loop back)
  - [x] `vibe` continues to support multi-turn tool calling (up to 10 rounds)
  - [x] Parser, visitor, runtime types, AI provider updated
  - [x] Removed `Ask` token from lexer (internal `'ask'` type preserved for user input)

- [x] Runtime safety for const objects in ts blocks
  - [x] Deep freeze const JSON objects before passing to ts blocks
  - [x] Added 'use strict' to AsyncFunction for proper error throwing
  - [x] Const objects/arrays cannot be mutated; let objects can be

- [x] Code Generation Tool (bash, runCode)
  - [x] `bash` tool using Bun's cross-platform shell via temp script
  - [x] `runCode` tool with subprocess isolation and scope injection
  - [x] Unique run folders (.vibe-cache/r1, r2...) with mutex for concurrency
  - [x] Timeout enforcement with process kill

- [x] AI-initiated tool calling (Phase 5)
  - [x] Tool schema conversion for OpenAI, Anthropic, Google providers
  - [x] Tool call parsing from AI responses (all 3 providers)
  - [x] Multi-turn tool execution loop (`executeWithTools`)
  - [x] Tool calls embedded in prompt entries for proper context ordering
  - [x] Context shows: AI call → tool calls → results → final response
  - [x] Flow tests with mock AI provider executing real tools
  - [x] Loop context modes (forget/verbose) properly handle tool calls

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
  - [x] Format: `--> vibe: "prompt"` followed by `<-- varName: response`
