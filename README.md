<p align="center">
  <img src="assets/vibe-logo.png" alt="Vibe" width="200">
</p>

<h1 align="center">Vibe</h1>

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
let summary: text = vibe "Write a brief summary about {topic}"

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

### Multi-Step Workflow

```vibe
import { env } from "system"

model gpt = {
  name: "gpt-4o",
  apiKey: env("OPENAI_API_KEY"),
  provider: "openai"
}

function analyzeAndSummarize(content: text): text {
  let analysis = vibe "Analyze the key themes in: {content}" gpt
  return vibe "Summarize this analysis in one sentence: {analysis}" gpt
}

let article = "..." // your content here
let result = analyzeAndSummarize(article)
result
```

### Custom Tool

```vibe
tool fetchWeather(city: text): json
@description "Get current weather for a city"
{
  // Tool implementation - can use TypeScript
  ts {
    const response = await fetch(`https://api.weather.com/${city}`)
    return await response.json()
  }
}

let report = vibe "What's the weather like in Tokyo? Use the fetchWeather tool." claude
```

### TypeScript Interop

```vibe
import { readFileSync } from "fs"
import { join } from "path"

// Embedded TypeScript block
let files: text[] = ts {
  const dir = process.cwd()
  return fs.readdirSync(dir).filter(f => f.endsWith('.vibe'))
}

// Use results in AI prompt
let description = vibe "Describe what these Vibe files might do: {files}" claude
```

### Parallel Execution

```vibe
// Run multiple AI calls in parallel
async let summary = vibe "Summarize this document" claude
async let keywords: text[] = vibe "Extract 5 keywords" claude
async let sentiment: text = vibe "What is the sentiment?" claude

// All three run concurrently, await automatically when used
let report = vibe "Create a report using: {summary}, {keywords}, {sentiment}" claude
```

## VS Code Extension

Get syntax highlighting and language support for `.vibe` files:

```bash
code --install-extension vibe-lang.vibe
```

## Documentation

Visit [vibelang.net/docs](https://vibelang.net/docs) for the full language guide.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[ISC](LICENSE)
