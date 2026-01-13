---
title: AI Prompts
description: The do and vibe keywords
---

Vibe has two keywords for interacting with AI models: `do` and `vibe`.

## The `do` Keyword

The simplest way to call AI. Sends a prompt and returns a response:

```vibe
const answer = do "Explain quantum computing"
```

### Typed Responses

Specify a return type to get parsed values:

```vibe
const count: number = do "How many planets in our solar system?"
const isPrime: boolean = do "Is 17 a prime number?"
const languages: text[] = do "List 5 programming languages"
const data: json = do "Return a person object with name and age"
```

### String Interpolation

Variables are automatically interpolated into prompts using `{variable}` syntax:

```vibe
let topic = "machine learning"
let audience = "beginners"

const explanation = do "Explain {topic} for {audience}"
```

:::note
AI prompts use `{variable}` syntax (without `$`), which is different from template literals that use `${variable}`.
:::

### Specifying a Model

By default, `do` uses the first model declared. Specify a different model:

```vibe
model fast = { name: "claude-haiku-4.5", provider: "anthropic", apiKey: env("ANTHROPIC_API_KEY") }
model smart = { name: "claude-opus-4.5", provider: "anthropic", apiKey: env("ANTHROPIC_API_KEY") }

const quick = do "Simple question" fast
const detailed = do "Complex analysis" smart
```

## The `vibe` Keyword

Used for agent orchestration—when you want the AI to take autonomous action:

```vibe
import { writeFile } from "system/tools"

model agent = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY"),
  tools: [writeFile]
}

const topics = ["sunset", "coffee", "mountains"]

vibe "Write a poem for each topic and save to separate files"
```

With `vibe`, the AI can:
- Use available tools
- Make multiple calls
- Reason about how to accomplish the task

### Context Modes

Control what context the AI sees:

```vibe
// Full execution history (default)
vibe "Summarize everything so far" myModel default

// Current scope only
vibe "Process this data" myModel local
```

## Context Awareness

All variables in scope are visible to AI prompts:

```vibe
let customer = { name: "Alice", tier: "premium" }
let history = ["purchased item A", "returned item B"]

// AI sees both customer and history
const recommendation = do "What should we recommend to this customer?"
```

### Private Variables

Exclude sensitive data from AI context:

```vibe
private let apiSecret = "sensitive"
let publicData = "visible to AI"

// AI only sees publicData, not apiSecret
do "Analyze the available data"
```

## Best Practices

### Be Specific

```vibe
// Less specific
do "Summarize this"

// More specific
do "Summarize this article in 3 bullet points, focusing on key findings"
```

### Use Types

```vibe
// Without type - returns text
let result = do "How many items?"

// With type - returns parsed number
let count: number = do "How many items?"
```

### Provide Context

```vibe
let format = "JSON"
let fields = ["name", "email", "age"]

// Context variables help the AI understand what you want
let schema: json = do "Create a schema with these fields in {format} format"
```
