# Plan: Type Checking for TS Function Arguments and ts() Block Parameters

## Goal
Add **compile-time** type checking (in semantic analyzer) for:
1. **Imported TS functions** - validate Vibe argument types against TS parameter types at call sites
2. **ts() blocks** - verify parameter types match how they're used in the TypeScript code

## Current State
- **Imported TS functions**: No type info - semantic analyzer doesn't know TS signatures
- **ts() blocks**: AST is `{ params: string[], body: string }` - no type validation
- **Existing infrastructure**: `ts-schema.ts` has TypeScript compiler API (used for tool schemas)
- **Semantic analyzer**: Already validates Vibe function calls, just needs TS extension

## Implementation Phases

### Phase 1: TS Signature Extraction Utility
**New file: `packages/runtime/src/semantic/ts-signatures.ts`**

Extract function signatures from TS files at compile time:
```typescript
interface TsFunctionSignature {
  name: string;
  params: Array<{ name: string; tsType: string; optional: boolean }>;
  returnType: string;
}

// Cache to avoid re-parsing same file
const signatureCache = new Map<string, Map<string, TsFunctionSignature>>();

function extractFunctionSignatures(sourceFile: string): Map<string, TsFunctionSignature>
function extractFunctionSignature(sourceFile: string, funcName: string): TsFunctionSignature | undefined
```

Reuse pattern from `ts-schema.ts`:
- `ts.createProgram()` to parse the file
- `checker.getSignaturesOfType()` to get function signatures
- Cache results per file path

### Phase 2: Extend Semantic Analyzer for TS Imports
**Modify: `packages/runtime/src/semantic/analyzer.ts`**

Track TS import signatures in analyzer state:
```typescript
private tsImportSignatures: Map<string, TsFunctionSignature> = new Map();

// In visitImportDeclaration for TS imports:
private visitTsImport(node: AST.ImportDeclaration): void {
  const sourcePath = resolveImportPath(node.source, this.basePath);
  for (const spec of node.specifiers) {
    const sig = extractFunctionSignature(sourcePath, spec.imported);
    if (sig) {
      this.tsImportSignatures.set(spec.local, sig);
    }
  }
}
```

### Phase 3: Validate TS Function Calls at Compile Time
**Modify: `packages/runtime/src/semantic/analyzer.ts`**

In `visitCallExpression()`, check if callee is an imported TS function:
```typescript
private visitCallExpression(node: AST.CallExpression): void {
  const calleeName = node.callee.type === 'Identifier' ? node.callee.name : null;

  // Check if it's a TS import
  const tsSig = this.tsImportSignatures.get(calleeName);
  if (tsSig) {
    this.validateTsCall(node, tsSig);
  }
  // ... existing validation
}

private validateTsCall(node: AST.CallExpression, sig: TsFunctionSignature): void {
  // Check argument count
  const requiredParams = sig.params.filter(p => !p.optional).length;
  if (node.arguments.length < requiredParams) {
    this.error(`Function '${sig.name}' requires ${requiredParams} arguments, got ${node.arguments.length}`, node.location);
  }

  // Check argument types where known
  for (let i = 0; i < node.arguments.length && i < sig.params.length; i++) {
    const argType = this.inferExpressionType(node.arguments[i]);
    const paramType = sig.params[i].tsType;
    if (argType && !isTypeCompatible(argType, paramType)) {
      this.error(`Argument ${i+1} of '${sig.name}': expected ${paramType}, got ${argType}`, node.arguments[i].location);
    }
  }
}
```

### Phase 4: ts() Block Type Checking at Compile Time
**Modify: `packages/runtime/src/semantic/analyzer.ts`**

In `visitTsBlock()`, generate virtual TS and check for errors:
```typescript
private visitTsBlock(node: AST.TsBlock): void {
  // Collect parameter types from symbol table
  const params: Array<{ name: string; vibeType: string | null }> = [];
  for (const paramName of node.params) {
    const symbol = this.symbols.lookup(paramName);
    if (!symbol) {
      this.error(`'${paramName}' is not defined`, node.location);
      continue;
    }
    params.push({ name: paramName, vibeType: symbol.typeAnnotation });
  }

  // Type-check the block
  const errors = checkTsBlockTypes(params, node.body, node.location);
  for (const err of errors) {
    this.error(err.message, err.location);
  }
}
```

**New file: `packages/runtime/src/semantic/ts-block-checker.ts`**

```typescript
function checkTsBlockTypes(
  params: Array<{ name: string; vibeType: string | null }>,
  body: string,
  blockLocation: SourceLocation
): SemanticError[] {
  // Generate virtual TS function
  const paramList = params.map(p => {
    const tsType = vibeTypeToTsType(p.vibeType);
    return `${p.name}: ${tsType}`;
  }).join(', ');

  const virtualCode = `function __tsBlock(${paramList}) {\n${body}\n}`;

  // Compile and collect diagnostics
  const program = ts.createProgram(/* in-memory source */);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  // Map error locations back to original .vibe file
  return diagnostics.map(d => mapDiagnosticLocation(d, blockLocation));
}
```

## Type Mapping (Vibe → TypeScript)

| Vibe Type | TypeScript Type |
|-----------|-----------------|
| `text` | `string` |
| `prompt` | `string` |
| `number` | `number` |
| `boolean` | `boolean` |
| `json` | `any` |
| `null` | `null \| undefined` |
| `text[]` | `string[]` |
| `json[]` | `any[]` |
| (untyped) | `any` |

## Error Message Format
```
Semantic error at main.vibe:15:10
  Argument 1 of 'multiply': expected number, got text

  15 | let result = multiply(name, count)
     |                       ~~~~
```

## Files to Modify/Create

| File | Action |
|------|--------|
| `semantic/ts-signatures.ts` | **Create** - extract TS function signatures |
| `semantic/ts-block-checker.ts` | **Create** - type-check ts() block bodies |
| `semantic/analyzer.ts` | **Modify** - validate TS calls and ts() blocks |

## Limitations

- **Dynamic types**: If a Vibe variable has no type annotation, we can't check it at compile time
- **AI return values**: Types from `do`/`vibe` expressions may not be known until runtime
- **Complex TS types**: Generic types, conditional types may not map cleanly

## Testing Strategy

1. **Unit tests** for `ts-signatures.ts` - signature extraction from various TS patterns
2. **Unit tests** for `ts-block-checker.ts` - virtual compilation and error mapping
3. **Semantic tests** - error detection for type mismatches
4. **Existing test update** - `ts-import/main.vibe` fixture should now produce errors

## Verification
1. Run `bun run test` - all existing tests pass (may need to fix fixtures)
2. Add new test file `semantic/test/ts-type-checking.test.ts`
3. Test scenarios:
   - `let x: text = "hi"; add(x, 5)` → error (text vs number)
   - `let x: number = 5; add(x, 5)` → no error
   - `let x: text = "hi"; ts(x) { return x * 2 }` → error from TS compiler
   - Untyped variables → no error (can't check)
   - Optional params → handled correctly
