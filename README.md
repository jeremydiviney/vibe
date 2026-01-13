<p align="center">
  <img src="assets/vibe-logo.png" alt="Vibe" width="200">
</p>

<p align="center">
  <strong>The language to build incredible AI agents</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vibe-lang/vibe"><img src="https://img.shields.io/npm/v/@vibe-lang/vibe.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@vibe-lang/vibe"><img src="https://img.shields.io/npm/dm/@vibe-lang/vibe.svg" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@vibe-lang/vibe.svg" alt="license"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="https://vibelang.net/docs">Documentation</a> •
  <a href="#examples">Examples</a>
</p>

---

## What is Vibe?

Vibe is a domain-specific language designed for AI agent orchestration. Write declarative prompts with type safety, compose multi-step workflows, and let the runtime handle the complexity of LLM interactions. Vibe runs on a TypeScript runtime, giving you seamless access to the entire npm ecosystem.

## Installation

```bash
npm install -g @vibe-lang/vibe
# or
bun install -g @vibe-lang/vibe
```

## Quick Start

Create a `.env` file with your API key:

```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
```

Create `hello.vibe`:

```vibe
import { env } from "system"

model claude = {
  name: "claude-sonnet-4-20250514",
  apiKey: env("ANTHROPIC_API_KEY"),
  provider: "anthropic"
}

let topic = "the future of programming"
let summary: text = do "Write a brief summary about {topic}"

summary
```

Run it:

```bash
vibe hello.vibe
```

## Features

- **Type-Safe AI Responses** — Define expected return types (`text`, `number`, `boolean`, `json`, arrays) and get validated results
- **Context Awareness** — Variables are automatically visible to AI prompts via string interpolation
- **Seamless TypeScript Interop** — Import npm packages, call TypeScript functions, embed TS blocks directly in your code
- **Automagical Async Handling** — Use `async` for parallel AI calls with automatic dependency resolution
- **Easy Custom Tool Creation** — Define tools with a simple syntax that AI models can invoke
- **Private Variables** — Mark variables as `private` to exclude them from AI context
- **Provider Agnostic** — Works with OpenAI, Anthropic, Google, and any OpenAI-compatible API

## Examples

### AI-Native Syntax

Prompts are first-class language primitives.

```vibe
const answer = do "Explain quantum computing"
```

### Strong Typing

AI calls return typed values.

```vibe
const count: number = do "How many planets?"
const isPrime: boolean = do "Is 17 prime?"
const tags: text[] = do "List 3 languages"
```

### Seamless TypeScript Interop

Drop into TypeScript whenever you need it.

```vibe
const result = ts(data) {
  const parsed = JSON.parse(data);
  return parsed.items
    .filter(item => item.score > 0.8)
    .map(item => item.name)
    .join(", ");
}
```

### Smart Context

Automatically manages AI context windows.

```vibe
function analyze(url: text): text {
  const html = fetch(url)
  const content = do "Extract article text: {html}"
  return do "Summarize the content of the article"
}
```

### Custom Tools

Define tools that AI can invoke with full type safety.

```vibe
tool getMetrics(service: text, hours: number): json
  @description "Get performance metrics for a service"
{ ... }
```

### Multi-Provider Support

Switch between OpenAI, Anthropic, and Google AI.

```vibe
model gpt = { name: "gpt-5.2", provider: "openai" }
model haiku = { name: "claude-haiku-4.5", provider: "anthropic" }
```

### The 'vibe' Keyword

Core of agent orchestration.

```vibe
vibe "Write a poem for each topic and save to separate file"
```

### Parallel Execution

Run multiple AI calls concurrently with automatic dependency resolution.

```vibe
async let summary = do "Summarize this document"
async let keywords: text[] = do "Extract 5 keywords"
async let sentiment: text = do "What is the sentiment?"

// All three run concurrently, await automatically when used
let report = do "Create a report using: {summary}, {keywords}, {sentiment}"
```

## VS Code Extension

Get syntax highlighting and language support for `.vibe` files:

```bash
code --install-extension vibelang.vibe-language
```

## Documentation

Visit [vibelang.net/docs](https://vibelang.net/docs) for the full language guide.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[ISC](LICENSE)
