---
title: Error Handling
description: Working with errors in Vibe programs
---

Vibe uses a unified value system where every value can carry an error. This allows errors to propagate through expressions without crashing your program.

## The VibeValue System

Every value in Vibe is wrapped in a `VibeValue` that contains:

- `value` - The actual data (or `null` if there's an error)
- `err` - Boolean flag (`true` if error, `false` if successful)
- `errDetails` - Error information (when `err` is `true`)
- `toolCalls` - Record of AI tool calls (for AI responses)

## Checking for Errors

Access the `.err` property to check if a value has an error. Since `.err` is a boolean, you can use it directly in conditions:

```vibe
let result = vibe "Do something that might fail"

if result.err {
  let message = result.errDetails.message
  // Handle the error
}
```

### Error Properties

When `.err` is `true`, use `.errDetails` to access error information:

- `message` - Human-readable error description
- `type` - Error class name (e.g., "TypeError", "ReferenceError")
- `location` - Source location where the error occurred (if available)

```vibe
if result.err {
  let errorType = result.errDetails.type      // "TypeError"
  let errorMsg = result.errDetails.message    // "Expected number, got text"
}
```

## Error Propagation

Errors automatically propagate through expressions. If any operand has an error, the result will also have that error:

```vibe
let a: number = vibe "Return a number"  // Might fail
let b = 10

// If 'a' has an error, 'sum' will have the same error
let sum = a + b

// Check at the end
if sum.err {
  // Handle error
}
```

This means you don't need to check every intermediate value—errors flow through naturally.

## AI Response Errors

AI calls can fail for various reasons:
- API errors (rate limits, authentication, network issues)
- Type validation failures (AI returned wrong type)

```vibe
let count: number = vibe "How many items?"

if count.err {
  // AI might have returned text instead of a number
  // Or the API call might have failed
  let fallback = 0
}
```

## Tool Call Records

When AI uses tools, the tool calls are recorded in the `.toolCalls` property for inspection. Tool execution errors are sent back to the AI model, which can retry or try a different approach—they don't automatically make the value have an error.

```vibe
let result = vibe "Search for information and summarize"

// Inspect tool calls that occurred
for call in result.toolCalls {
  if call.err {
    // This tool call failed, but AI received the error and continued
    let message = call.errDetails.message
  }
}
```

Each tool call record contains:
- `toolName` - Name of the tool
- `args` - Arguments passed to the tool
- `result` - Return value (if successful)
- `err` - Boolean indicating if this call failed
- `errDetails` - Error details when `err` is true (has `message` property)
- `duration` - Execution time in milliseconds

## Patterns

### Default Values

Provide a fallback when errors occur:

```vibe
let count: number = vibe "How many items?"

// Use default if error
let safeCount = count
if count.err {
  safeCount = 0
}
```

### Guard Clauses

Check for errors early and handle them:

```vibe
let data: json = vibe "Fetch the user data"

if data.err {
  // Log and exit early
  return null
}

// Continue with valid data
let name = data.name
```

### TypeScript Error Handling

Check errors in Vibe, then use TypeScript blocks for complex logic:

```vibe
let result = vibe "Risky operation"

if result.err {
  let msg = result.errDetails.message
  ts(msg) {
    console.error(`Operation failed: ${msg}`);
  }
} else {
  let data = result
  ts(data) {
    // Process the successful result
    console.log(`Got data: ${JSON.stringify(data)}`);
  }
}
```

Note: TypeScript blocks receive resolved values, not VibeValues. Check `.err` in Vibe code before passing values to ts blocks.

### Parallel Operation Errors

With `async let`, each parallel operation captures its own errors independently:

```vibe
async let user: json = fetchUser(userId)
async let posts: json[] = fetchPosts(userId)
async let notifications: json[] = getNotifications(userId)

// Each can succeed or fail independently
if user.err {
  print("Failed to load user")
}
if posts.err {
  print("Failed to load posts")
}
if notifications.err {
  print("Notifications unavailable")
}
```

## Best Practices

### Check Critical Operations

Always check errors for operations that must succeed:

```vibe
let config: json = vibe "Load configuration"

if config.err {
  // Can't continue without config
  return
}
```

### Let Non-Critical Errors Flow

For non-critical operations, let errors propagate and check at the end:

```vibe
let step1 = vibe "Step 1"
let step2 = vibe "Step 2 using {step1}"
let step3 = vibe "Step 3 using {step2}"

// Check only at the end
if step3.err {
  // Something failed along the way
}
```

### Provide Context in Error Messages

When logging errors, add context:

```vibe
let userData: json = vibe "Fetch user {userId}"

if userData.err {
  let msg = userData.errDetails.message
  ts(userId, msg) {
    console.error(`Failed to fetch user ${userId}: ${msg}`);
  }
}
```
