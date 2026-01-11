# Vibe Debugger Implementation Plan

## Overview

Build a debugger for Vibe that works in VSCode (and clones) with full support for:
- Basic debug features (breakpoints, stepping, variable inspection, call stack)
- Stepping into imported TypeScript functions
- Stepping into `ts { }` blocks
- Full TS debug support when in TypeScript code

## Architecture

### Design Decision: Hybrid with Bundled Bun Inspector

Vibe ships with a bundled Bun runtime. We leverage this for debugging:

```
┌─────────────────────────────────────────────────────────────┐
│  VSCode                                                     │
│    │                                                        │
│    │ DAP (Debug Adapter Protocol)                           │
│    ▼                                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Vibe Debug Adapter                                  │   │
│  │    │                                                 │   │
│  │    ├── IPC ────────► Vibe Runtime (debug hooks)      │   │
│  │    │                    │                            │   │
│  │    └── WebSocket ──► Bun Inspector ◄─────────────────┘   │
│  │                       (handles TS debugging natively)    │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Why This Approach

| Approach | Pros | Cons |
|----------|------|------|
| **A: Pure Interpreter Hooks** | Simple, full control | Can't debug TS naturally |
| **B: Compile Vibe to JS** | Cleanest TS integration | Requires building a compiler |
| **C: Hybrid with Bun (chosen)** | TS debugging "free", uses bundled runtime | Coordinator complexity |

### Key Insight

- Bun runs TypeScript natively (no compilation)
- Bun has `--inspect` support (WebKit Inspector Protocol)
- Vibe already bundles Bun runtime
- We only need to build coordination logic, not TS debugging

## Components to Build

### 1. Vibe CLI Debug Flag

Add `--inspect` and `--inspect-brk` flags to the Vibe CLI.

```bash
vibe --inspect script.vibe        # Enable inspector, don't break
vibe --inspect-brk script.vibe    # Break on first line
vibe --inspect=9229 script.vibe   # Custom port
```

**Implementation:**
- Pass through to Bun's inspector
- Initialize debug hooks in runtime
- Start IPC server for Debug Adapter communication

### 2. Runtime Debug Hooks

Instrument the Vibe runtime to support debugging.

**File:** `src/runtime/debug.ts` (new)

```typescript
interface DebugState {
  enabled: boolean;
  breakpoints: Map<string, Set<number>>;  // file -> line numbers
  pausedAt: SourceLocation | null;
  stepMode: 'none' | 'into' | 'over' | 'out';
}

interface DebugHooks {
  // Called before each statement execution
  beforeStatement(location: SourceLocation): Promise<void>;

  // Called on function entry/exit
  onFunctionEnter(name: string, args: any[]): void;
  onFunctionExit(name: string, result: any): void;

  // State inspection
  getCallStack(): StackFrame[];
  getVariables(frameId: number): Variable[];
  evaluate(expression: string, frameId: number): any;
}
```

**Integration points in runtime:**
- `executeStatement()` - check breakpoints, handle stepping
- `executeFunction()` - track call stack
- `declareVariable()` / `assignVariable()` - track variable changes

### 3. Debug Adapter (DAP Server)

**File:** `vscode-extension/src/debug/adapter.ts` (new)

Uses `@vscode/debugadapter` package to implement DAP.

```typescript
import { DebugSession, InitializedEvent, StoppedEvent } from '@vscode/debugadapter';

class VibeDebugAdapter extends DebugSession {
  private vibeProcess: ChildProcess;
  private bunInspector: WebSocket;
  private ipcChannel: /* IPC connection to Vibe runtime */;

  // Lifecycle
  protected initializeRequest(response, args): void;
  protected launchRequest(response, args): void;
  protected disconnectRequest(response, args): void;

  // Breakpoints
  protected setBreakPointsRequest(response, args): void;

  // Execution control
  protected continueRequest(response, args): void;
  protected nextRequest(response, args): void;      // Step over
  protected stepInRequest(response, args): void;
  protected stepOutRequest(response, args): void;

  // State inspection
  protected stackTraceRequest(response, args): void;
  protected scopesRequest(response, args): void;
  protected variablesRequest(response, args): void;
  protected evaluateRequest(response, args): void;
}
```

**Request routing logic:**

```typescript
private isInVibeCode(): boolean {
  // Check current stack frame - is it a .vibe file?
}

