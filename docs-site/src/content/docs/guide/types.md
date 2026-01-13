---
title: Types
description: Vibe's type system
---

Vibe has a simple but powerful type system designed for AI interactions.

## Base Types

| Type | Description | Example |
|------|-------------|---------|
| `text` | String values | `"hello"`, `'world'` |
| `number` | Numeric values (integers and decimals) | `42`, `-3.14` |
| `boolean` | Boolean values | `true`, `false` |
| `json` | Objects and arrays | `{ key: "value" }`, `[1, 2, 3]` |
| `prompt` | Prompt strings (compatible with text) | Same as text |
| `model` | AI model configuration (immutable) | Model declarations |

## Type Annotations

You can optionally annotate variables with types:

```vibe
let name: text = "Alice"
let age: number = 30
let active: boolean = true
let config: json = { timeout: 5000 }
```

## Array Types

Append `[]` to any base type for arrays:

```vibe
let names: text[] = ["Alice", "Bob"]
let scores: number[] = [95, 87, 92]
let flags: boolean[] = [true, false, true]
```

Arrays can be nested:

```vibe
let matrix: number[][] = [[1, 2], [3, 4]]
```

## Type Inference

Vibe can infer types from values:

```vibe
let name = "Alice"      // Inferred as text
let count = 42          // Inferred as number
let items = [1, 2, 3]   // Inferred as number[]
```

## AI Return Types

When using AI expressions, the return type determines how the response is parsed:

```vibe
// Returns a number
const count: number = do "How many continents are there?"

// Returns a boolean
const isPrime: boolean = do "Is 17 a prime number?"

// Returns an array of strings
const languages: text[] = do "List 5 programming languages"

// Returns a structured object
const person: json = do "Return a person with name and age fields"
```

The AI's response is automatically validated and converted to the specified type.

## Null Values

Variables can hold `null`:

```vibe
let maybeValue: text = null
let result = null
```

Note: `null` cannot be assigned to `boolean` variables in conditions.

## Model Type

The `model` type is special—it's always immutable and used for AI configuration:

```vibe
model assistant = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY")
}
```

See [Models](/docs/ai/models/) for more details.
