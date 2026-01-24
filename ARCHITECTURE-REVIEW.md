# Architecture Review: Vibe Runtime

An analysis of high-level design patterns in the Vibe runtime that could be improved for better maintainability, extensibility, and code reuse.

---

## 1. RuntimeState is a Monolithic God Object

**Location:** `packages/runtime/src/runtime/types.ts:632-711`

**Problem:** `RuntimeState` has 40+ fields spanning unrelated concerns: program metadata, execution state, module registry, AI interaction logging, async coordination, destructuring state, prompt context flags, and more. Adding any new feature means adding more fields to this one interface.

**Symptoms:**
- Every `step()` call spreads the entire state object (allocation overhead)
- Functions accept `RuntimeState` when they only need 2-3 fields
- Hard to reason about which operations mutate which parts of state
- The async declaration context alone is 6 boolean/string fields (`currentAsyncVarName`, `currentAsyncIsConst`, `currentAsyncType`, `currentAsyncIsPrivate`, `currentAsyncIsDestructure`, `currentAsyncIsFireAndForget`)

**Improvement:** Decompose into sub-states:

```typescript
interface RuntimeState {
  execution: ExecutionState;    // callStack, instructionStack, valueStack
  modules: ModuleState;         // tsModules, vibeModules, importedNames
  pending: PendingState;        // pendingAI, pendingTS, pendingToolCall, etc.
  async: AsyncState;            // operations, waves, pendingStarts, etc.
  logging: LoggingState;        // aiInteractions, executionLog
  program: ProgramState;        // program, functions, typeDefinitions
}
```

This makes it clear which subsystem each function touches and enables targeted spreading (only spread the sub-state that changed).

---

## 2. Duplicated Execution Loops in Runtime Class

**Location:** `packages/runtime/src/runtime/index.ts:233-547` and `index.ts:790-875`

**Problem:** `Runtime.run()` and `Runtime.runIsolatedState()` are essentially the same pause/resume loop with minor differences (logging, async handling). Similarly, `startScheduledAsyncOps()` and `startIsolatedAsyncOps()` duplicate the same dispatch logic across 4 operation types.

**Symptoms:**
- Bug fixes must be applied in two places
- `startIsolatedAsyncOps` (lines 881-974) is a 90-line near-copy of `startScheduledAsyncOps` (lines 558-605)
- Adding a new pause type (e.g., a new kind of external I/O) requires changes in both loops

**Improvement:** Extract a single `ExecutionLoop` class or function parameterized by logging/isolation options:

```typescript
interface ExecutionLoopOptions {
  logger?: VerboseLogger;
  isolated?: boolean;
}

function executeToCompletion(
  state: RuntimeState,
  provider: AIProvider,
  options: ExecutionLoopOptions
): Promise<RuntimeState>
```

---

## 3. `executeInstruction` is a 640-line Switch Statement

**Location:** `packages/runtime/src/runtime/step.ts:321-961`

**Problem:** The `executeInstruction` function is a single switch with 30+ cases. Many cases (for-in loops, while loops, break, member access, binary ops, destructuring) contain 30-80 lines of inline logic rather than delegating to handlers.

**Symptoms:**
- Hard to find specific instruction handling
- Inconsistent delegation: some ops call `exec*` functions from `exec/`, others are fully inline
- Adding a new instruction type means adding to this already-large switch

**Improvement:** Move all remaining inline cases to `exec/` handlers. The switch should be pure delegation:

```typescript
function executeInstruction(state: RuntimeState, instruction: Instruction): RuntimeState {
  switch (instruction.op) {
    case 'for_in_init': return execForInInit(state, instruction);
    case 'for_in_iterate': return execForInIterate(state, instruction);
    case 'while_init': return execWhileInit(state, instruction);
    case 'while_check': return execWhileCheck(state, instruction);
    case 'binary_op': return execBinaryOp(state, instruction);
    case 'unary_op': return execUnaryOp(state, instruction);
    case 'member_access': return execMemberAccess(state, instruction);
    case 'index_access': return execIndexAccess(state, instruction);
    case 'slice_access': return execSliceAccess(state, instruction);
    case 'destructure_assign': return execDestructureAssign(state, instruction);
    case 'break_loop': return execBreakLoop(state, instruction);
    // ... all cases are one-line delegations
  }
}
```

This also makes each handler independently testable.

---

## 4. `PendingAsyncStart` Uses Optional Fields Instead of Tagged Union

**Location:** `packages/runtime/src/runtime/types.ts:570-604`

**Problem:** `PendingAsyncStart` has `aiDetails?`, `tsDetails?`, `tsFuncDetails?`, `vibeFuncDetails?` as optional properties. The consumer must check each one with if/else chains, and TypeScript can't narrow the type.

**Current pattern:**
```typescript
if (start.aiDetails) { ... }
else if (start.tsDetails) { ... }
else if (start.tsFuncDetails) { ... }
else if (start.vibeFuncDetails) { ... }
```

**Improvement:** Proper discriminated union:

