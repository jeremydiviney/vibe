---
title: TypeScript Blocks
description: Embedding TypeScript code in Vibe
---

Vibe runs on a TypeScript runtime, allowing you to drop into TypeScript whenever needed.

## Basic TS Blocks

```vibe
let result = ts() {
  return Math.random() * 100;
}
```

## Passing Variables

Pass Vibe variables into TypeScript:

```vibe
let x = 10
let y = 20

let sum = ts(x, y) {
  return x + y;
}
```

Variables are passed by name and available inside the block.

## Complex Operations

### JSON Processing

```vibe
let jsonString = '{"name": "Alice", "age": 30}'

let parsed = ts(jsonString) {
  const data = JSON.parse(jsonString);
  return data.name.toUpperCase();
}
```

### Array Operations

```vibe
let items = [1, 2, 3, 4, 5]

let doubled = ts(items) {
  return items.map(x => x * 2);
}

let filtered = ts(items) {
  return items.filter(x => x > 2);
}
```

### Async Operations

```vibe
let data = ts() {
  const response = await fetch('https://api.example.com/data');
  return await response.json();
}
```

## Using npm Packages

```vibe
let markdown = "# Hello World"

let html = ts(markdown) {
  const marked = require('marked');
  return marked.parse(markdown);
}
```

## Processing AI Results

```vibe
let aiResponse = do "Generate a list of 5 items as JSON"

let processed = ts(aiResponse) {
  const items = JSON.parse(aiResponse);
  return items
    .filter(item => item.score > 0.8)
    .map(item => item.name)
    .join(", ");
}
```

## Return Types

TypeScript blocks can return any type:

```vibe
// Return number
let count: number = ts() { return 42; }

// Return text
let greeting: text = ts() { return "Hello"; }

// Return array
let items: text[] = ts() { return ["a", "b", "c"]; }

// Return object
let config: json = ts() {
  return { timeout: 5000, retries: 3 };
}
```

## Error Handling

```vibe
let result = ts(input) {
  try {
    return JSON.parse(input);
  } catch (e) {
    return { error: e.message };
  }
}
```

## Using in Tools

TypeScript blocks are commonly used in tool implementations:

```vibe
tool processData(data: json): json
  @description "Process and transform data"
{
  ts(data) {
    return {
      count: data.items.length,
      total: data.items.reduce((sum, item) => sum + item.value, 0),
      average: data.items.reduce((sum, item) => sum + item.value, 0) / data.items.length
    };
  }
}
```

## Accessing Environment

```vibe
let apiUrl = ts() {
  return process.env.API_URL || 'http://localhost:3000';
}
```

## File System Operations

```vibe
let files = ts() {
  const fs = require('fs');
  const path = require('path');

  return fs.readdirSync(process.cwd())
    .filter(f => f.endsWith('.vibe'));
}
```

## Best Practices

### Keep Blocks Focused

```vibe
// Good - single purpose
let parsed = ts(json) {
  return JSON.parse(json);
}

// Avoid - too much logic
let result = ts(data) {
  // 50 lines of complex logic...
}
```

### Use for What Vibe Can't Do

```vibe
// Good - Vibe doesn't have regex
let matches = ts(text) {
  return text.match(/\d+/g) || [];
}

// Unnecessary - Vibe can do this
let sum = ts(a, b) { return a + b; }
// Better: let sum = a + b
```

### Handle Errors Gracefully

```vibe
let safeResult = ts(input) {
  try {
    return { success: true, data: riskyOperation(input) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
```
