<p align="center">
  <img src="https://raw.githubusercontent.com/vibelang-org/vibe/main/assets/vibe-logo.png" alt="Vibe" width="200">
</p>

<h1 align="center">Vibe Language Extension</h1>

<p align="center">
  <strong>VS Code support for Vibe — the language to build incredible AI agents</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=vibelang.vibe-language"><img src="https://img.shields.io/visual-studio-marketplace/v/vibelang.vibe-language.svg" alt="VS Marketplace"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=vibelang.vibe-language"><img src="https://img.shields.io/visual-studio-marketplace/i/vibelang.vibe-language.svg" alt="Installs"></a>
  <a href="https://github.com/vibelang-org/vibe/blob/main/LICENSE"><img src="https://img.shields.io/github/license/vibelang-org/vibe.svg" alt="License"></a>
</p>

---

## Installation

**From VS Code Marketplace (recommended):**

Search for "Vibe Language" in the Extensions panel, or run:

```bash
code --install-extension vibelang.vibe-language
```

## Features

### Editor Support

- **Syntax Highlighting** — Full highlighting for `.vibe` files with embedded TypeScript support
- **Diagnostics** — Real-time errors from lexer, parser, and semantic analysis
- **Autocomplete** — Keywords, types, variables, functions, and built-in tools
- **Hover Information** — Type info and documentation on hover
- **Go to Definition** — Jump to function, variable, and model definitions
- **Find All References** — Find all usages of a symbol
- **Rename Symbol** — Rename variables, functions, and parameters across files
- **Signature Help** — Parameter hints when calling functions
- **Document Symbols** — Outline view showing functions, tools, models, and variables
- **Folding Ranges** — Collapse functions, blocks, and loops
- **Document Formatting** — Auto-format your Vibe code

### Debugging

Full debugging support for Vibe programs:

- **Breakpoints** — Set breakpoints in `.vibe` files
- **Step Through Code** — Step over, step into, step out
- **Variable Inspection** — View local and global variables
- **Call Stack** — See the full call stack
- **Watch Expressions** — Monitor expressions as you debug
- **Conditional Breakpoints** — Break only when conditions are met
- **Logpoints** — Log messages without stopping execution
- **TypeScript Block Debugging** — Debug into embedded `ts { }` blocks

## Quick Start

1. Install the [Vibe CLI](https://www.npmjs.com/package/@vibe-lang/vibe):
   ```bash
   npm install -g @vibe-lang/vibe
   # or
   bun install -g @vibe-lang/vibe
   ```

2. Create a `.env` file with your API key:
   ```env
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
   ```

3. Create `hello.vibe`:
   ```vibe
   import { env } from "system"

   model claude = {
     name: "claude-sonnet-4-20250514",
     apiKey: env("ANTHROPIC_API_KEY"),
     provider: "anthropic"
   }

   let greeting = vibe "Say hello in a creative way"
   greeting
   ```

4. Run it:
   ```bash
   vibe hello.vibe
   ```

## Debugging Setup

1. Open a `.vibe` file
2. Set breakpoints by clicking the gutter
3. Press `F5` or go to Run → Start Debugging
4. Select "Vibe Debug" configuration

## Example Code

```vibe
import { env } from "system"

model gpt = {
  name: "gpt-4o",
  apiKey: env("OPENAI_API_KEY"),
  provider: "openai"
}

// Type-safe AI responses
let count: number = vibe "How many planets are in our solar system?" gpt

// Functions with AI
function summarize(content: text): text {
  return vibe "Summarize in one sentence: {content}" gpt
}

// Custom tools for AI to use
tool search(query: text): json
@description "Search the web"
{
  ts {
    // TypeScript implementation
    return { results: [] }
  }
}

// Parallel execution
async let a = vibe "Task 1" gpt
async let b = vibe "Task 2" gpt
let combined = vibe "Combine {a} and {b}" gpt
```

## Documentation

- [Vibe Language Guide](https://vibelang.net/docs)
- [GitHub Repository](https://github.com/vibelang-org/vibe)

## License

[ISC](https://github.com/vibelang-org/vibe/blob/main/LICENSE)