protected stepInRequest(response, args) {
  if (this.isInVibeCode()) {
    // Send step command to Vibe runtime via IPC
    this.ipcChannel.send({ command: 'stepIn' });
  } else {
    // Forward to Bun inspector
    this.bunInspector.send({ method: 'Debugger.stepInto' });
  }
}
```

### 4. VSCode Extension Updates

**File:** `vscode-extension/package.json` additions

```json
{
  "contributes": {
    "debuggers": [
      {
        "type": "vibe",
        "label": "Vibe Debug",
        "program": "./out/debug/adapter.js",
        "runtime": "node",
        "configurationAttributes": {
          "launch": {
            "required": ["program"],
            "properties": {
              "program": {
                "type": "string",
                "description": "Path to .vibe file to debug"
              },
              "stopOnEntry": {
                "type": "boolean",
                "description": "Break on first line",
                "default": false
              }
            }
          }
        },
        "initialConfigurations": [
          {
            "type": "vibe",
            "request": "launch",
            "name": "Debug Vibe",
            "program": "${file}"
          }
        ]
      }
    ],
    "breakpoints": [
      { "language": "vibe" }
    ]
  }
}
```

### 5. IPC Protocol

Communication between Debug Adapter and Vibe Runtime.

**Messages from Adapter to Runtime:**

```typescript
type AdapterToRuntime =
  | { command: 'setBreakpoints'; file: string; lines: number[] }
  | { command: 'continue' }
  | { command: 'stepIn' }
  | { command: 'stepOver' }
  | { command: 'stepOut' }
  | { command: 'getStackTrace' }
  | { command: 'getVariables'; frameId: number }
  | { command: 'evaluate'; expression: string; frameId: number };
```

**Messages from Runtime to Adapter:**

```typescript
type RuntimeToAdapter =
  | { event: 'stopped'; reason: 'breakpoint' | 'step'; location: SourceLocation }
  | { event: 'continued' }
  | { event: 'output'; category: 'stdout' | 'stderr'; text: string }
  | { event: 'terminated' }
  | { response: 'stackTrace'; frames: StackFrame[] }
  | { response: 'variables'; variables: Variable[] }
  | { response: 'evaluate'; result: any };
```

## Vibe ↔ TypeScript Handoff

### Detecting Transition

When stepping in Vibe code encounters:
1. **Imported TS function call** - `import { foo } from "./utils.ts"` then `foo()`
2. **TS block** - `ts { ... }`

The runtime detects this and:
1. Notifies Debug Adapter: "entering TS code at location X"
2. Debug Adapter switches to forwarding commands to Bun inspector
3. Bun inspector handles all stepping within TS
4. When TS returns, Bun inspector hits our "exit" breakpoint
5. Debug Adapter switches back to Vibe runtime control

### Stack Frame Unification

Present a unified call stack even when mixing Vibe and TS:

```
#0  calculateTax (utils.ts:42)      <- TS frame (from Bun)
#1  processOrder (app.vibe:15)      <- Vibe frame (from runtime)
#2  main (app.vibe:8)               <- Vibe frame (from runtime)
```

Debug Adapter merges frames from both sources.

## Implementation Phases

### Phase 1: Basic Vibe Debugging (MVP)

**Goal:** Debug pure Vibe code without TS integration.

**Tasks:**
- [ ] Add `--inspect` flag to Vibe CLI
- [ ] Implement runtime debug hooks (beforeStatement, breakpoints)
- [ ] Create IPC server in runtime
- [ ] Build Debug Adapter with basic DAP support
- [ ] Add debugger configuration to VSCode extension
- [ ] Support: breakpoints, continue, step over, step into, step out
- [ ] Support: call stack, variable inspection

**Deliverable:** Can set breakpoints and step through .vibe files.

### Phase 2: TS Block Debugging

**Goal:** Step into `ts { }` blocks with full debugging.

**Tasks:**
- [ ] Source map TS blocks to locations within .vibe files
- [ ] Connect Debug Adapter to Bun inspector WebSocket
- [ ] Implement handoff logic when entering TS block
- [ ] Merge stack frames from Vibe runtime and Bun inspector
- [ ] Handle breakpoints set inside TS blocks

**Deliverable:** Seamless stepping into/out of TS blocks.

### Phase 3: Imported TS Function Debugging

**Goal:** Step into imported TypeScript functions.

**Tasks:**
- [ ] Detect when step-in targets a TS import
- [ ] Set temporary breakpoint at TS function entry
- [ ] Hand control to Bun inspector
- [ ] Detect when TS function returns to Vibe
- [ ] Resume Vibe runtime control

**Deliverable:** Full debugging across Vibe and imported TS code.

### Phase 4: Polish & Advanced Features

**Tasks:**
- [ ] Conditional breakpoints
- [ ] Logpoints (log without breaking)
- [ ] Watch expressions
- [ ] Exception breakpoints
- [ ] Hot reload while debugging
- [ ] Debug console (REPL)

## File Structure

```
vscode-extension/
├── src/
│   ├── debug/
│   │   ├── adapter.ts           # DAP implementation
│   │   ├── vibeRuntime.ts       # IPC client for Vibe runtime
│   │   ├── bunInspector.ts      # WebSocket client for Bun
│   │   └── stackMerger.ts       # Unify Vibe + TS stack frames
│   └── ...
└── package.json                  # debugger contribution

