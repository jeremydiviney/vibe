# Plan: Doc Site Updates

## Overview
All documentation site text changes, new sections, and section removals.

---

## 1. TEXT CHANGES (Simple Updates)

### Getting Started - Introduction
- [ ] Add "Leverage TypeScript/JavaScript ecosystem" under "When to Use Vibe"

### Getting Started - Installation
- [ ] Replace "You should see the version number printed" with example output
- [ ] Add note: Vibe supports any OpenAI-compatible API/provider with tool calling
- [ ] Verify: Is Node.js 18+ actually required?

### Getting Started - Hello World
- [ ] Update model names in "Try Different Providers":
  - Change `gpt-4o` → latest GPT model (verify name)
  - Use latest Gemini model (verify name)

### Guide - Basics (Variables)
- [ ] Add note: `const` is truly immutable (not "JavaScript const") - no array/object mutation

### Guide - Basics (Numbers)
- [ ] Add note: numbers are straight passthrough of TypeScript/JavaScript numbers

### Guide - Control Flow
- [ ] Fix wording: "Controls the context that exists after exit of the loop"

### Guide - Modules
- [ ] Update "Import functions, constants, and models" → "Import functions and variables"
- [ ] Change "Export Constants" → "Export Variables"
- [ ] Add project structure example showing TS files, node_modules, package.json
- [ ] Possibly remove `import { env } from "system"` if auto-imported

### AI - Prompts
- [ ] Update default model behavior description:
  1. Uses most recently used model for AI/vibe instruction
  2. If none used, uses first model declared in code
- [ ] Add note: vibe loops until AI decides finished OR hits loop limit
- [ ] Add note: `private` also reduces context clutter
- [ ] Change "returns parsed number" → "returns a number"
- [ ] Remove `let format = "JSON"` from Provide Context example
- [ ] Replace `fields` with `{fields}` in prompt example
- [ ] Add `do` can still use tools note
- [ ] Fix: `let recommendations = do "..."` should include `{results}` in prompt

### AI - Models
- [ ] Remove "Available models" for each provider
- [ ] Update model names to most recent versions
- [ ] Verify: Do we implement `thinkingLevel`?

### AI - Tools
- [ ] Change "commonly used" → "are used"
- [ ] Update error handling examples to throw errors (not return error objects)

### AI - Context
- [ ] Add detailed description of local vs default context
- [ ] Fix compress example - clarify what `summarizer` is (it's a model identifier)

### AI - Async
- [ ] Remove "Async in Loops" section (doesn't work yet)
- [ ] Add automatic dependency detection section
- [ ] Remove "Don't Parallelize Dependent Work"
- [ ] Remove "Fire-and-Forget for Logging"
- [ ] Remove "Comparison with Sequential"
- [ ] Add async context rules section with example

### TypeScript - Blocks
- [ ] Remove "Accessing Environment" section
- [ ] Change "The AI will:" → "The AI will (most likely):"
- [ ] Complex Tool Example: change `vibe` → `do`
- [ ] Async Operations: explain all ts calls treated as promises
- [ ] Verify npm require pattern works, or use async import
- [ ] Update error handling to throw errors

### TypeScript - Imports
- [ ] Remove "Re-exporting" section
- [ ] Remove "Example: Full Integration" section
- [ ] Remove "Package Installation" section (verify npm support first)
- [ ] Pull system functions into new System Imports section

### Reference - CLI
- [ ] Fix: `--max-parallel=N` → "concurrent async operations" (not "AI calls")

### Reference - Syntax
- [ ] Fix template literal: show `{}` and `!{}` (not `${}`)
- [ ] Show multi-line support
- [ ] Add type inference comment for `let/const identifier = expression`
- [ ] Async Declaration: note expression must be AI op, vibe function, ts block, or ts function
- [ ] Verify: `let private x` is correct (not `private let x`) ✅ Verified

### Reference - Types
- [ ] Remove "Nested Arrays" section
- [ ] Fix null/boolean: "null cannot be assigned to boolean"
- [ ] Remove "JSON Flexibility" section
- [ ] Verify text and prompt are interchangeable

---

## 2. NEW SECTIONS TO ADD

### New: String Interpolation Section (Language Guide)
- [ ] Explain `{}` vs `!{}` syntax
- [ ] `{var}` in prompt = focus model on variable in context (doesn't expand)
- [ ] `!{var}` = actually expand the value
- [ ] Difference between text and prompt values

### New: Environment Section
- [ ] `.env` file support
- [ ] Basic example using `env()` system function

### New: Manual Context Curation Section
- [ ] Pattern: array outside loop, push items inside, use `forget`

### New: Error Handling Section
- [ ] Basic Vibe error examples
- [ ] TS inline error examples
- [ ] TS function error examples

### New: Standard Tools Section
- [ ] Document what each built-in tool does

### New: System Imports Section
- [ ] `env` and `print` are auto-imported
- [ ] Other system functions require explicit import
- [ ] Refactor "Built-in Functions" based on this

### New: Tool Bundles Section (under AI - Tools)
- [ ] Document bundles from `system/tools`:
  - `allTools` (19 tools): Complete set - file, search, directory, utility, system tools
  - `readonlyTools` (12 tools): Safe read-only - no write, no shell, no codegen
  - `safeTools` (17 tools): No bash, no runCode - everything else
- [ ] Show import syntax: `import { allTools, readonlyTools } from "system/tools"`
- [ ] Show usage in model: `tools: readonlyTools`
- [ ] Mention individual tools can be imported: `import { bash, runCode } from "system/tools"`
- [ ] List all 19 tools with brief descriptions

---

## 3. SECTIONS TO REMOVE

- [ ] Context Modes: "Independent Analysis"
- [ ] Async: "Async in Loops"
- [ ] Async: "Don't Parallelize Dependent Work"
- [ ] Async: "Fire-and-Forget for Logging"
- [ ] Async: "Comparison with Sequential"
- [ ] TS Blocks: "Accessing Environment"
- [ ] Importing: "Re-exporting"
- [ ] Importing: "Example: Full Integration"
- [ ] Importing: "Package Installation" (if no npm support)
- [ ] Types: "Nested Arrays"
- [ ] Types: "JSON Flexibility"

---

## Files to Modify

| File | Changes |
|------|---------|
| `getting-started/introduction.md` | TS ecosystem line |
| `getting-started/installation.md` | Version output, API note |
| `getting-started/hello-world.md` | Model names |
| `guide/basics.md` | const note, numbers note |
| `guide/control-flow.md` | Context wording |
| `guide/modules.md` | Export wording, structure |
| `ai/prompts.md` | Multiple updates |
| `ai/models.md` | Model names |
| `ai/tools.md` | Error handling |
| `ai/context.md` | Local/default description |
| `ai/async.md` | Major restructure |
| `typescript/blocks.md` | Multiple updates |
| `typescript/imports.md` | System imports refactor |
| `reference/cli.md` | max-parallel fix |
| `reference/syntax.md` | Template literals |
| `reference/types.md` | Null, json |
| NEW: `guide/strings.md` | String interpolation |
| NEW: `guide/environment.md` | .env and env() |
| NEW: `guide/errors.md` | Error handling |
| NEW: `reference/tools.md` | Standard tools |
| NEW: `reference/system.md` | System imports |

---

## Verification
1. Run `bun run build` in docs-site
2. Check all pages render correctly
3. Verify no broken links
