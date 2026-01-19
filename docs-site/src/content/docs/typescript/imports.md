---
title: Importing Modules
description: Using TypeScript files and modules in Vibe
---

Vibe can import from TypeScript files, Vibe modules, and system utilities.

## Importing from TypeScript Files

```vibe
import { formatDate, parseConfig } from "./helpers.ts"
import { sendEmail } from "./services/email.ts"

let formatted = formatDate("2025-01-15")
```

### Type Checking

Vibe extracts function signatures from TypeScript files and validates calls at compile time:

```typescript
// helpers.ts
export function add(a: number, b: number): number {
  return a + b;
}
```

```vibe
import { add } from "./helpers.ts"

// Valid - correct types
let result = add(1, 2)

// Error at compile time - expected number, got text
let x: text = "hello"
add(x, 2)  // Error: Argument 1 of 'add': expected number, got text

// Error - wrong number of arguments
add(1)     // Error: Function 'add' requires 2 arguments, got 1
```

Return types are also inferred:

```vibe
import { add } from "./helpers.ts"

let result = add(1, 2)     // Inferred as number
let bad: text = add(1, 2)  // Error: cannot assign number to text
```

## System Imports

Vibe provides built-in utilities:

```vibe
import { env } from "system"

let apiKey = env("ANTHROPIC_API_KEY")
let port = env("PORT", "3000")  // With default
```

### Available System Functions

| Function | Description |
|----------|-------------|
| `env(name, default?)` | Get environment variable |
| `print(message)` | Print to console |
| `uuid()` | Generate UUID v4 |
| `now()` | Current timestamp (ms) |
| `sleep(ms)` | Pause execution |
| `jsonParse(text)` | Parse JSON string |
| `jsonStringify(value, pretty?)` | Convert to JSON string |
| `random()` | Random number 0-1 |
| `random(min, max)` | Random integer in range |

## System Tools

For AI tool use:

```vibe
import { readFile, writeFile, bash, glob, grep } from "system/tools"

model agent = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY"),
  tools: [readFile, writeFile, bash]
}
```

See [Tools](/docs/ai/tools/) for the full list.

## Importing Vibe Files

```vibe
import { helperFunction } from "./utils.vibe"
import { sharedModel } from "./config.vibe"

let result = helperFunction("input")
let response = do "Hello" sharedModel
```

## Named vs Default Imports

Vibe uses named imports:

```vibe
// Named import (supported)
import { functionName } from "./module.ts"

// Default import (not supported)
// import module from "./module.ts"
```

