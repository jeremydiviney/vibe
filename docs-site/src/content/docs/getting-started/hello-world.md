---
title: Hello World
description: Write your first Vibe program
---

Let's write a simple program that uses AI to translate "Hello World" into multiple languages.

## Create Your First Program

Create a file called `hello.vibe`:

```vibe
model translator = {
  name: "claude-haiku-4-5-20251001",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY")
}

const languages: text[] = do "List the major human languages"

for language in languages {
  const translated = do "Translate 'Hello World' into {language}"
  print(translated)
}
```

## Run It

```bash
vibe hello.vibe
```

You'll see "Hello World" translated into various languages!

## Understanding the Code

Let's break down what's happening:

### Model Declaration

```vibe
model translator = {
  name: "claude-haiku-4-5-20251001",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY")
}
```

This configures which AI model to use. The `env()` function reads from your environment variables.

### AI Expression with `do`

```vibe
const languages: text[] = do "List the major human languages"
```

The `do` keyword sends a prompt to the AI and returns the result. Here we're asking for a list of languages and typing it as `text[]` (array of strings).

### Loop with Context

```vibe
for language in languages {
  const translated = do "Translate 'Hello World' into {language}"
  print(translated)
}
```

The `{language}` syntax creates a reference that the AI can see in context. The AI knows what `language` contains and uses it to complete the task. See [AI Prompts](/docs/ai/prompts/) for more on interpolation.

## Try Different Providers

Switch to OpenAI by changing the model:

```vibe
model translator = {
  name: "gpt-5.2",
  provider: "openai",
  apiKey: env("OPENAI_API_KEY")
}
```

Or Google:

```vibe
model translator = {
  name: "gemini-3-flash",
  provider: "google",
  apiKey: env("GOOGLE_API_KEY")
}
```

## Next Steps

Now that you've written your first program, learn about:

- [Basic Syntax](/docs/guide/basics/) - Variables, types, and operators
- [AI Prompts](/docs/ai/prompts/) - The `do` and `vibe` keywords in depth
- [Models](/docs/ai/models/) - Configuring AI providers
