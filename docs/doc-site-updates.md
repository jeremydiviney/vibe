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
- [ ] **Remove "Requirements" section entirely** - Vibe ships as compiled binary, no runtime needed

### Getting Started - Hello World
- [ ] Update model names in "Try Different Providers":
  - OpenAI: `gpt-4o` (correct, keep as-is)
  - Google: Change `gemini-2.0-flash` → `gemini-2.5-flash` (stable) or `gemini-3-flash` (latest)

### Model Name Standards (Global)

**Use these latest models consistently across all docs:**
| Provider | Recommended Model | API ID |
|----------|-------------------|--------|
| Anthropic | Claude Haiku 4.5 | `claude-haiku-4-5-20251001` |
| OpenAI | GPT-4o | `gpt-4o` |
| Google | Gemini 3 Flash | `gemini-3-flash` |

**Anthropic uses dashes not dots** in model IDs:
- ❌ `claude-haiku-4.5` → ✅ `claude-haiku-4-5-20251001`
- ❌ `claude-opus-4.5` → ✅ `claude-opus-4-5-20251101`

**Files needing model name updates:**
- `docs-site/src/content/docs/ai/tools.md`: `claude-opus-4.5` → fix
- `docs-site/src/content/docs/ai/prompts.md`: `claude-haiku-4.5`, `claude-opus-4.5` → fix
- `docs-site/src/content/docs/getting-started/hello-world.md`: `claude-haiku-4.5` → fix
- `docs-site/src/content/docs/getting-started/hello-world.md`: `gemini-2.0-flash` → `gemini-3-flash`
- All other files: search and replace outdated model names

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
- [ ] ✅ `thinkingLevel` IS implemented (OpenAI→reasoning_effort, Anthropic→budget_tokens, Google→thinkingConfig)

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
- [ ] Update ts block npm examples: use `await import()` instead of `require()` (if we keep them)
- [ ] Update error handling to throw errors

### TypeScript - Imports
- [ ] Remove "Re-exporting" section
- [ ] Remove "Example: Full Integration" section
- [ ] Remove "Package Installation" section (confirmed: npm imports not supported)
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
- [x] ✅ VERIFIED: text and prompt ARE interchangeable (see `semantic/types.ts:34-38`)
  - ✅ `prompt` → `string` TS mapping implemented (ts-types.ts:22, :95)

  **Tests to add** (in `type-validation.test.ts`):
  1. `text` → `prompt` assignment is valid
  2. Type preservation: `text` variable assigned from `prompt` stays `text` type
  3. Type preservation: `prompt` variable assigned from `text` stays `prompt` type
  4. TS interop: `prompt` variable passed to ts block maps to `string`
  5. TS interop: function with `string` param accepts `prompt` variable

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
- [ ] TS Blocks: "Using npm Packages" - update to use `await import()` or remove
- [ ] TS Blocks: "File System Operations" - update to use `await import('fs')` or remove
- [ ] Importing: "Importing npm Packages" (lines 51-71, Node.js builtins + third-party)
- [ ] Importing: "Re-exporting"
- [ ] Importing: "Example: Full Integration"
- [ ] Importing: "Package Installation"
- [ ] Types: "Nested Arrays"
- [ ] Types: "JSON Flexibility"

---

## 4. NPM PACKAGE REFERENCES TO REMOVE

**Status: CONFIRMED - Vibe-level npm imports are NOT supported**

Vibe's `resolveModulePath()` treats all non-system imports as relative file paths.
`import {foo} from 'lodash'` resolves to a relative path, not node_modules lookup.

Supported Vibe import sources:
- System modules: `system`, `system/tools`
- Relative paths to `.ts` files: `./helpers.ts`
- Relative paths to `.vibe` files: `./utils.vibe`

**Inside ts blocks**: Dynamic `await import()` may work for npm packages (needs verification):
```vibe
let result = ts(data) {
  const { marked } = await import('marked');  // Modern ESM syntax
  return marked.parse(data);
}
```
Do NOT use `require()` - it's not available in AsyncFunction scope.

### Verification Test

Add to `packages/runtime/src/runtime/test/ts-block.test.ts`:

```typescript
test('ts block can use dynamic import for Node built-ins', async () => {
  const ast = parse(`
    let result = ts() {
      const { join } = await import('path');
      return join('foo', 'bar');
    }
  `);
  const runtime = new Runtime(ast, createMockProvider());
  await runtime.run();
  // Note: path separator varies by OS
  expect(runtime.getValue('result')).toMatch(/foo[\/\\]bar/);
});
```

### Files with npm references to fix:

**index.mdx** (line 32)
- Change: "Drop into TypeScript whenever you need it. Import npm packages directly."
- To: "Drop into TypeScript whenever you need it. Access TypeScript functions and utilities."

**getting-started/introduction.md** (lines 44-56)
- Remove "giving you seamless access to the entire npm ecosystem"
- Remove example showing `import { readFileSync } from "fs"` and `import { join } from "path"`
- Replace with example showing local TS file imports or system imports

**guide/modules.md** (lines 27-36)
- Remove entire "Importing npm Packages" section
- The example shows `import { readFileSync } from "fs"` which doesn't work

**typescript/imports.md**
- Line 3: Change description "Using TypeScript and npm packages" → "Using TypeScript files and modules"
- Line 6: Change "from TypeScript files and npm packages" → "from TypeScript files, Vibe modules, and system utilities"
- Remove "Importing npm Packages" section (lines 51-71)
- Remove "Package Installation" section (lines 179-196)

**typescript/blocks.md**
- Update "Using npm Packages" section (lines 105-114): change `require('marked')` to `await import('marked')`
- Update "File System Operations" section (lines 188-198): change `require('fs')` to `await import('fs')`
- Or remove these sections entirely if we don't want to document ts-block npm usage

---

## Files to Modify

| File | Changes |
|------|---------|
| `index.mdx` | Remove npm claim from TypeScript Interop card |
| `getting-started/introduction.md` | Remove npm ecosystem claim, fix TS Runtime example |
| `getting-started/installation.md` | Version output, API note |
| `getting-started/hello-world.md` | Model names |
| `guide/basics.md` | const note, numbers note |
| `guide/control-flow.md` | Context wording |
| `guide/modules.md` | Export wording, remove npm section |
| `ai/prompts.md` | Multiple updates |
| `ai/models.md` | Model names |
| `ai/tools.md` | Error handling |
| `ai/context.md` | Local/default description |
| `ai/async.md` | Major restructure |
| `typescript/blocks.md` | Remove npm/require sections, other updates |
| `typescript/imports.md` | Remove npm sections, system imports refactor |
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
