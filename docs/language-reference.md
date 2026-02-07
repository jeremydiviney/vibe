# Vibe Language Reference

Vibe is a domain-specific language for AI agent orchestration with a TypeScript runtime.

## Types

Vibe has six base types:

| Type | Description | Example |
|------|-------------|---------|
| `text` | String values | `"hello"`, `'world'` |
| `number` | Numeric values (integers and decimals) | `42`, `-3.14` |
| `boolean` | Boolean values | `true`, `false` |
| `json` | Objects and arrays | `{ key: "value" }`, `[1, 2, 3]` |
| `prompt` | Prompt strings (compatible with text) | Same as text |
| `model` | AI model configuration (immutable) | Model declarations |

### Array Types

Append `[]` to any base type for arrays. Can be nested:

```vibe
let names: text[] = ["Alice", "Bob"]
let matrix: number[][] = [[1, 2], [3, 4]]
```

## Variables

### Let (mutable)

```vibe
let count = 0
let name: text = "Alice"
count = count + 1
```

### Const (immutable)

```vibe
const API_KEY = "sk-..."
const MAX_RETRIES: number = 3
```

**Note:** Variables with type `model` must always be `const`.

## Literals

### Strings

Double quotes, single quotes, or backticks for templates:

```vibe
let s1 = "double quoted"
let s2 = 'single quoted'
let s3 = `template with {variable} interpolation`
```

All string types support `{variable}` interpolation (not `${}`). Currently, only variables and property access are supported inside `{}` — not expressions.

```vibe
let name = "world"
let user = { first: "John", last: "Doe" }

// These work:
print("Hello {name}")           // variable
print("Hi {user.first}")        // property access
print("{items[0]}")             // array indexing

// These do NOT work (use a temporary variable instead):
print("{count + 1}")            // expression - won't interpolate
print("{arr.len()}")            // method call - won't interpolate

// Workaround for expressions:
let next = count + 1
print("Next: {next}")
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

### Arrays

```vibe
let empty: text[] = []
let numbers = [1, 2, 3]
let mixed = ["a", "b", "c"]
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
  // ...
}

if not isValid {
  // ...
}
```

## Control Flow

### If/Else

```vibe
if condition {
  // then branch
}

if condition {
  // then
} else {
  // else
}

if x < 0 {
  // negative
} else if x == 0 {
  // zero
} else {
  // positive
}
```

**Note:** Conditions must be boolean expressions. No truthy/falsy coercion.

### For-In Loop

Iterate over arrays or ranges:

```vibe
// Array iteration
for item in items {
  // use item
}

// Range iteration (1 to 5 inclusive)
for i in 1..5 {
  // i = 1, 2, 3, 4, 5
}
```

### While Loop

```vibe
while condition {
  // body
}
```

**Note:** Condition must be a boolean expression.

## Functions

Functions are declared at the top level only. All parameters require type annotations:

```vibe
function greet(name: text): text {
  return "Hello, " + name
}

function add(a: number, b: number): number {
  return a + b
}

// Calling functions
let message = greet("World")
let sum = add(1, 2)
```

## Model Declaration

Models configure AI providers. Models are always immutable:

```vibe
model myModel = {
  name: "gpt-4",
  apiKey: env("OPENAI_API_KEY"),
  provider: "openai"
}
```

### Required Fields

- `name` - Model name/identifier
- `apiKey` - API key for authentication

### Optional Fields

- `provider` - Provider type: `"openai"`, `"anthropic"`, `"google"`, `"openrouter"`. Determines API format and default URL.
- `url` - API endpoint URL override. If omitted, uses the provider's default URL.
- `maxRetriesOnError` - Number of retries on failure
- `thinkingLevel` - For models with extended thinking: `"low"`, `"medium"`, `"high"`
- `tools` - Array of tools available to this model

## AI Expressions

### Vibe Expression

Send a prompt to an AI model and get a response:

```vibe
let response = vibe "What is 2 + 2?" myModel default
let answer: number = vibe "Return just the number 42" myModel default
```

Syntax: `vibe <prompt> <model> <context>`

Context options:
- `default` - Full execution history
- `local` - Current scope only

## TypeScript Blocks

Embed TypeScript code for operations not available in Vibe:

```vibe
let result = ts(x, y) {
  return x * y + Math.sqrt(x);
}

