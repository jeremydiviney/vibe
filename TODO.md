# Vibe Language - TODO

## Pending

### AI Integration
- [ ] Model/provider registry and capability mapping
  - [ ] Map of known models with their capabilities (structured output, thinking, tools)
  - [ ] Allow/deny lists for models (e.g., only allow certain models in production)
  - [ ] Different handlers per model/provider (e.g., Anthropic pre-4.5 lacks structured output)
  - [ ] Graceful fallback when capability not supported (use prompt instructions instead)
  - [ ] Model aliases (e.g., `fast` → `gemini-3-flash`, `smart` → `claude-sonnet-4-5`)

### Subagents
- [ ] Subagent support (async vibe functions with isolated context)
  - [ ] Clean context with initial prompt from calling AI
  - [ ] Configurable system prompts per subagent
  - [ ] Separate model declaration with custom system prompts on top of standard prompts
  - [ ] Independent toolsets per subagent
  - [ ] Callable by parent AI model (registered in context like tools)
  - [ ] Callable by Vibe code directly
  - [ ] Consider syntax: `agent myAgent = { model: m, systemPrompt: "...", tools: [...] }`

### Context Management Features
- [ ] Context checkpoints beyond local/global
- [ ] Context orchestration functions

### Permission System
- [ ] Command permission scheme (like Claude Code settings)
  - [ ] Config file format (`.vibe/settings.json` or `vibe.config.json`)
  - [ ] Allow/deny lists with glob patterns for tools and commands
  - [ ] Interactive prompts for unknown/dangerous operations
  - [ ] Global config (`~/.vibe/settings.json`) and project config
  - [ ] CLI flags: `--yes-all`, `--safe-mode`

### CLI Options
- [ ] Add CLI options to vibe command
  - [x] `--verbose` for JSONL logging (console + file)
  - [x] `--log-dir=PATH` for custom log directory
  - [ ] `--quiet` / `-q` for minimal output
  - [x] `--version` to show version
  - [x] `--help` to show usage
  - [x] `--inspect` to start with debugger server
  - [x] `--inspect-brk` to break on entry
  - [x] `--inspect-port=PORT` for custom debug port

### Documentation
- [x] Create README for GitHub and npm
  - [x] Project overview and features
  - [x] Installation instructions (`npm install -g @vibe-lang/vibe`)
  - [x] Quick start example
  - [x] Language syntax guide
  - [x] CLI usage (`vibe`, `vibe upgrade`, `vibe --version`)

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
- [x] Build VSCode LSP for Vibe
  - [x] Syntax highlighting
  - [x] Diagnostics (errors, warnings)
  - [x] Go to definition
  - [x] Hover information
  - [x] Autocomplete
  - [x] Find all references
  - [x] Rename symbol
  - [x] Signature help
  - [x] Folding ranges
  - [x] Document formatting
  - [x] TypeScript import support (hover, go-to-definition)
- [x] Build debug support for VSCode (see `docs/debugger-plan.md`)
  - [x] Phase 1: Basic Vibe Debugging
    - [x] Add `--inspect` flag to Vibe CLI
    - [x] Implement runtime debug hooks (beforeStatement, breakpoints)
    - [x] Create WebSocket server in runtime for debug communication
    - [x] Build Debug Adapter (DAP server) in VSCode extension
    - [x] Add debugger contribution to VSCode extension package.json
    - [x] Implement breakpoints support
    - [x] Implement stepping (continue, stepIn, stepOver, stepOut)
    - [x] Implement call stack inspection
    - [x] Implement variable inspection
  - [x] Phase 2: TS Block Debugging
    - [x] Connect Debug Adapter to Bun inspector WebSocket
    - [x] Source map TS blocks to locations within .vibe files
    - [x] Implement handoff logic when entering TS block
    - [x] Merge stack frames from Vibe runtime and Bun inspector
    - [x] Handle breakpoints set inside TS blocks
  - [x] Phase 3: Imported TS Function Debugging
    - [x] Detect when step-in targets a TS import
    - [x] Set temporary breakpoint at TS function entry
    - [x] Hand control to Bun inspector
    - [x] Resume Vibe runtime control on return
  - [x] Phase 4: Polish & Advanced Features
    - [x] Conditional breakpoints
    - [x] Logpoints
    - [x] Watch expressions
    - [x] Exception breakpoints
  - [ ] Vibe-Specific Debug Features
    - [x] Show `.toolCalls` for VibeValue variables in debug inspector
    - [x] Show `.err` field inline for variables with errors
    - [ ] Context visualization panel (local vs default context)
    - [ ] Show context entries with their values
    - [ ] Highlight which context is active for current scope
