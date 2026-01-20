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
let s3 = `template with {variable} interpolation`
```

Backticks support multi-line strings:

```vibe
let poem = `Roses are red,
Violets are blue,
Vibe is great,
And so are you.`
```

All string types support `{variable}` interpolation:

```vibe
let name = "Alice"
let greeting = "Hello {name}!"  // "Hello Alice!"
```

:::note
In AI prompts, `{var}` behaves differently—it's kept as a reference rather than expanded. To expand values in prompts, use&nbsp;`!{var}`. See [AI Prompts](/docs/ai/prompts/).
:::

Use backslash to escape braces:

```vibe
let literal = "Use \{braces\} literally"  // "Use {braces} literally"
let path = "C:\\Users\\name"              // "C:\Users\name"
```

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
let maybe: text = null  // Type annotation required
let data: json = null   // OK - type is explicit
// let empty = null     // Error: cannot infer type from null
```

### Arrays

```vibe
let empty: text[] = []
let numbers = [1, 2, 3]
let names = ["Alice", "Bob", "Carol"]
```

Use `+` to concatenate arrays:

```vibe
let a = [1, 2]
let b = [3, 4]
let combined = a + b  // [1, 2, 3, 4]
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
| `+` | Addition / string / array concatenation |
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
let items = ["a", "b", "c", "d", "e"]
let first = items[0]    // "a"
let third = items[2]    // "c"

// Negative indices count from the end
let last = items[-1]    // "e"
let secondLast = items[-2]  // "d"
```

### Array Slicing

Python-style slicing with `[start:end]` syntax:

```vibe
let items = [1, 2, 3, 4, 5]
let slice = items[1:3]    // [2, 3]
let fromStart = items[:2] // [1, 2]
let toEnd = items[3:]     // [4, 5]

// Negative indices in slices
let allButLast = items[:-1]   // [1, 2, 3, 4]
let lastTwo = items[-2:]      // [4, 5]
let middle = items[1:-1]      // [2, 3, 4]
```

## Comments

```vibe
// Single-line comment
let x = 42  // Inline comment

/* Multi-line
   block comment */
```