let parsed = ts(jsonString) {
  return JSON.parse(jsonString);
}
```

Parameters are passed by name. The block returns the result of the last expression or explicit `return`.

## Tool Declaration

Define custom tools that AI models can call:

```vibe
tool getCurrentWeather(city: text): json
  @description "Get current weather for a city"
  @param city "The city name"
{
  ts(city) {
    // Implementation
    return { temp: 72, condition: "sunny" };
  }
}
```

Tool syntax:
- `tool <name>(<params>): <returnType>` - Tool signature
- `@description "..."` - Required description of what the tool does
- `@param <name> "..."` - Optional description for each parameter
- `{ ts(...) { ... } }` - Implementation body using a TypeScript block

Attach tools to a model:

```vibe
model assistant = {
  name: "gpt-4",
  apiKey: env("OPENAI_API_KEY"),
  url: "https://api.openai.com/v1",
  tools: [getCurrentWeather, myOtherTool]
}
```

## Context Modes

Control how AI context is managed in loops and functions. The keyword goes **after** the closing brace:

```vibe
// Default: keep full history (verbose)
for item in items {
  vibe "process {item}" myModel default
}

// Forget: clear history each iteration
for item in items {
  vibe "process {item}" myModel default
} forget

// Verbose: explicitly keep history (default behavior)
for item in items {
  vibe "process {item}" myModel default
} verbose
```

## Imports and Exports

### Importing

```vibe
// Import from another Vibe file
import { greet, helper } from "./utils.vibe"

// Import from TypeScript
import { formatDate, parseConfig } from "./helpers.ts"
```

### Exporting

```vibe
export function greet(name: text): text {
  return "Hello, " + name
}

export const VERSION = "1.0.0"

export model sharedModel = {
  name: "gpt-4",
  apiKey: env("API_KEY"),
  url: "https://api.openai.com/v1"
}
```

## Member Access and Indexing

### Object Properties

```vibe
let person = { name: "Alice", age: 30 }
let name = person.name
```

### Array Indexing

```vibe
let items = ["a", "b", "c"]
let first = items[0]
let last = items[2]
```

### Array Slicing

```vibe
let items = [1, 2, 3, 4, 5]
let slice = items[1:3]    // [2, 3]
let fromStart = items[:2] // [1, 2]
let toEnd = items[3:]     // [4, 5]
```

## Array Methods

Arrays support `.push()` for adding elements:

```vibe
let items: text[] = []
items.push("first")
items.push("second")
```

## CLI Arguments

### Raw Access

- `args()` - Returns all program arguments as a text array
- `args(n)` - Returns the argument at index n (text), or null
- `args("name")` - Returns the value of `--name` flag. If the arg was registered via `defineArg()`, returns a typed value (number or text). Warns if the arg is not registered.
- `hasArg("name")` - Returns true if `--name` flag is present. Warns if the arg is not registered.

### Defining Expected Arguments

Use `defineArg()` to define CLI arguments with types, descriptions, defaults, and automatic `--help` generation:

```vibe
const maxItems = defineArg("max-items", "number", "Max items per run", false, 20)
const filter = defineArg("filter", "text", "Optional filter")
const output = defineArg("output", "text", "Output directory", true)
```

Signature: `defineArg(name, type, description, required?, default?)`

- **name** - Flag name (used as `--name` on the command line)
- **type** - `"number"` or `"text"`
- **description** - Help text shown with `--help`
- **required** (optional) - `true` to require the arg, `false` or omitted for optional
- **default** (optional) - Default value if not provided

When `defineArg()` is used, `--help`/`-h` handling and unknown flag warnings happen automatically on the first `args()` or `hasArg()` call. Both `defineArg()` and `args("name")` return typed values matching the definition.

## Comments

Single-line comments only:

```vibe
// This is a comment
let x = 42  // Inline comment
```

## Reserved Keywords

The following are reserved and cannot be used as identifiers:

```
let, const, function, return, if, else, for, in, while,
do, vibe, model, tool, import, export, from,
true, false, and, or, not, default, local,
text, json, prompt, boolean, number, model,
forget, verbose, compress
```

## Complete Example

```vibe
// Import utilities
import { formatOutput } from "./utils.ts"

// Configure AI model with tools
model assistant = {
  name: "claude-sonnet-4-20250514",
  apiKey: env("ANTHROPIC_API_KEY"),
  url: "https://api.anthropic.com",
  provider: "anthropic",
  tools: [readFile, writeFile, glob]
}

// Define a helper function
function processItem(item: text): text {
  return vibe "Summarize this: {item}" assistant default
}

// Main logic
let files = glob("*.txt")
let summaries: text[] = []

for file in files {
  let content = readFile(file)
  let summary = processItem(content)
  summaries.push(summary)
}

// Final AI analysis
let report: json = vibe "Create a JSON report from these summaries: {summaries}" assistant default

// Output result
print(jsonStringify(report))
```
