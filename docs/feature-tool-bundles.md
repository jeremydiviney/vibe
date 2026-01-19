# Plan: Tool Bundles

## Overview
Create pre-defined tool bundles for common use cases, importable from `system/tools`.

## Bundles

### `readonlyBundle`
Safe tools that only read data:
- `readFile`
- `glob`
- `grep`
- `listDirectory`

### `fileBundle`
File operations:
- `readFile`
- `writeFile`
- `glob`
- `grep`
- `listDirectory`

### `allToolsBundle`
All available tools:
- `readFile`
- `writeFile`
- `bash`
- `glob`
- `grep`
- `listDirectory`
- `edit`

## Usage
```vibe
import { readonlyBundle, fileBundle, allToolsBundle } from "system/tools"

model reader = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY"),
  tools: readonlyBundle
}

model writer = {
  name: "claude-sonnet-4-20250514",
  provider: "anthropic",
  apiKey: env("ANTHROPIC_API_KEY"),
  tools: fileBundle
}
```

## Implementation

### 1. Create bundles in stdlib
In `packages/runtime/src/runtime/stdlib/tools.ts`:
```typescript
export const readonlyBundle = [readFile, glob, grep, listDirectory];
export const fileBundle = [readFile, writeFile, glob, grep, listDirectory];
export const allToolsBundle = [readFile, writeFile, bash, glob, grep, listDirectory, edit];
```

### 2. Export from system/tools
Update the system module resolution to include bundles.

### 3. Type Support
Ensure bundles are typed as tool arrays for model config validation.

## Files to Modify
- `packages/runtime/src/runtime/stdlib/tools.ts`
- `packages/runtime/src/runtime/modules.ts` (system module mapping)

## Tests
- Import `readonlyBundle` and verify contents
- Import `fileBundle` and verify contents
- Use bundle in model config
- Verify model can use tools from bundle

## Verification
```bash
bun test packages/runtime/src/runtime/test/tool-bundles.test.ts
bun run test
```

## Documentation
Add to Models section in doc site showing bundle usage.
