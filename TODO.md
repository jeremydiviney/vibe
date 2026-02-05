# Vibe Language - TODO

## Pending

### Subagents
- [ ] Subagent support (async vibe functions with isolated context)
  - [ ] Clean context with initial prompt from calling AI
  - [ ] Configurable system prompts per subagent
  - [ ] Separate model declaration with custom system prompts on top of standard prompts
  - [ ] Independent toolsets per subagent
  - [ ] Callable by parent AI model (registered in context like tools)
  - [ ] Callable by Vibe code directly
  - [ ] Consider syntax: `agent myAgent = { model: m, systemPrompt: "...", tools: [...] }`

### User Interaction
- [ ] Ask user question tool (for AI to request input from user)
  - [ ] Text input (single question, free-form response)
  - [ ] Multiple choice input (select from options)
  - [ ] Multi-question input (batch multiple questions)
  - [ ] Confirmation input (yes/no)
  - [ ] Potentially other input types (file picker, number, etc.)

### Permission System
- [ ] Command permission scheme (like Claude Code settings)
  - [ ] Config file format (`.vibe/settings.json` or `vibe.config.json`)
  - [ ] Allow/deny lists with glob patterns for tools and commands
  - [ ] Interactive prompts for unknown/dangerous operations
  - [ ] Global config (`~/.vibe/settings.json`) and project config
  - [ ] CLI flags: `--yes-all`, `--safe-mode`

### Language Design
- [ ] Seamless Vibe↔TypeScript type integration
  - [ ] Vibe structural types (`type Foo { ... }`) automatically available as TS interfaces in ts blocks
  - [ ] TS interfaces/types from imports automatically available as Vibe types
  - [ ] No manual casting needed when passing Vibe types through ts blocks
  - [ ] Vibe variables used in ts blocks should carry their type (not require parameter passing)
  - [ ] Consider: generate `.d.ts` declarations for Vibe types, or virtual TS compilation with type context
  - [ ] LSP: Delegate to TypeScript language server inside ts blocks for full intellisense
    - [ ] Autocomplete for TS methods, properties, types
    - [ ] Hover information for TS expressions
    - [ ] Go-to-definition for TS symbols
    - [ ] Error squiggles from TS compiler
    - [ ] Consider: embedded language support or virtual document approach

## Completed
- [x] CLI argument passing to Vibe programs (args, hasArg core functions)
- [x] Error handling (.err system for AI call failures)
- [x] ts block scope restriction and type inference
- [x] Model-specific reasoning parameter handling
