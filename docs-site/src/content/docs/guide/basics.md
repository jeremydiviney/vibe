---
title: Basic Syntax
description: Variables, literals, and operators in Vibe
---

## Variables

Vibe has two ways to declare variables: `let` for mutable values and `const` for immutable values.

### Let (Mutable)

```vibe
let count = 0
let name: text = "Alice"
count = count + 1  // OK - can reassign
```

### Const (Immutable)

```vibe
const API_KEY = "sk-..."
const MAX_RETRIES: number = 3
// API_KEY = "new"  // Error - cannot reassign const
```

### Private Variables

Mark variables as `private` to exclude them from AI context:

```vibe
private let apiSecret = "sensitive-data"
let publicInfo = "This is visible to AI"

// When AI processes prompts, it won't see apiSecret
do "Summarize the available data"
```

## Literals

### Strings

Use double quotes, single quotes, or backticks:

```vibe
let s1 = "double quoted"
let s2 = 'single quoted'
let s3 = `template with ${variable} interpolation`
```

Template literals use `${expression}` for interpolation (JavaScript style).

:::note
AI prompts use a different syntax: `{variable}` without the `$`. See [AI Prompts](/docs/ai/prompts/).
:::

### Numbers

```vibe
let integer = 42
let negative = -10
let decimal = 3.14
```

### Booleans

```vibe
let yes = true
let no = false
```

### Null

```vibe
let empty = null
let maybe: text = null  // Typed null
```

### Arrays

```vibe
let empty: text[] = []
let numbers = [1, 2, 3]
let names = ["Alice", "Bob", "Carol"]
```

### Objects

```vibe
let person = { name: "Alice", age: 30 }
let config = { timeout: 5000, retries: 3 }
```

## Operators

### Arithmetic

| Operator | Description |
|----------|-------------|
| `+` | Addition / string concatenation |
| `-` | Subtraction |
| `*` | Multiplication |
| `/` | Division |
| `%` | Modulo |

```vibe
let sum = 10 + 5      // 15
let greeting = "Hello, " + name  // String concatenation
```

### Comparison

| Operator | Description |
|----------|-------------|
| `==` | Equal |
| `!=` | Not equal |
| `<` | Less than |
| `>` | Greater than |
| `<=` | Less than or equal |
| `>=` | Greater than or equal |

### Logical

| Operator | Description |
|----------|-------------|
| `and` | Logical AND |
| `or` | Logical OR |
| `not` | Logical NOT (unary) |

```vibe
if x > 0 and x < 100 {
  print("In range")
}

if not isValid {
  print("Invalid")
}
```

## Member Access

### Object Properties

```vibe
let person = { name: "Alice", age: 30 }
let name = person.name  // "Alice"
```

### Array Indexing

```vibe
let items = ["a", "b", "c"]
let first = items[0]   // "a"
let last = items[2]    // "c"
```

### Array Slicing

```vibe
let items = [1, 2, 3, 4, 5]
let slice = items[1:3]    // [2, 3]
let fromStart = items[:2] // [1, 2]
let toEnd = items[3:]     // [4, 5]
```

## Comments

```vibe
// Single-line comment
let x = 42  // Inline comment

/* Multi-line
   block comment */
```
