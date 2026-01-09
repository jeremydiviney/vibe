# Plan: Structured Multi-Value AI Returns

## Overview

Enable AI calls to return structured objects with multiple named fields, using provider-native **structured outputs** (JSON Schema) to ensure reliable, type-safe responses.

**Target Syntax:**
```vibe
// Destructuring with inline types - creates typed variables, uses structured output
const {name: text, age: number} = do "get the user's info"
print(name)   // "Alice"
print(age)    // 30

// Nested objects
const {user: {name: text, id: number}, total: number} = do "get user data"
print(user.name)  // nested access

// No type annotation - returns plain json object (no schema enforcement)
const person = do "get the user's info"
print(person.name)  // works, but no type safety
```

## How It Works (Reliability via Structured Outputs)

All three providers support **native structured output** via JSON Schema:

| Provider | Mechanism | Reliability |
|----------|-----------|-------------|
| **OpenAI** | `response_format: { type: 'json_schema', json_schema: {...} }` with `strict: true` | Guaranteed schema compliance |
| **Anthropic** | `output_format: { type: 'json_schema', schema: {...} }` (Claude 4.5) | Guaranteed schema compliance |
| **Google** | `responseMimeType: 'application/json'` + `responseSchema` | Schema-guided generation |

**Flow:**
1. Parse object type annotation → extract field names and types
2. Convert to JSON Schema: `{name: text, age: number}` → `{"type":"object","properties":{"name":{"type":"string"},"age":{"type":"integer"}},"required":["name","age"]}`
3. Pass schema to provider's structured output API
4. Provider guarantees response matches schema
5. Parse JSON response and assign to variables

## Implementation Plan

### Phase 1: Destructuring Pattern AST

**Files:** `src/ast/index.ts`

Add new AST nodes for destructuring patterns with inline types:

```typescript
// Destructuring pattern with inline types
interface ObjectPattern {
  type: 'ObjectPattern';
  properties: ObjectPatternProperty[];
}

interface ObjectPatternProperty {
  type: 'ObjectPatternProperty';
  key: string;                           // field name to extract
  typeAnnotation: string;                // 'text', 'number', etc.
  nestedPattern?: ObjectPattern;         // for nested: {user: {name: text}}
}

// Update declarations to support patterns
interface LetDeclaration {
  name: string | ObjectPattern;          // Was: string only
  typeAnnotation: string | null;         // Keep for simple types
  initializer: Expression | null;
}

interface ConstDeclaration {
  name: string | ObjectPattern;          // Was: string only
  typeAnnotation: string | null;
  initializer: Expression;
}
```

### Phase 2: Parser - Destructuring Syntax

**Files:** `src/parser/index.ts`, `src/parser/visitor.ts`

Add grammar rules for destructuring:

```
declaration = (let | const) (Identifier | objectPattern) (: typeAnnotation)? = expression

objectPattern = { objectPatternProperty (, objectPatternProperty)* }
objectPatternProperty = Identifier : (typeKeyword | objectPattern)

typeKeyword = text | number | boolean | json
```

**Key insight:** After `:` in pattern, if next token is a type keyword → type annotation. This disambiguates from JS rename syntax.

```vibe
const {name: text}     // text is type keyword → type annotation
const {name: userName} // userName is identifier → rename (future, error for now)
```

### Phase 3: Schema Generation from Pattern

**File:** `src/runtime/ai/schema.ts`

Convert destructuring pattern to JSON Schema:

```typescript
function patternToSchema(pattern: ObjectPattern): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const prop of pattern.properties) {
    if (prop.nestedPattern) {
      // Nested object: {user: {name: text}}
      properties[prop.key] = patternToSchema(prop.nestedPattern);
    } else {
      // Simple field: {name: text}
      properties[prop.key] = typeToSchema(prop.typeAnnotation);
    }
    required.push(prop.key);
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false
  };
}
```

**Example:**
```vibe
const {name: text, age: number} = do "..."
```
Generates:
```json
{
  "type": "object",
  "properties": {
    "name": {"type": "string"},
    "age": {"type": "integer"}
  },
  "required": ["name", "age"],
  "additionalProperties": false
}
```

### Phase 4: Runtime Execution

**Files:** `src/runtime/exec/statements.ts`, `src/runtime/exec/ai.ts`

Execute destructuring assignment:

