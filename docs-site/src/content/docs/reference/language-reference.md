---
title: Language Reference
description: Condensed Vibe language reference
---

A complete, condensed reference for the Vibe programming language.

## Variables

```vibe
let count = 0                    // Mutable
let name: text = "Alice"         // With type annotation
const MAX: number = 100          // Immutable
private let secret = "hidden"    // Hidden from AI context
let maybe: text = null           // Null requires type annotation
```

## Types

| Type | Description | Example |
|------|-------------|---------|
| `text` | String | `"hello"`, `'world'`, `` `template` `` |
| `number` | Numeric | `42`, `-3.14` |
| `boolean` | Boolean | `true`, `false` |
| `json` | Object/array | `{ key: "value" }`, `[1, 2]` |
| `null` | Null value | `null` |
| `text[]` | Array of type | `["a", "b"]` |
| `TypeName` | Named structural type | `let x: MyType` |

### Structural Types

```vibe
type Result {
  valid: boolean
  message: text
}

// Nested types
type Outer {
  inner: Inner           // Reference named type
  metadata: {            // Inline nested object
    timestamp: number
  }
}

// Arrays of types
type Team { players: Player[] }
```

## Strings & Interpolation

```vibe
let s1 = "double quotes"
let s2 = 'single quotes'
let s3 = `backticks for
multi-line strings`

// All support {var} interpolation
let greeting = "Hello {name}!"

// Escape braces with backslash
let literal = "Use \{braces\} literally"
```

## Operators

```vibe
// Arithmetic
a + b    a - b    a * b    a / b    a % b

// Comparison
a == b   a != b   a < b    a > b    a <= b   a >= b

// Logical (keywords, not symbols)
a and b    a or b    not a
```

## Arrays & Objects

```vibe
let arr = [1, 2, 3]
let first = arr[0]           // Index access
let last = arr[-1]           // Negative index
let slice = arr[1:3]         // Slice [2, 3]
let concat = [1, 2] + [3, 4] // [1, 2, 3, 4]

let obj = { name: "Alice", age: 30 }
let name = obj.name          // Member access

// Array methods
arr.push(4)                  // Add element (mutates, returns array)
let x = arr.pop()            // Remove and return last
let n = arr.len()            // Length
```

## Control Flow

```vibe
// If/else (conditions must be boolean)
if count > 0 {
  print("positive")
} else if count == 0 {
  print("zero")
} else {
  print("negative")
}

// For-in loop
for item in items {
  print(item)
}

// Range loop
for i in 1..5 {
  print(i)  // 1, 2, 3, 4, 5
}

// While loop
while count < 10 {
  count = count + 1
}

// Break exits innermost loop
for i in items {
  if i == target {
    break
  }
}
```

### Loop Context Modifiers

```vibe
for item in items { ... } forget    // Clear AI context each iteration
for item in items { ... } compress  // Summarize context
for item in items { ... } verbose   // Keep full history (default)
```

## Functions

```vibe
function greet(name: text): text {
  return "Hello, " + name
}

function add(a: number, b: number): number {
  return a + b
}

// Export for use in other files
export function helper(x: text): text {
  return x
}
```

## AI Expressions

### do - Single AI call

```vibe
let answer = do "Explain quantum computing"

// With type annotation (AI returns parsed value)
let count: number = do "How many planets?"
let items: text[] = do "List 5 programming languages"
let data: json = do "Return a person object"

// With specific model
let result = do "Complex analysis" smartModel

// With context mode
let result = do "Summarize" model default  // Full history
let result = do "Process" model local      // Current scope only
```

### vibe - Agentic AI with tools

```vibe
model agent = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY"),
  tools: [readFile, writeFile, bash]
}

vibe "Read the config and update the version" agent
```

### Prompt Interpolation

```vibe
let article = "long text..."

// Reference syntax: AI sees variable in context (preferred)
do "Summarize {article}"

// Expansion syntax: Value inlined into prompt text
do "Hello !{name}"
```

## Models

```vibe
model myModel = {
  name: "claude-sonnet-4-20250514",   // Required
  provider: "anthropic",              // Required: anthropic, openai, google
  apiKey: env("ANTHROPIC_API_KEY"),   // Required
  url: "http://custom/v1",            // Optional: custom endpoint
  maxRetriesOnError: 3,               // Optional: auto-retry
  thinkingLevel: "high",              // Optional: none, low, medium, high, max
  tools: [tool1, tool2]               // Optional: available tools
}
```