src/
├── runtime/
│   ├── debug.ts                  # Debug hooks and state
│   ├── debugServer.ts            # IPC server
│   └── runtime.ts                # (modified) Add debug hook calls
└── cli/
    └── index.ts                  # (modified) Add --inspect flag
```

## Dependencies

**New dependencies for vscode-extension:**
```json
{
  "@vscode/debugadapter": "^1.65.0",
  "@vscode/debugprotocol": "^1.65.0",
  "ws": "^8.0.0"
}
```

## Open Questions

1. **IPC mechanism:** Unix socket? Named pipe? stdio? WebSocket?
   - Recommendation: WebSocket for cross-platform consistency

2. **Source maps for TS blocks:** Generate on-the-fly or pre-compute?
   - Recommendation: Generate when debug mode enabled

3. **Performance:** How much overhead do debug hooks add?
   - Mitigation: Only enable hooks when `--inspect` flag used

4. **Bun inspector stability:** Is WebKit Inspector Protocol stable enough?
   - Need to test with current Bun version

## Distribution

### What Ships Where

| Component | Ships With | How Users Get It |
|-----------|------------|------------------|
| Debug Adapter | VSCode Extension | VS Marketplace install |
| Runtime Debug Hooks | Vibe CLI binary | `npm install -g @vibe-lang/vibe` |
| Bun Inspector | Bundled in Vibe CLI | Included automatically |

### User Experience

**Prerequisites:**
1. Install Vibe: `npm install -g @vibe-lang/vibe`
2. Install VSCode extension: Search "Vibe Language" in Extensions

**To debug:**
1. Open a `.vibe` file
2. Set breakpoints (click in gutter)
3. Press F5 or Run → Start Debugging
4. Select "Vibe Debug" configuration

### VSCode Extension Publishing

The debug adapter is bundled into the existing VSCode extension.

**Build:**
```bash
cd vscode-extension
bun run build          # Builds extension + debug adapter
vsce package           # Creates .vsix file
```

**Publish:**
```bash
vsce publish           # Publishes to VS Marketplace
```

**For Cursor/Other VSCode Forks:**
- Same `.vsix` file works
- Users can install via: Extensions → ... → Install from VSIX

### launch.json Auto-Generation

When users press F5 with no launch.json, VSCode prompts for environment.
We register our debugger so "Vibe Debug" appears as an option.

**Default configuration generated:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "vibe",
      "request": "launch",
      "name": "Debug Vibe",
      "program": "${file}",
      "stopOnEntry": false
    }
  ]
}
```

### Version Compatibility

The Debug Adapter and Vibe CLI must be compatible:

| Extension Version | Minimum Vibe CLI |
|-------------------|------------------|
| 0.1.x | 0.1.x (no debug) |
| 0.2.x | 0.2.x (debug support) |

Extension should check Vibe CLI version and show helpful error if incompatible.

## References

- [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/)
- [VSCode Debugger Extension Guide](https://code.visualstudio.com/api/extension-guides/debugger-extension)
- [@vscode/debugadapter](https://www.npmjs.com/package/@vscode/debugadapter)
- [Bun Debugger Docs](https://bun.sh/docs/runtime/debugger)
- [WebKit Inspector Protocol](https://chromedevtools.github.io/devtools-protocol/)
