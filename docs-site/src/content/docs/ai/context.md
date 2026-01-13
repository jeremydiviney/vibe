---
title: Context Management
description: Managing AI context with forget, compress, and verbose
---

When working with AI, context matters. Vibe provides fine-grained control over what information the AI sees.

## Context Modes

### Verbose (Default)

Keep all context from every iteration:

```vibe
for item in items {
  let result = do "Process {item}"
} verbose  // or just omit - verbose is default
```

The AI sees the full history of all previous iterations. Good for:
- Building up knowledge across iterations
- Tasks where previous results inform next steps

### Forget

Discard all context when the loop exits:

```vibe
for item in items {
  let analysis = do "Analyze {item}"
  results.push(analysis)
} forget
```

The `analysis` variable and its history are discarded. Good for:
- Processing many independent items
- Reducing context size
- Avoiding context overflow on large datasets

### Compress

Summarize context using AI:

```vibe
for article in articles {
  let summary = do "Summarize: {article}"
} compress
```

At loop exit, the AI summarizes what happened. Good for:
- Long-running loops where you need key insights
- Reducing context while preserving important information

#### Compress with Custom Prompt

```vibe
for item in items {
  // processing...
} compress("List the key findings from all iterations")
```

#### Compress with Custom Model

```vibe
model summarizer = {
  name: "claude-haiku-4.5",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY")
}

for item in items {
  // processing...
} compress(summarizer)
```

#### Compress with Both

```vibe
for item in items {
  // processing...
} compress("Extract action items", summarizer)
```

## While Loops

Context modes work with while loops too:

```vibe
let count = 0
while count < 100 {
  do "Process iteration {count}"
  count = count + 1
} forget  // Don't keep 100 iterations of context
```

## Private Variables

Hide specific variables from AI context:

```vibe
private let apiSecret = "sk-secret-key"
private let internalState = { counter: 0 }

let publicData = "This is visible to AI"

// AI only sees publicData, not apiSecret or internalState
do "Analyze the available data"
```

### Private in Destructuring

```vibe
let { private apiKey: text, endpoint: text } = config

// AI sees endpoint but not apiKey
do "Connect to the service"
```

## Context Mode Comparison

| Mode | Behavior | Use Case |
|------|----------|----------|
| `verbose` | Keep everything | Building knowledge |
| `forget` | Discard all | Independent processing |
| `compress` | AI summary | Long loops, key insights |

## Practical Examples

### Processing Large Datasets

```vibe
let files = glob("**/*.md")
let insights: text[] = []

for file in files {
  let content = readFile(file)
  let insight = do "Extract key points from: {content}"
  insights.push(insight)
} forget  // Don't keep all file contents in context

// Now summarize the collected insights
let report = do "Create a report from these insights: {insights}"
```

### Iterative Refinement

```vibe
let draft = do "Write initial draft about {topic}"

for i in 1..3 {
  draft = do "Improve this draft: {draft}"
} verbose  // Keep history so AI knows what changed
```

### Independent Analysis

```vibe
for url in urls {
  let page = fetch(url)
  let analysis = do "Analyze this page"
  saveResult(url, analysis)
} forget  // Each page is independent
```

### Summarized Processing

```vibe
for customer in customers {
  let feedback = do "Analyze customer feedback: {customer.comments}"
  let sentiment = do "Rate sentiment 1-10"
  results.push({ customer: customer.id, sentiment })
} compress("What are the overall sentiment trends?")

// Continue with compressed summary in context
let recommendations = do "Based on the analysis, what should we improve?"
```