```typescript
function execDestructuringDeclaration(
  state: RuntimeState,
  pattern: ObjectPattern,
  value: Record<string, unknown>,
  isConst: boolean
): RuntimeState {
  for (const prop of pattern.properties) {
    const fieldValue = value[prop.key];

    if (prop.nestedPattern) {
      // Recursively destructure nested objects
      state = execDestructuringDeclaration(
        state, prop.nestedPattern, fieldValue as Record<string, unknown>, isConst
      );
    } else {
      // Create variable for this field
      state = declareVariable(state, prop.key, fieldValue, isConst);
    }
  }
  return state;
}
```

### Phase 5: Wire Up AI Call with Schema

**Files:** `src/runtime/exec/ai.ts`, `src/runtime/types.ts`

When executing AI call with destructuring pattern:

1. Extract pattern from pending declaration
2. Convert pattern to JSON Schema via `patternToSchema()`
3. Pass schema to AI provider (structured output)
4. Parse JSON response
5. Execute destructuring to create variables

```typescript
// In ai_vibe instruction handler
if (pendingDeclaration?.pattern) {
  const schema = patternToSchema(pendingDeclaration.pattern);
  // Pass schema to AI provider for structured output
  state.pendingAI.outputSchema = schema;
}
```

### Phase 6: Provider Integration

**Files:** `src/runtime/ai/providers/*.ts`

Providers already support structured output - just ensure schema flows through:

- **OpenAI**: `response_format.json_schema.schema = outputSchema`
- **Anthropic**: `output_format.schema = outputSchema`
- **Google**: `responseSchema = outputSchema`

Likely minimal changes needed - schema just needs to be passed through existing infrastructure.

## File Changes Summary

| File | Changes |
|------|---------|
| `src/ast/index.ts` | Add `ObjectPattern`, `ObjectPatternProperty`, update declarations |
| `src/parser/index.ts` | Add `objectPattern` rule, GATE for `{` disambiguation |
| `src/parser/visitor.ts` | Add pattern visitor methods |
| `src/semantic/analyzer.ts` | Validate pattern types, register destructured variables |
| `src/runtime/ai/schema.ts` | Add `patternToSchema()` function |
| `src/runtime/ai/types.ts` | Add `outputSchema` to `PendingAI` |
| `src/runtime/exec/statements.ts` | Add destructuring execution logic |
| `src/runtime/exec/ai.ts` | Wire pattern schema to AI call |

## Verification Plan

### Unit Tests
1. Parser correctly parses `{name: text, age: number}` type annotations
2. Schema generation produces valid JSON Schema from object types
3. Nested object types work: `{user: {name: text}}`
4. Array of objects: `{name: text}[]`

### Integration Tests
```vibe
// Test 1: Basic structured return
model m = { name: "gemini-3-flash-preview", provider: "google", apiKey: env("GOOGLE_API_KEY") }
const person: {name: text, age: number} = do "Return a person named Alice who is 30" m default
assert(person.name == "Alice")
assert(person.age == 30)

// Test 2: Nested objects
const data: {user: {name: text}, count: number} = do "Return user Bob with count 5" m default
assert(data.user.name == "Bob")
assert(data.count == 5)

// Test 3: With destructuring (Phase 5)
const {x, y}: {x: number, y: number} = do "Return coordinates x=10, y=20" m default
assert(x == 10)
assert(y == 20)
```

### Manual Verification
1. Run integration test with each provider (OpenAI, Anthropic, Google)
2. Verify structured output is used (check AI logs for schema in request)
3. Confirm no prompt-based type instructions when using structured output

## Implementation Order

1. **Phase 1-2**: AST and Parser for object types (~2 files)
2. **Phase 3**: Schema generation (~1 file)
3. **Phase 4**: Verify providers work (likely no changes needed)
4. **Test**: Integration tests with all 3 providers
5. **Phase 5-6**: Destructuring syntax (optional, can defer)

## Open Questions

1. **Optional fields?** Should we support `{name: text, age?: number}`?
   - Recommendation: Start with all-required, add optional later

2. **Arrays of objects?** `const items: {name: text}[] = do "..."`
   - Would need array + object pattern syntax
   - Recommendation: Defer, use `json[]` for now

3. **Rename syntax?** `const {name as userName: text} = do "..."`
   - Useful for avoiding variable name conflicts
   - Recommendation: Defer to future enhancement
