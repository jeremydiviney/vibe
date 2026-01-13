---
title: CLI Reference
description: Command line options and usage
---

The `vibe` command runs Vibe programs and provides various options for debugging, logging, and configuration.

## Basic Usage

```bash
vibe <file.vibe>
```

Run a Vibe program:

```bash
vibe hello.vibe
```

## Commands

### upgrade

Update Vibe to a newer version:

```bash
# Upgrade to latest version
vibe upgrade

# Upgrade to a specific version
vibe upgrade 0.3.0
```

The `update` command is an alias for `upgrade`.

## Options

### --version, -v

Show the installed Vibe version:

```bash
vibe --version
vibe -v
```

### --verbose

Enable verbose JSONL logging. Logs are written to both console and file:

```bash
vibe --verbose myprogram.vibe
```

Log files are saved to `.vibe-logs/` by default (or the directory specified by `--log-dir`).

Events logged include:
- `run_start` / `run_complete` - Program execution
- `ai_start` / `ai_complete` - AI calls
- `tool_start` / `tool_complete` - Tool executions
- `ts_start` / `ts_complete` - TypeScript block execution

### --log-dir=PATH

Specify a custom directory for log files (used with `--verbose`):

```bash
vibe --verbose --log-dir=./logs myprogram.vibe
```

### --max-parallel=N

Set the maximum number of concurrent async operations. Default is 4:

```bash
# Allow up to 8 concurrent AI calls
vibe --max-parallel=8 myprogram.vibe
```

This affects `async let` declarations that run in parallel.

### --inspect

Start the program with the debugger server enabled:

```bash
vibe --inspect myprogram.vibe
```

The debugger listens on port 9229 by default. Connect with VS Code or another DAP-compatible debugger.

### --inspect-brk

Start with debugger and break on the first statement:

```bash
vibe --inspect-brk myprogram.vibe
```

Useful when you want to step through from the beginning.

### --inspect-port=PORT

Specify a custom port for the debug server:

```bash
vibe --inspect --inspect-port=9230 myprogram.vibe
```

## Examples

### Run a simple program

```bash
vibe hello.vibe
```

### Run with verbose logging

```bash
vibe --verbose agent.vibe
```

### Debug a program

```bash
vibe --inspect-brk myprogram.vibe
```

Then attach VS Code debugger to port 9229.

### Run with high parallelism

```bash
vibe --max-parallel=10 batch-process.vibe
```

## Environment Variables

Vibe automatically loads environment variables from `.env` files in the current directory. Common variables:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

Access them in your Vibe code:

```vibe
import { env } from "system"

model claude = {
  name: "claude-sonnet-4-20250514",
  apiKey: env("ANTHROPIC_API_KEY"),
  provider: "anthropic"
}
```