```typescript
type PendingAsyncStart =
  | { type: 'ai'; operationId: string; variableName: string | null; prompt: string; model: string; context: unknown[]; operationType: 'do' | 'vibe' }
  | { type: 'ts'; operationId: string; variableName: string | null; params: string[]; body: string; paramValues: unknown[]; location: SourceLocation }
  | { type: 'ts-function'; operationId: string; variableName: string | null; funcName: string; args: unknown[]; location: SourceLocation }
  | { type: 'vibe-function'; operationId: string; variableName: string | null; funcName: string; args: unknown[]; modulePath?: string }
```

This enables exhaustive switch/case with TypeScript narrowing.

---

## 5. Context Rebuilt on Every Single Step

**Location:** `packages/runtime/src/runtime/step.ts:264-268`

**Problem:** In `step()`, `buildLocalContext` and `buildGlobalContext` are called unconditionally before every instruction:

```typescript
const stateWithContext: RuntimeState = {
  ...state,
  localContext: buildLocalContext(state),
  globalContext: buildGlobalContext(state),
};
```

These are only needed when an AI call is about to happen (`ai_vibe` instruction), but they're computed on every arithmetic op, variable assignment, loop iteration, etc.

**Improvement:** Lazy context computation - only build context when entering an AI pause state, or use a dirty flag:

```typescript
// Only compute context when actually needed (before AI calls)
case 'ai_vibe': {
  const context = buildLocalContext(state);
  return execAIVibe(state, instruction, context);
}
```

---

## 6. Semantic Analyzer `createVisitors` is 827 Lines

**Location:** `packages/runtime/src/semantic/analyzer-visitors.ts:44-827`

**Problem:** A single function that defines all AST visitors. It handles imports, variables, functions, expressions, tools, types, etc. in one closure.

**Improvement:** Split into visitor modules by concern:

```
semantic/
  visitors/
    imports.ts        - import resolution and validation
    declarations.ts   - variable/function/type/model declarations
    expressions.ts    - expression type checking and validation
    control-flow.ts   - if/while/for validation
    ai-operations.ts  - vibe/do/ask prompt validation
    tools.ts          - tool declaration validation
```

Compose them via a visitor registry pattern:

```typescript
function createVisitors(ctx: AnalyzerContext, state: AnalyzerState): AnalyzerVisitor {
  return mergeVisitors(
    createImportVisitors(ctx, state),
    createDeclarationVisitors(ctx, state),
    createExpressionVisitors(ctx, state),
    createControlFlowVisitors(ctx, state),
    createAIVisitors(ctx, state),
    createToolVisitors(ctx, state),
  );
}
```

---

## 7. No Shared Type Representation Between Semantic Analyzer and Runtime

**Problem:** Types exist in three different forms:

| Layer | Representation | Location |
|-------|---------------|----------|
| AST | `VibeType` (string literal: `'text'`, `'number'`, `'json'`) | `packages/runtime/src/ast.ts` |
| Semantic | `SymbolTable`/`TypeRegistry`, TS type bridging | `packages/runtime/src/semantic/` |
| Runtime | `VibeValue.vibeType`, `validateAndCoerce` doing coercion | `packages/runtime/src/runtime/validation.ts` |

The semantic analyzer does type inference (`getExpressionType` returns `string | null`), but this information is discarded - the runtime re-validates types dynamically via `validateAndCoerce`. Adding a new type requires changes in:
- `semantic/types.ts` (validity check)
- `semantic/ts-types.ts` (TS bridging)
- `runtime/validation.ts` (coercion logic)
- Potentially the parser

**Improvement:** Create a shared `TypeSystem` module that both the analyzer and runtime consume:

```typescript
// shared/type-system.ts
interface TypeDefinition {
  name: string;
  validValues: (value: unknown) => boolean;
  coerce: (value: unknown) => unknown;
  tsEquivalent: string;
  compatibleWith: string[];
}

const TYPE_REGISTRY: Map<string, TypeDefinition> = new Map([
  ['text', { ... }],
  ['number', { ... }],
  ['json', { ... }],
  ['boolean', { ... }],
]);
```

The semantic pass could attach resolved types to AST nodes, which the runtime uses directly rather than re-inferring.

---

## 8. Legacy Code Creating Maintenance Drag

**Locations:**
- `packages/runtime/src/runtime/types.ts:188-193` - deprecated `Variable` interface
- `packages/runtime/src/runtime/index.ts:1017-1026` - `RuntimeStatus` enum "for backward compatibility"
- `packages/runtime/src/runtime/types.ts:776-777` - `interpolate_template` instruction marked "DEPRECATED"
- `packages/runtime/src/runtime/index.ts:177` - `Runtime` class labeled "Legacy Runtime class"

**Problem:** Dead or deprecated code that is still exported and maintained:
- `Variable` interface is deprecated but still exported
- `RuntimeStatus` enum exists "for backward compatibility"
- `interpolate_template` instruction is "DEPRECATED, use interpolate_string" but still handled in the switch
- The `Runtime` class itself is labeled "Legacy Runtime class - convenience wrapper"

