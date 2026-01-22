---
title: Types Reference
description: Complete type reference for Vibe
---

## Primitive Types

| Type | Description | Examples |
|------|-------------|----------|
| `text` | String value | `"hello"`, `'world'` |
| `number` | Numeric value | `42`, `-3.14` |
| `boolean` | Boolean value | `true`, `false` |
| `json` | Object or array | `{ key: "value" }` |
| `prompt` | Prompt string | Same as text |
| `null` | Null value | `null` |

## Special Types

| Type | Description |
|------|-------------|
| `model` | AI model configuration (always immutable) |

## Named Structural Types

Define custom types with the `type` keyword:

```vibe
type Result {
  valid: boolean
  message: text
  count: number
}
```

### Type Declaration Syntax

```vibe
type TypeName {
  fieldName: fieldType
  // ... more fields
}
```

Fields can be separated by commas, newlines, or both:

```vibe
// Comma-separated
type Point { x: number, y: number }

// Newline-separated
type Config {
  timeout: number
  retries: number
}

// Mixed
type Mixed { a: text, b: number
  c: boolean
}
```

### Nested Types

Reference other types or use inline nested objects:

```vibe
type Inner { value: number }

type Outer {
  inner: Inner           // Reference named type
  metadata: {            // Inline nested object
    timestamp: number
    source: text
  }
}
```

### Arrays of Structural Types

```vibe
type Player { name: text, score: number }
type Team { players: Player[] }

let team: Team = do "Create a team with 3 players" model
```

### Type Usage

Use named types in:

```vibe
// Variable declarations
let result: Result = do "Validate input" model

// Function parameters
function process(data: Result): text {
  return data.message
}

// Function return types
function check(): Result {
  return { valid: true, message: "OK", count: 1 }
}

// Arrays
let results: Result[] = []
```

### Member Access Type Resolution

Accessing fields on typed variables returns the field's type:

```vibe
type Status { active: boolean, count: number }
let s: Status = do "Get status" model

// s.active is boolean (can use in if conditions)
if s.active {
  print("Active")
}

// s.count is number
let doubled = s.count * 2
```

## Array Types

Append `[]` to any type:

| Type | Description |
|------|-------------|
| `text[]` | Array of strings |
| `number[]` | Array of numbers |
| `boolean[]` | Array of booleans |
| `json[]` | Array of objects |

### Nested Arrays

```vibe
let matrix: number[][] = [[1, 2], [3, 4]]
let nested: text[][][] = [[["a", "b"]], [["c"]]]
```

## Type Annotations

### Variable Declarations

```vibe
let name: text = "Alice"
let age: number = 30
let active: boolean = true
let config: json = { timeout: 5000 }
let items: text[] = ["a", "b", "c"]
```

### Function Parameters

```vibe
function greet(name: text, times: number): text {
  // ...
}
```

### Return Types

```vibe
function getItems(): text[] {
  return ["a", "b", "c"]
}

function getConfig(): json {
  return { key: "value" }
}
```

## Type Inference

Types are inferred when not specified:

```vibe
let name = "Alice"      // text
let count = 42          // number
let active = true       // boolean
let items = [1, 2, 3]   // number[]
let config = { a: 1 }   // json
```

## AI Return Types

Specify return type for AI expressions:

```vibe
// Without type - returns text
let result = do "How many?"

// With type - returns parsed value
let count: number = do "How many planets?"
let valid: boolean = do "Is this correct?"
let items: text[] = do "List 5 items"
let data: json = do "Return structured data"
```

## Null Type

Variables can hold null:

```vibe
let maybe: text = null
let result = null
```

:::caution
`null` cannot be assigned to `boolean` type when used in conditions.
:::

## Type Compatibility

### Text and Prompt

`text` and `prompt` are interchangeable:

```vibe
let message: text = "Hello"
let prompt: prompt = message  // OK
```

### JSON Flexibility

`json` accepts objects and arrays:

```vibe
let obj: json = { name: "Alice" }
let arr: json = [1, 2, 3]
let nested: json = { items: [1, 2, 3] }
```

## Model Type

Models are always `const`:

```vibe
model myModel = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("API_KEY")
}

// Cannot reassign
// myModel = { ... }  // Error
```

## Type Coercion

Vibe does not perform automatic type coercion:

```vibe
let num = 42
let str = "The answer is: "

// Must explicitly convert
let message = str + num  // Error: cannot add text and number

// Use ts block for conversion
let message = ts(str, num) {
  return str + num.toString();
}
```

## Type Checking in Conditions

Conditions must be boolean:

```vibe
let count = 5

// This works
if count > 0 { }
if count == 0 { }

// This does NOT work
// if count { }  // Error: condition must be boolean
// if "string" { }  // Error
```
