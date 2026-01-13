---
title: Functions
description: Defining and calling functions in Vibe
---

## Function Declaration

Functions are declared at the top level. All parameters require type annotations:

```vibe
function greet(name: text): text {
  return "Hello, " + name
}

function add(a: number, b: number): number {
  return a + b
}
```

## Calling Functions

```vibe
let message = greet("World")   // "Hello, World"
let sum = add(1, 2)            // 3
```

## Return Types

Functions must declare their return type:

```vibe
function isEven(n: number): boolean {
  return n % 2 == 0
}

function getItems(): text[] {
  return ["a", "b", "c"]
}
```

## Functions with AI

Functions can contain AI expressions:

```vibe
function summarize(content: text): text {
  return do "Summarize this in one sentence: {content}"
}

function analyze(data: text): json {
  return do "Analyze this data and return structured insights: {data}"
}
```

## Multi-Step Workflows

Chain AI calls within functions:

```vibe
function analyzeAndSummarize(content: text): text {
  let analysis = do "Analyze the key themes in: {content}"
  return do "Summarize this analysis in one sentence: {analysis}"
}
```

## Context in Functions

Variables in scope are automatically visible to AI prompts:

```vibe
function processArticle(url: text, style: text): text {
  let content = fetch(url)
  // AI sees both 'content' and 'style' variables
  return do "Rewrite this article in a {style} style"
}
```

## Exporting Functions

Share functions across files with `export`:

```vibe
export function formatDate(date: text): text {
  return do "Format this date nicely: {date}"
}
```

See [Modules](/docs/guide/modules/) for more on imports and exports.
