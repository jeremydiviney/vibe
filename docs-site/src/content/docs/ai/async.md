---
title: Async Execution
description: Running AI calls in parallel with async
---

The `async` keyword enables parallel execution of AI calls and other operations.

## Basic Async

Run multiple AI calls concurrently:

```vibe
async let summary = do "Summarize this document"
async let keywords: text[] = do "Extract 5 keywords"
async let sentiment: text = do "What is the sentiment?"

// All three run concurrently
// They're automatically awaited when used
let report = do "Create a report using: {summary}, {keywords}, {sentiment}"
```

## How It Works

1. `async` declarations start executing immediately
2. Execution continues without waiting
3. Values are automatically awaited when accessed
4. Runtime waits for all async operations before completing

## Async Declarations

### Async Let

```vibe
async let result = do "Long running task"
// Continue immediately, result awaited when used
```

### Async Const

```vibe
async const data: json = do "Fetch data"
```

### Async with Types

```vibe
async let count: number = do "How many items?"
async let names: text[] = do "List the names"
```

### Async Destructuring

```vibe
async let { title: text, body: text } = do "Generate article"
```

## Async Statements

Fire-and-forget operations:

```vibe
// Log event without waiting
async do "Log: user clicked button" logger

// Background processing
async vibe "Process this data in the background" agent

// Async TypeScript
async ts() {
  await sendAnalytics(event);
}

// Async function call
async notifyUser(userId, message)
```

## Parallel Processing

### Multiple Independent Tasks

```vibe
async let translation_es = do "Translate to Spanish: {text}"
async let translation_fr = do "Translate to French: {text}"
async let translation_de = do "Translate to German: {text}"

// All three translations happen in parallel
let results = {
  spanish: translation_es,
  french: translation_fr,
  german: translation_de
}
```

### Batch Analysis

```vibe
// Start all analyses concurrently
async let sentiment = do "Analyze sentiment"
async let topics = do "Extract topics"
async let entities = do "Find named entities"
async let summary = do "Write summary"

// Combine results (auto-awaited)
let analysis = {
  sentiment: sentiment,
  topics: topics,
  entities: entities,
  summary: summary
}
```

## Async with Different Models

```vibe
model fast = { name: "claude-haiku-4.5", ... }
model smart = { name: "claude-opus-4.5", ... }

// Use fast model for simple tasks, smart for complex
async let quickCheck = do "Is this valid?" fast
async let deepAnalysis = do "Detailed analysis" smart

// Both run in parallel despite different models
```

## Async in Loops

```vibe
let urls = ["url1", "url2", "url3"]
let fetches: text[] = []

for url in urls {
  // Each iteration's fetch starts immediately
  async let content = fetch(url)
  fetches.push(content)
}

// All fetches complete before loop exits
```

## Best Practices

### Do Parallelize Independent Work

```vibe
// Good - independent tasks in parallel
async let a = do "Task A"
async let b = do "Task B"
async let c = do "Task C"
let combined = processResults(a, b, c)
```

### Don't Parallelize Dependent Work

```vibe
// Bad - B depends on A
async let a = do "Get data"
async let b = do "Process {a}"  // a might not be ready!

// Good - sequential for dependencies
let a = do "Get data"
let b = do "Process {a}"
```

### Use Async for I/O Operations

```vibe
// Good - parallel I/O
async let file1 = readFile("a.txt")
async let file2 = readFile("b.txt")
async let file3 = readFile("c.txt")
```

### Fire-and-Forget for Logging

```vibe
// Log without blocking main execution
async do "Log event: {event}" logger
// Continue immediately
processNextItem()
```

## Comparison with Sequential

### Sequential (Slow)

```vibe
let a = do "Task A"  // Wait...
let b = do "Task B"  // Wait...
let c = do "Task C"  // Wait...
// Total time: A + B + C
```

### Parallel (Fast)

```vibe
async let a = do "Task A"  // Start
async let b = do "Task B"  // Start
async let c = do "Task C"  // Start
// Total time: max(A, B, C)
let result = combine(a, b, c)  // Auto-await
```
