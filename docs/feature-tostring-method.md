# Plan: toString() Method

## Overview
Add `toString()` method for explicit type coercion from non-string types to text.

## Syntax
```vibe
let num: number = 42
let str: text = num.toString()

let flag: boolean = true
let flagStr: text = flag.toString()

let data: json = { name: "Alice" }
let jsonStr: text = data.toString()  // JSON.stringify
```

## Implementation

### 1. Parser
Add member expression support for `.toString()`:
- Already have member access for `.toolCalls` etc.
- Add `toString` as a special method call

### 2. AST
Use existing `MemberExpression` or add `MethodCallExpression`:
```typescript
export interface MethodCallExpression extends BaseNode {
  type: 'MethodCallExpression';
  object: Expression;
  method: string;
  arguments: Expression[];
}
```

### 3. Semantic Analyzer
- Validate `toString()` is called on supported types
- Infer return type as `text`

### 4. Runtime
In expression evaluation, handle toString:
```typescript
case 'MethodCallExpression':
  if (node.method === 'toString') {
    const obj = await evaluateExpression(node.object, state);
    if (typeof obj.value === 'object') {
      return vibeValue(JSON.stringify(obj.value), 'text');
    }
    return vibeValue(String(obj.value), 'text');
  }
```

## Files to Modify
- `packages/runtime/src/parser/tokens.ts` (if needed)
- `packages/runtime/src/ast.ts`
- `packages/runtime/src/parser/index.ts`
- `packages/runtime/src/parser/visitor.ts`
- `packages/runtime/src/semantic/analyzer-validators.ts`
- `packages/runtime/src/runtime/expressions.ts`

## Tests
- `(42).toString()` → "42"
- `true.toString()` → "true"
- `false.toString()` → "false"
- `{a:1}.toString()` → '{"a":1}'
- `null.toString()` → "" or "null" (decide)
- Type inference: `let x = num.toString()` infers text

## Future Considerations
- Other methods: `toNumber()`, `toJson()`, `toBoolean()`
- Array methods: `arr.length`, `arr.join(",")`

## Verification
```bash
bun test packages/runtime/src/parser/test/tostring.test.ts
bun test packages/runtime/src/runtime/test/tostring.test.ts
bun run test
```
