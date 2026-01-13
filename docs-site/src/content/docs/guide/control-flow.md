---
title: Control Flow
description: Conditionals and loops in Vibe
---

## If/Else

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
  print("negative")
} else if x == 0 {
  print("zero")
} else {
  print("positive")
}
```

:::note
Conditions must be boolean expressions. There's no truthy/falsy coercion—you must explicitly compare values.
:::

```vibe
let count = 5

// This works
if count > 0 {
  print("has items")
}

// This does NOT work
// if count { ... }  // Error: condition must be boolean
```

## For-In Loop

Iterate over arrays:

```vibe
let items = ["apple", "banana", "cherry"]

for item in items {
  print(item)
}
```

Iterate over ranges:

```vibe
// 1 to 5 inclusive
for i in 1..5 {
  print(i)  // 1, 2, 3, 4, 5
}
```

### Loop Context Modifiers

Control how AI context is managed in loops. The modifier goes **after** the closing brace:

```vibe
// Default: keep full history
for item in items {
  do "Process {item}"
}

// Forget: clear AI context each iteration
for item in items {
  do "Process {item}"
} forget

// Compress: summarize context to save tokens
for item in items {
  do "Process {item}"
} compress

// Verbose: explicitly keep full history (default)
for item in items {
  do "Process {item}"
} verbose
```

See [Context Management](/docs/ai/context/) for more details.

## While Loop

```vibe
let count = 0

while count < 10 {
  print(count)
  count = count + 1
}
```

:::note
The condition must be a boolean expression.
:::

## Break and Continue

Currently, Vibe does not support `break` or `continue` statements. Use conditionals within loops instead:

```vibe
for item in items {
  if shouldProcess(item) {
    // process item
  }
}
```

## Combining with AI

Loops are powerful when combined with AI expressions:

```vibe
let topics = ["AI", "Climate", "Space"]
let summaries: text[] = []

for topic in topics {
  let summary = do "Write a one-sentence summary about {topic}"
  summaries.push(summary)
}
```

Use `forget` when processing many items to avoid context overflow:

```vibe
for article in articles {
  let analysis = do "Analyze this article: {article}"
  results.push(analysis)
} forget
```
