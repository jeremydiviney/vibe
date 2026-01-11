# Vibe Language Extension

Language support for Vibe - an AI agent orchestration language.

## Features

- **Syntax Highlighting** - Full syntax highlighting for `.vibe` files
- **Diagnostics** - Real-time error detection from lexer, parser, and semantic analysis
- **Hover Information** - Type info and documentation on hover
- **Autocomplete** - Keywords, types, and built-in tools
- **Document Symbols** - Outline view showing functions, tools, models, and variables

## Installation

### From Source

1. Clone the repository
2. Run `npm install` in the `vscode-extension` directory
3. Run `npm run build` to compile
4. Press F5 in VSCode to launch Extension Development Host

### From VSIX

1. Download the `.vsix` file
2. In VSCode: Extensions → ... → Install from VSIX

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch
```

## Language Features

### Keywords
`let`, `const`, `function`, `tool`, `model`, `vibe`, `if`, `else`, `for`, `while`, `return`, `import`, `export`, `forget`, `verbose`, `compress`

### Types
`text`, `json`, `prompt`, `boolean`, `number`

### AI Expression
```vibe
vibe "What is 2+2?" myModel default
```

### Example Code
```vibe
model gpt = {
  provider: "openai",
  modelName: "gpt-4"
}

function greet(name: text): text {
  return vibe `Say hello to ${name}` gpt default
}

let result = greet("World")
print(result)
```
