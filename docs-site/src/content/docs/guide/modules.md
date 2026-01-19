---
title: Modules
description: Importing and exporting code in Vibe
---

## Importing from Vibe Files

Import functions, constants, and models from other `.vibe` files:

```vibe
import { greet, helper } from "./utils.vibe"
import { sharedModel } from "./config.vibe"

let message = greet("World")
```

## Importing from TypeScript

Import directly from TypeScript files:

```vibe
import { formatDate, parseConfig } from "./helpers.ts"

let formatted = formatDate("2025-01-15")
```

## System Imports

Vibe provides built-in system utilities:

```vibe
import { env } from "system"

let apiKey = env("ANTHROPIC_API_KEY")
```

## Exporting

### Export Functions

```vibe
export function greet(name: text): text {
  return "Hello, " + name
}
```

### Export Constants

```vibe
export const VERSION = "1.0.0"
export const MAX_RETRIES = 3
```

### Export Models

```vibe
export model sharedAssistant = {
  name: "claude-sonnet-4-20250514",
  apiKey: env("ANTHROPIC_API_KEY"),
  provider: "anthropic"
}
```

## File Organization

A typical project structure:

```
my-project/
├── main.vibe          # Entry point
├── config.vibe        # Shared models and constants
├── utils.vibe         # Helper functions
├── tools/
│   ├── web.vibe       # Web-related tools
│   └── files.vibe     # File tools
└── .env               # API keys
```

Example `config.vibe`:

```vibe
import { env } from "system"

export model claude = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY")
}

export model gpt = {
  name: "gpt-5.2",
  provider: "openai",
  apiKey: env("OPENAI_API_KEY")
}
```

Example `main.vibe`:

```vibe
import { claude } from "./config.vibe"
import { summarize } from "./utils.vibe"

let content = "..."
let summary = summarize(content)
print(summary)
```
