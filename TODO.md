# Vibe Language - TODO

## Pending

### AI Integration
- [ ] Parallel AI calls
  - [ ] Auto-parallelize independent AI calls (no data dependencies)
  - [ ] Configurable concurrency limit
- [ ] Model/provider registry and capability mapping
  - [ ] Map of known models with their capabilities (structured output, thinking, tools)
  - [ ] Allow/deny lists for models (e.g., only allow certain models in production)
  - [ ] Different handlers per model/provider (e.g., Anthropic pre-4.5 lacks structured output)
  - [ ] Graceful fallback when capability not supported (use prompt instructions instead)
  - [ ] Model aliases (e.g., `fast` → `gemini-3-flash`, `smart` → `claude-sonnet-4-5`)

### Context Management Features
- [ ] Context checkpoints beyond local/global
- [ ] Context orchestration functions
- [ ] Variable visibility modifiers

### Module System
- [ ] Research multiple global scopes when importing files
  - [ ] How to handle identical variable/function names across imported vibe files
  - [ ] Should functions in one file have access to variables in another file's global scope?
  - [ ] Module isolation vs shared global state

### Permission System
- [ ] Command permission scheme (like Claude Code settings)
  - [ ] Config file format (`.vibe/settings.json` or `vibe.config.json`)
  - [ ] Allow/deny lists with glob patterns for tools and commands
  - [ ] Interactive prompts for unknown/dangerous operations
  - [ ] Global config (`~/.vibe/settings.json`) and project config
  - [ ] CLI flags: `--yes-all`, `--safe-mode`

### CLI Options
- [ ] Add CLI options to vibe command
  - [ ] `--verbose` / `-v` for verbose logging
  - [ ] `--quiet` / `-q` for minimal output
  - [ ] `--log-ai` to enable AI interaction logging
  - [ ] `--version` to show version
  - [ ] `--help` to show usage

### Documentation
- [ ] Create README for GitHub and npm
  - [ ] Project overview and features
  - [ ] Installation instructions (`npm install -g @vibe-lang/vibe`)
  - [ ] Quick start example
  - [ ] Language syntax guide
  - [ ] CLI usage (`vibe`, `vibe upgrade`, `vibe --version`)

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

- [x] Destructuring declarations for multi-value AI returns
  - [x] Syntax: `const {name: text, age: number} = do "prompt" model default`
  - [x] Also works with `let` for mutable bindings
  - [x] Single `__vibe_return_field` tool for all typed returns
  - [x] Post-collection validation via `collectAndValidateFieldResults()`
  - [x] Semantic analyzer: duplicate field detection, scope conflict checks
  - [x] Parser and semantic unit tests (27 tests)
  - [x] Integration tests with Google Gemini 3 (6 tests)

- [x] npm Publishing to `@vibe-lang/vibe`
  - [x] Multi-platform support: Linux x64/ARM64, macOS x64/ARM64, Windows x64
  - [x] Baseline builds for x64 (no AVX2 requirement)
  - [x] Parallel builds and publishing
  - [x] `vibe upgrade` / `vibe update` command
  - [x] `vibe --version` flag
  - [x] JavaScript wrapper for Windows compatibility

- [x] Tool-based type returns (replacing structured outputs)
  - [x] Return tools for all typed returns: number, boolean, json, text[], number[], boolean[], json[]
  - [x] Internal-only tools automatically added to AI requests at runtime
  - [x] Removed structured output code from all providers (OpenAI, Anthropic, Google)
  - [x] Type validation happens in tool executors with retry on error
  - [x] Better cross-provider compatibility than structured outputs

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