**Improvement:** If these are truly unused externally, remove them. If they're used by consumers (VS Code extension, debug-core), migrate those consumers and then remove. Dead code increases cognitive load when understanding the system.

---

## 9. Instruction Type is a Flat Union of 40+ Variants

**Location:** `packages/runtime/src/runtime/types.ts:715-811`

**Problem:** The `Instruction` type mixes fundamentally different concerns in one flat union:
- Execution: `exec_statement`, `exec_expression`, `exec_statements`
- Value building: `push_value`, `build_object`, `build_array`, `build_range`, `collect_args`
- Control flow: `if_branch`, `for_in_init`, `for_in_iterate`, `while_init`, `while_check`, `break_loop`
- AI operations: `ai_vibe`, `clear_prompt_context`
- Scoping: `enter_block`, `exit_block`, `push_frame`, `pop_frame`
- TypeScript: `ts_eval`, `call_imported_ts`, `interpolate_string`
- Tool operations: `exec_tool_declaration`, `declare_model`

**Improvement:** Group by category:

```typescript
type Instruction =
  | ExecutionInstruction    // exec_statement, exec_expression, exec_statements, literal
  | VariableInstruction     // declare_var, assign_var, destructure_assign
  | ControlFlowInstruction  // if_branch, for_in_*, while_*, break_loop, return_value, throw_error
  | ValueInstruction        // push_value, build_object, build_array, build_range, collect_args
  | OperatorInstruction     // binary_op, unary_op, index_access, slice_access, member_access
  | AIInstruction           // ai_vibe, interpolate_prompt_string, clear_prompt_context
  | ScopeInstruction        // enter_block, exit_block, push_frame, pop_frame, clear_async_context
  | FunctionInstruction     // call_function, call_imported_ts
  | TypeScriptInstruction   // ts_eval, interpolate_string, interpolate_template
  | ToolInstruction;        // exec_tool_declaration, declare_model, ai_tool_call_result
```

This makes it possible to add instruction middleware (e.g., debugging breakpoints for control flow only) and helps organize the dispatch.

---

## 10. `VibeValue` Conflates Variable Metadata with Value Semantics

**Location:** `packages/runtime/src/runtime/types.ts:40-51`

**Problem:** `VibeValue` combines:
- The actual data (`value`)
- Error state (`err`, `errDetails`)
- Variable metadata (`isConst`, `isPrivate`, `vibeType`)
- Origin tracking (`source`, `asyncOperationId`)
- AI operation results (`toolCalls`, `usage`)

This means simple operations like "get the number 5" carry all this baggage. Functions like `resolveValue` exist solely to unwrap this layer. Every value creation goes through `createVibeValue` with its options bag.

**Improvement:** Separate the value envelope from storage metadata:

```typescript
// The result of any operation (AI call, TS eval, expression)
interface VibeResult {
  value: unknown;
  err: boolean;
  errDetails: VibeError | null;
  toolCalls: ToolCallRecord[];
  usage?: ModelUsageRecord;
}

// How a result is stored in a variable
interface StoredVariable {
  result: VibeResult;
  isConst: boolean;
  isPrivate: boolean;
  vibeType: VibeType;
  source: ValueSource;
  asyncOperationId?: string;
}
```

This means non-variable values (intermediate expression results, function arguments) don't carry storage metadata, and the type system can distinguish "a value flowing through an expression" from "a value stored in a variable."

---

## Summary

| # | Issue | Effort | Impact on Extensibility |
|---|-------|--------|------------------------|
| 1 | Decompose RuntimeState | High | Very High - every new feature benefits |
| 2 | Deduplicate execution loops | Medium | High - one loop to maintain |
| 3 | Extract inline switch cases | Low | Medium - cleaner, testable |
| 4 | Fix PendingAsyncStart union | Low | Low - local improvement |
| 5 | Lazy context computation | Low | Medium - performance win |
| 6 | Split createVisitors | Medium | High - easier to add semantic checks |
| 7 | Shared type system | High | Very High - reduces "touch 5 files" problem |
| 8 | Remove legacy code | Low | Low - reduces noise |
| 9 | Group Instruction types | Low | Medium - organizational |
| 10 | Separate VibeValue concerns | High | High - cleaner value semantics |

### Recommended Priority Order

1. **Extract inline switch cases** (#3) - Low effort, immediate readability win
2. **Fix PendingAsyncStart union** (#4) - Low effort, better type safety
3. **Lazy context computation** (#5) - Low effort, performance improvement
4. **Remove legacy code** (#8) - Low effort, reduces noise
5. **Group Instruction types** (#9) - Low effort, organizational clarity
6. **Deduplicate execution loops** (#2) - Medium effort, high maintainability win
7. **Split createVisitors** (#6) - Medium effort, high extensibility win
8. **Separate VibeValue concerns** (#10) - High effort, cleaner semantics
9. **Decompose RuntimeState** (#1) - High effort, foundational improvement
10. **Shared type system** (#7) - High effort, eliminates multi-file type changes
