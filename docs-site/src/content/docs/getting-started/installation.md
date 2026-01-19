---
title: Installation
description: How to install Vibe on your system
---

## Install via npm

```bash
npm install -g @vibe-lang/vibe
```

## Install via Bun

```bash
bun install -g @vibe-lang/vibe
```

## Verify Installation

After installation, verify Vibe is working:

```bash
vibe --version
```

You should see the version number printed.

## API Keys

Vibe works with multiple AI providers. You'll need an API key from at least one:

- **Anthropic** - [Get API key](https://console.anthropic.com/)
- **OpenAI** - [Get API key](https://platform.openai.com/api-keys)
- **Google AI** - [Get API key](https://aistudio.google.com/app/apikey)

Create a `.env` file in your project directory:

```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
# or
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
# or
GOOGLE_API_KEY=xxxxxxxxxxxxx
```

## VS Code Extension

For syntax highlighting and language support, install the VS Code extension:

```bash
code --install-extension vibelang.vibe-language
```

Or search for "Vibe Language" in the VS Code extensions marketplace.

## Next Steps

You're ready to write your [first Vibe program](/docs/getting-started/hello-world/)!
