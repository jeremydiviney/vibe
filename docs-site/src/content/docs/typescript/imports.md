---
title: Importing Modules
description: Using TypeScript and npm packages in Vibe
---

Vibe can import from TypeScript files and npm packages directly.

## Importing from TypeScript Files

```vibe
import { formatDate, parseConfig } from "./helpers.ts"
import { sendEmail } from "./services/email.ts"

let formatted = formatDate("2025-01-15")
```

## Importing npm Packages

### Node.js Built-ins

```vibe
import { readFileSync, writeFileSync } from "fs"
import { join, resolve } from "path"
import { exec } from "child_process"

let content = readFileSync("data.txt", "utf-8")
let fullPath = join(process.cwd(), "output")
```

### Third-Party Packages

```vibe
// After: npm install lodash
import { groupBy, sortBy } from "lodash"

let grouped = groupBy(items, "category")
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

## Re-exporting

```vibe
// utils.vibe
export { formatDate } from "./date-utils.ts"
export { validateEmail } from "./validators.ts"

// main.vibe
import { formatDate, validateEmail } from "./utils.vibe"
```

## Example: Full Integration

```vibe
// Import npm packages
import { marked } from "marked"
import { Octokit } from "@octokit/rest"

// Import local TypeScript
import { processMarkdown } from "./markdown-utils.ts"

// Import system utilities
import { env, print } from "system"
import { readFile, writeFile } from "system/tools"

// Configure model with tools
model assistant = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY"),
  tools: [readFile, writeFile]
}

// Use everything together
let readme = readFile("README.md")
let html = ts(readme) {
  return marked.parse(readme);
}
let summary = do "Summarize this documentation: {readme}"
print(summary)
```

## Package Installation

Before importing npm packages, install them:

```bash
# Using npm
npm install lodash marked

# Using bun
bun add lodash marked
```

Then import in your `.vibe` file:

```vibe
import { marked } from "marked"
import { groupBy } from "lodash"
```
