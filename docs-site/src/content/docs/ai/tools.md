---
title: Tools
description: Defining custom tools for AI models
---

Tools are functions that AI models can call to interact with the outside world.

## Built-in Tools

Vibe provides a standard library of tools:

```vibe
import { readFile, writeFile, bash, glob } from "system/tools"
```

### File Operations

| Tool | Description |
|------|-------------|
| `readFile(path, startLine?, endLine?)` | Read file contents |
| `writeFile(path, content)` | Write to file |
| `appendFile(path, content)` | Append to file |
| `fileExists(path)` | Check if file exists |
| `listDir(path)` | List directory contents |
| `edit(path, startLine, endLine, newText)` | Edit specific lines |

### Search Tools

| Tool | Description |
|------|-------------|
| `glob(pattern, cwd?)` | Find files by pattern |
| `grep(pattern, path, ignoreCase?)` | Search file contents |

### Directory Operations

| Tool | Description |
|------|-------------|
| `mkdir(path, recursive?)` | Create directory |
| `dirExists(path)` | Check if directory exists |

### System Commands

| Tool | Description |
|------|-------------|
| `bash(command, cwd?, timeout?)` | Execute shell command |
| `runCode(language, code)` | Run code snippet |

## Custom Tool Declaration

Define your own tools:

```vibe
tool getCurrentWeather(city: text): json
  @description "Get current weather for a city"
  @param city "The city name to get weather for"
{
  ts(city) {
    const response = await fetch(`https://api.weather.com/${city}`);
    return await response.json();
  }
}
```

### Tool Syntax

```vibe
tool toolName(param1: type, param2: type): returnType
  @description "Description of what the tool does"
  @param param1 "Description of param1"
  @param param2 "Description of param2"
{
  ts(param1, param2) {
    // TypeScript implementation
    return result;
  }
}
```

### Required Elements

- **`tool`** keyword and name
- **Parameters** with types
- **Return type**
- **`@description`** - Required description for AI
- **Implementation body** with `ts` block

### Optional Elements

- **`@param`** annotations - Help AI understand parameters

## Attaching Tools to Models

```vibe
model agent = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY"),
  tools: [getCurrentWeather, readFile, writeFile]
}
```

## Using Tools with `vibe`

The `vibe` keyword enables tool use:

```vibe
// Agent can call tools autonomously
vibe "What's the weather in Tokyo and save it to weather.txt" agent
```

The AI will:
1. Call `getCurrentWeather("Tokyo")`
2. Call `writeFile("weather.txt", result)`

## Complex Tool Example

```vibe
import { createIncident } from "./pagerduty.ts"

tool alertOnCall(severity: text, title: text, details: text): json
  @description "Create an incident and page the on-call engineer"
  @param severity "Incident severity: critical, high, medium, low"
  @param title "Short incident title"
  @param details "Detailed incident description"
{
  ts(severity, title, details) {
    return createIncident({ severity, title, details });
  }
}

tool getMetrics(service: text, hours: number): json
  @description "Get performance metrics for a service"
  @param service "Service name to query"
  @param hours "Number of hours to look back"
{
  ts(service, hours) {
    const url = env("METRICS_API") + "/v1/query";
    const res = await fetch(`${url}?service=${service}&hours=${hours}`);
    return res.json();
  }
}

model monitor = {
  name: "claude-opus-4.5",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY"),
  tools: [getMetrics, alertOnCall]
}

vibe "Check api-gateway metrics for the last 24 hours. Alert if error rate is critical." monitor
```

## Tool Return Types

Tools can return various types:

```vibe
// Return text
tool formatName(first: text, last: text): text { ... }

// Return number
tool calculateSum(numbers: number[]): number { ... }

// Return boolean
tool validateEmail(email: text): boolean { ... }

// Return structured data
tool fetchUser(id: text): json { ... }

// Return arrays
tool listFiles(dir: text): text[] { ... }
```

## Importing External Functions

Use TypeScript functions in tools:

```vibe
import { sendEmail } from "./email-service.ts"
import { queryDatabase } from "./db.ts"

tool notifyUser(userId: text, message: text): boolean
  @description "Send notification to a user"
{
  ts(userId, message) {
    const user = await queryDatabase(`SELECT email FROM users WHERE id = '${userId}'`);
    return await sendEmail(user.email, message);
  }
}
```

## Best Practices

### Clear Descriptions

```vibe
// Good - specific and actionable
@description "Search for files matching a glob pattern in the project directory"

// Bad - vague
@description "Search files"
```

### Document Parameters

```vibe
@param pattern "Glob pattern like '**/*.ts' or 'src/**/*.js'"
@param ignoreCase "If true, search is case-insensitive (default: false)"
```

### Handle Errors

```vibe
tool safeRead(path: text): json
  @description "Read file with error handling"
{
  ts(path) {
    try {
      const content = await readFile(path);
      return { success: true, content };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}
```
