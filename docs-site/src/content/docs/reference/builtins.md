---
title: Built-in Functions
description: Standard library functions and tools
---

## Core Functions

These functions are always available without any import:

```vibe
// No import needed - available everywhere
print("Hello, World!")
let apiKey = env("ANTHROPIC_API_KEY")
```

### print

Print to console:

```vibe
print("Hello, World!")
print(someVariable)
print({ key: "value" })
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | any | Value to print |

### env

Get environment variable:

```vibe
let apiKey = env("ANTHROPIC_API_KEY")
let port = env("PORT", "3000")  // With default value
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | text | Environment variable name |
| `defaultValue` | text? | Default if not set |
| **Returns** | text | Variable value |

### args

Access CLI arguments passed after the `.vibe` filename:

```vibe
let all = args()            // All args as text[]
let first = args(0)         // Arg at index (or null)
let name = args("name")    // Value of --name flag (or null)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| *(none)* | | Returns all args as array |
| `index` | number | Returns arg at index (or `null`) |
| `name` | text | Returns value of `--name` flag (or `null`) |
| **Returns** | text[] / text / null | Depends on argument |

Named flags return `""` (empty string) for boolean-style flags like `--dry-run`. Returns `null` when the flag is not present.

### hasArg

Check if a CLI flag is present:

```vibe
if hasArg("verbose") {
  print("Verbose mode enabled")
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | text | Flag name without dashes |
| **Returns** | boolean | Whether flag is present |

---

## Utility Functions

Import from `"system/utils"`:

```vibe
import { uuid, now, random, jsonParse, jsonStringify } from "system/utils"
```

### uuid

Generate UUID v4:

```vibe
let id = uuid()  // "550e8400-e29b-41d4-a716-446655440000"
```

| **Returns** | text | UUID string |

### now

Current timestamp in milliseconds:

```vibe
let timestamp = now()  // 1705123456789
```

| **Returns** | number | Unix timestamp (ms) |

### random

Generate random number:

```vibe
let r = random()        // 0.0 to 1.0
let n = random(1, 10)   // 1 to 10 (integer)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `min` | number? | Minimum (inclusive) |
| `max` | number? | Maximum (inclusive) |
| **Returns** | number | Random number |

### jsonParse

Parse JSON string:

```vibe
let data = jsonParse('{"name": "Alice"}')
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | text | JSON string |
| **Returns** | json | Parsed object |

### jsonStringify

Convert to JSON string:

```vibe
let str = jsonStringify({ name: "Alice" })
let pretty = jsonStringify({ name: "Alice" }, true)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | json | Value to stringify |
| `pretty` | boolean? | Pretty print (default: false) |
| **Returns** | text | JSON string |

---

## System Tools

Import from `"system/tools"` for AI tool use:

```vibe
import { readFile, writeFile, bash } from "system/tools"

model agent = {
  tools: [readFile, writeFile, bash]
}
```

### readFile

Read file contents:

```vibe
let content = readFile("data.txt")
let lines = readFile("data.txt", 1, 10)  // Lines 1-10
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | text | File path |
| `startLine` | number? | Starting line (1-indexed) |
| `endLine` | number? | Ending line |
| **Returns** | text | File contents |

### writeFile

Write to file:

```vibe
writeFile("output.txt", "Hello, World!")
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | text | File path |
| `content` | text | Content to write |
| **Returns** | boolean | Success |

### appendFile

Append to file:

```vibe
appendFile("log.txt", "New entry\n")
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | text | File path |
| `content` | text | Content to append |
| **Returns** | boolean | Success |

### fileExists

Check if file exists:

```vibe
if fileExists("config.json") {
  // ...
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | text | File path |
| **Returns** | boolean | Exists |

### listDir

List directory contents:

```vibe
let files = listDir("./src")
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | text | Directory path |
| **Returns** | text[] | File/folder names |

### edit

Edit specific lines in file:

```vibe
edit("file.txt", 5, 10, "new content")
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | text | File path |
| `startLine` | number | Start line (1-indexed) |
| `endLine` | number | End line |
| `newText` | text | Replacement text |
| **Returns** | text | Updated content |

### glob

Find files by pattern:

```vibe
let tsFiles = glob("**/*.ts")
let srcFiles = glob("*.js", "./src")
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | text | Glob pattern |
| `cwd` | text? | Working directory |
| **Returns** | text[] | Matching paths |

### grep

Search file contents:

```vibe
let matches = grep("TODO", "./src", true)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | text | Search pattern |
| `path` | text | File/directory |
| `ignoreCase` | boolean? | Case insensitive |
| **Returns** | json[] | Matches with line info |

### mkdir

Create directory:

```vibe
mkdir("./output")
mkdir("./a/b/c", true)  // Recursive
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | text | Directory path |
| `recursive` | boolean? | Create parents |
| **Returns** | boolean | Success |

### dirExists

Check if directory exists:

```vibe
if dirExists("./output") {
  // ...
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | text | Directory path |
| **Returns** | boolean | Exists |

### bash

Execute shell command:

```vibe
let result = bash("npm run build")
let result = bash("ls -la", "./src")
let result = bash("slow-command", ".", 60000)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `command` | text | Shell command |
| `cwd` | text? | Working directory |
| `timeout` | number? | Timeout (ms) |
| **Returns** | json | `{ stdout, stderr, exitCode }` |

### runCode

Run code snippet:

```vibe
let result = runCode("python", "print('Hello')")
let result = runCode("javascript", "console.log(1+1)")
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `language` | text | Language name |
| `code` | text | Code to run |
| **Returns** | json | Execution result |

---

## Array Methods

### push

Add element to array (mutates array, returns array for chaining):

```vibe
let items: text[] = []
items.push("first")
items.push("second")

// Chaining
let arr = [].push(1).push(2).push(3)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `element` | any | Element to add |
| **Returns** | array | The array (for chaining) |

### pop

Remove and return last element:

```vibe
let items = [1, 2, 3]
let last = items.pop()  // 3
// items is now [1, 2]
```

| **Returns** | any | The removed element |

### len

Get length of array or string:

```vibe
let arr = [1, 2, 3, 4, 5]
let count = arr.len()  // 5

let str = "hello"
let length = str.len()  // 5
```

| **Returns** | number | Length |
