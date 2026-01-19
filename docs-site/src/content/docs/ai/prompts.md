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

Prompts support two interpolation modes:

**Reference syntax `{var}`** — Points the AI to a variable in context without duplicating its value:

```vibe
let article = "... a very long article ..."

// AI sees: "Summarize {article}" + context showing article's value
// The article text is NOT duplicated in the prompt itself
const summary = do "Summarize {article}"
```

This is the preferred approach because it:
- Directs the model's attention to the correct variable in context
- Avoids duplicating text in the prompt, reducing token usage
- Keeps prompts readable

**Expansion syntax `!{var}`** — Inlines the value directly into the prompt text:

```vibe
let name = "Alice"

// AI sees: "Hello Alice" — value is embedded in the prompt
const greeting = do "Hello !{name}"
```

Use `!{var}` when you need the literal value in the prompt text itself, such as for short values or when building dynamic prompt structures.

:::note
This is different from regular strings, where `{var}` always expands to the value. The `!{var}` syntax is only valid in prompts.
:::

### Escaping

Use backslash to include literal braces in strings:

```vibe
let msg = "Use \{braces\} for references"  // "Use {braces} for references"
let json = "Format: \{ \"key\": \"value\" \}"
```

In prompts, you can also escape the expansion syntax:

```vibe
let instruction = do "Explain the \!{var} syntax in Vibe"
```

Other escape sequences:
- `\\` — literal backslash
- `\{` — literal `{`
- `\}` — literal `}`
- `\!{` — literal `!{` (in prompts)

### Specifying a Model

By default, `do` uses the first model declared. Specify a different model:

```vibe
model fast = { name: "claude-haiku-4-5-20251001", provider: "anthropic", apiKey: env("ANTHROPIC_API_KEY") }
model smart = { name: "claude-opus-4-5-20251101", provider: "anthropic", apiKey: env("ANTHROPIC_API_KEY") }

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