- [x] Publish VSCode extension to marketplace
  - [x] Create publisher account on VS Marketplace
  - [x] Package extension with `vsce package`
  - [x] Publish with `vsce publish`
  - [ ] Add marketplace badge to README

### Claude Code Plugin Distribution
- [ ] Package symbol-tree as shareable plugin

### Language Design
- [ ] String interpolation in prompts vs text variables
  - Consider whether `{variable}` should interpolate in prompts since context already has access
  - Current behavior: prompts use `{var}`, template literals use `${var}`
  - Most of the time don't want to interpolate in prompts - the AI already has context access
  - May want to differentiate syntax or make interpolation optional in prompts

### Error Handling Enhancements
- [ ] `??` operator for default values on error (`result ?? "fallback"`)
- [ ] `?` operator for error propagation (`riskyOp()?`)
- [ ] `!` operator for crash-if-error (`mustSucceed()!`)
- [ ] Method calls on values (`x.toUpperCase()`)
- [ ] Stricter error modes

## Completed (Last 10)

- [x] Parallel async execution (`async let/const`)
  - [x] Syntax: `async let x = do "prompt" model` for async AI calls
  - [x] Syntax: `async let x = ts { ... }` and `async let x = tsFunction()` for async TS
  - [x] Syntax: `async let x = vibeFunction()` for async Vibe function calls
  - [x] Syntax: `async let {a: text, b: number} = do "..." model` for async destructuring
  - [x] Syntax: `async do "prompt" model` for fire-and-forget (awaited at block boundaries)
  - [x] Automatic dependency detection and wave-based execution
  - [x] Implicit await at: variable usage, string interpolation, block boundaries
  - [x] CLI flag: `--max-parallel=N` (default 4) for concurrency limit
  - [x] Error handling: failures captured in VibeValue.err, don't block other parallel ops
  - [x] 62 unit tests for parallel execution, timing, nested calls, execution order

- [x] Variable visibility modifiers (`private` keyword)
  - [x] Syntax: `let private x: text = "hidden"`, `const private X: text = "secret"`
  - [x] Destructuring: `let {private x: text, y: number} = ...` (per-field visibility)
  - [x] Private variables exist in runtime but are filtered from AI context
  - [x] Debugger shows `[private]` suffix for private variables
  - [x] 18 unit tests for parser and context filtering

- [x] Verbose logging system (`--verbose` flag)
  - [x] JSONL event logging to console and `.vibe-logs/run-{timestamp}.jsonl`
  - [x] Context files in `.vibe-logs/run-{timestamp}/` subdirectory
  - [x] Sequential IDs: `do-000001`, `vibe-000001`, `ts-000001`, `tsf-000001`
  - [x] Events: run_start, run_complete, ai_start, ai_complete, tool_start, tool_complete, ts_start, ts_complete
  - [x] Runtime API: `getLogEvents()` for programmatic access
  - [x] 27 unit tests for VerboseLogger

- [x] VibeValue unified type system
  - [x] VibeValue wraps all runtime values with `.value`, `.err`, `.toolCalls`, `.source`
  - [x] VibeError with message, type, and source location
  - [x] Error propagation through arithmetic/operations
  - [x] Null as first-class value (coercion rules, JS interop)
  - [x] Type annotations preserved through operations

- [x] Complete debugger implementation (Phase 1-4)
  - [x] Phase 1: Basic Vibe debugging with breakpoints, stepping, variables
  - [x] Phase 2: TS block debugging with source maps and Bun inspector
  - [x] Phase 3: Imported TS function debugging with handoff management
  - [x] Phase 4: Conditional breakpoints, logpoints, watch expressions, exception breakpoints
  - [x] 117 debug tests covering all features
  - [x] Functional architecture with pure functions throughout

- [x] Monorepo restructure
  - [x] Restructure to `packages/` monorepo (runtime, vscode-extension, debug-core)
  - [x] Bun workspaces with `workspace:*` protocol

- [x] Null as first-class value type
  - [x] Add `null` keyword to lexer/parser with NullLiteral AST node
  - [x] Semantic validation: `const x = null` errors, `let x = null` errors (no type inference), `let x: T = null` valid
  - [x] Runtime: null valid for any typed variable, arithmetic with null creates error VibeValue
  - [x] String concatenation coerces null to empty string, comparison works normally
  - [x] JS interop: normalize undefined from TS functions to null at boundaries
  - [x] Preserve error field through variable assignments

- [x] Module scope isolation for imported Vibe functions
  - [x] Each module has isolated global scope (variables don't leak between modules)
  - [x] Imported functions see their own module's globals, not caller's
  - [x] Add `globals` to VibeModule, `modulePath` to StackFrame
  - [x] Module-aware variable lookup stops at module boundary
  - [x] Unit tests for isolation behavior

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

