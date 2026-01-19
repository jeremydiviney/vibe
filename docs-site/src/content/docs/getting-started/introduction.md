---
title: Introduction
description: What is Vibe and why use it?
---

Vibe is **the language to build incredible AI agents**. Write AI agents in minutes, not hours—Vibe makes prompts first-class citizens and handles the complexity so you can focus on what your agent does.

## What Makes Vibe Different?

### AI-Native Syntax

Instead of verbose API calls:

```javascript
// Traditional approach
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Explain quantum computing" }]
});
const answer = response.choices[0].message.content;
```

Vibe makes it simple:

```vibe
const answer = do "Explain quantum computing"
```

### Strong Typing

AI calls return typed values directly:

```vibe
const count: number = do "How many planets in our solar system?"
const isPrime: boolean = do "Is 17 a prime number?"
const languages: text[] = do "List the top 3 programming languages"

// Use them directly - no parsing needed
print(count + 1)        // 9
print(!isPrime)         // false
print(languages[0])     // "Python"
```

### TypeScript Interop

Drop into TypeScript whenever you need it:

```vibe
// Import from local TypeScript files
import { processData } from "./helpers.ts"

// Embed TypeScript for complex operations
const result = ts(data) {
  return JSON.parse(data).items.filter(i => i.score > 0.8);
}
```

## When to Use Vibe

Vibe is ideal for:

- **AI Agents** - Build autonomous agents that can reason and act
- **Data Processing Pipelines** - Transform data with AI assistance
- **Content Generation** - Create, analyze, and transform text at scale
- **Automation** - Orchestrate complex multi-step workflows

## Next Steps

Ready to get started? [Install Vibe](/docs/getting-started/installation/) and write your [first program](/docs/getting-started/hello-world/).