## Tools

```vibe
tool fetchUrl(url: text): text
  @description "Fetch content from a URL"
  @param url "The URL to fetch"
{
  ts(url) {
    const response = await fetch(url);
    return await response.text();
  }
}
```

## TypeScript Blocks

```vibe
// Pass Vibe variables as parameters (values are automatically resolved)
let result = ts(x, y) {
  return x + y;
}

// Named bindings with expressions (member, index, slice)
let items = [10, 20, 30, 40]
let first = ts(x=items[0]) { return x * 2; }
let last = ts(x=items[-1]) { return x + 1; }
let sub = ts(arr=items[1:3]) { return arr.length; }

// Complex operations
let parsed = ts(jsonString) {
  return JSON.parse(jsonString);
}

// Async operations
let data = ts() {
  const response = await fetch('https://api.example.com');
  return await response.json();
}

// Dynamic imports
let files = ts() {
  const { readdirSync } = await import('fs');
  return readdirSync('.');
}
```

## Async Execution

```vibe
// Parallel AI calls
async let a = do "Task A"
async let b = do "Task B"
async let c = do "Task C"
// All run concurrently, auto-awaited when used
let combined = process(a, b, c)

// Fire-and-forget
async do "Log event" logger
async vibe "Background task" agent
```

## Error Handling

Every value can carry error information:

```vibe
let result = do "Risky operation"

// Check for errors (err is boolean)
if result.err {
  let msg = result.errDetails.message
  let type = result.errDetails.type
  print("Error: " + msg)
}

// Errors propagate through expressions
let a: number = null
let b = 10
let sum = a + b       // sum.err is true
let doubled = sum * 2 // doubled.err is true (propagated)
```

## Imports

```vibe
// TypeScript files
import { helper } from "./utils.ts"

// Vibe files
import { myFunction, myModel } from "./lib.vibe"

// Utility functions
import { uuid, now, random, jsonParse, jsonStringify } from "system/utils"

// AI tools
import { readFile, writeFile, bash, glob, grep } from "system/tools"
```

## Core Functions

Always available without import:

| Function | Description |
|----------|-------------|
| `env(name, default?)` | Get environment variable |
| `print(message)` | Print to console |

## Utility Functions

Import from `"system/utils"`:

| Function | Description |
|----------|-------------|
| `uuid()` | Generate UUID v4 |
| `now()` | Current timestamp (ms) |
| `random()` / `random(min, max)` | Random number |
| `jsonParse(text)` | Parse JSON string |
| `jsonStringify(value, pretty?)` | Convert to JSON |

## System Tools

| Tool | Description |
|------|-------------|
| `readFile(path, start?, end?)` | Read file contents |
| `writeFile(path, content)` | Write to file |
| `appendFile(path, content)` | Append to file |
| `fileExists(path)` | Check file exists |
| `listDir(path)` | List directory |
| `edit(path, start, end, text)` | Edit file lines |
| `glob(pattern, cwd?)` | Find files |
| `grep(pattern, path, ignoreCase?)` | Search contents |
| `mkdir(path, recursive?)` | Create directory |
| `dirExists(path)` | Check directory exists |
| `bash(cmd, cwd?, timeout?)` | Run shell command |

## Destructuring

```vibe
// From AI response
let { title: text, body: text } = do "Generate article"

// With private fields
let { private apiKey: text, name: text } = do "Get credentials"

// Async destructuring
async let { x: number, y: number } = do "Get coordinates"
```

## Comments

```vibe
// Single-line comment
let x = 42  // Inline comment

/* Multi-line
   block comment */
```

## Operator Precedence

1. Assignment (`=`)
2. Logical OR (`or`)
3. Logical AND (`and`)
4. Equality (`==`, `!=`)
5. Comparison (`<`, `>`, `<=`, `>=`)
6. Addition (`+`, `-`)
7. Multiplication (`*`, `/`, `%`)
8. Unary (`not`, `-`)
9. Range (`..`)
10. Postfix (`.`, `[]`, `()`)
