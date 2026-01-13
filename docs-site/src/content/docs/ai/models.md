---
title: Models
description: Configuring AI models and providers
---

Models define which AI provider and configuration to use for prompts.

## Basic Model Declaration

```vibe
model myModel = {
  name: "claude-sonnet-4-20250514",
  apiKey: env("ANTHROPIC_API_KEY"),
  provider: "anthropic"
}
```

## Configuration Fields

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | text | Model identifier (e.g., "claude-sonnet-4-20250514", "gpt-4o") |
| `apiKey` | text | API key for authentication |
| `provider` | text | Provider type: `"anthropic"`, `"openai"`, `"google"` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `url` | text | Custom API endpoint URL (defaults per provider) |
| `maxRetriesOnError` | number | Automatic retry count on API errors (default: 0) |
| `thinkingLevel` | text | Extended reasoning level for supported models |
| `tools` | array | Tools available to this model |

## Providers

### Anthropic

```vibe
model claude = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY")
}
```

Available models:
- `claude-opus-4.5` - Most capable
- `claude-sonnet-4-20250514` - Balanced
- `claude-haiku-4.5` - Fast and efficient

### OpenAI

```vibe
model gpt = {
  name: "gpt-4o",
  provider: "openai",
  apiKey: env("OPENAI_API_KEY")
}
```

Available models:
- `gpt-4o` - Latest GPT-4
- `gpt-4-turbo` - Fast GPT-4
- `gpt-3.5-turbo` - Efficient

### Google

```vibe
model gemini = {
  name: "gemini-2.0-flash",
  provider: "google",
  apiKey: env("GOOGLE_API_KEY")
}
```

Available models:
- `gemini-2.0-flash` - Fast and capable
- `gemini-1.5-pro` - Advanced reasoning

## Extended Thinking

Some models support extended reasoning with `thinkingLevel`:

```vibe
model deepThinker = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY"),
  thinkingLevel: "high"
}
```

Levels: `"none"`, `"low"`, `"medium"`, `"high"`, `"max"`

## Error Handling

Automatically retry on transient errors:

```vibe
model resilient = {
  name: "gpt-4o",
  provider: "openai",
  apiKey: env("OPENAI_API_KEY"),
  maxRetriesOnError: 3
}
```

## Custom Endpoints

Use a custom API endpoint (OpenAI-compatible):

```vibe
model local = {
  name: "llama-3",
  provider: "openai",
  apiKey: "not-needed",
  url: "http://localhost:11434/v1"
}
```

## Models with Tools

Attach tools for the model to use:

```vibe
import { readFile, writeFile, bash } from "system/tools"

model agent = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY"),
  tools: [readFile, writeFile, bash]
}

// Agent can now use these tools
vibe "Read the config file and update the version" agent
```

See [Tools](/docs/ai/tools/) for more on tool definitions.

## Multiple Models

Use different models for different tasks:

```vibe
model fast = {
  name: "claude-haiku-4.5",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY")
}

model smart = {
  name: "claude-opus-4.5",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY")
}

// Quick tasks
let classification = do "Classify this: {text}" fast

// Complex reasoning
let analysis = do "Deeply analyze this: {text}" smart
```

## Exporting Models

Share models across files:

```vibe
// config.vibe
export model claude = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY")
}

// main.vibe
import { claude } from "./config.vibe"
let result = do "Hello" claude
```
