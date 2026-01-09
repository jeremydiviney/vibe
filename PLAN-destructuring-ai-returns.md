# Multi-Value AI Returns with Destructuring

## Overview

Add support for destructuring assignments with typed fields from AI calls:

```vibe
const {name: text, age: number, active: boolean} = do "Get user info for Alice" model default
// name = "Alice", age = 30, active = true
```

The AI infers what values to return based on field names + prompt. Per-field return tools are generated dynamically at runtime.

## Design Decisions

1. **All fields must have explicit types** - `{name: text, age: number}` not `{name, age}`
2. **Implicit field inference** - AI infers values from field names + prompt context
3. **Per-field return tools** - Generate `__vibe_return_<fieldname>` tool for each field
4. **Prompt enhancement** - Append instruction listing required tool calls

## Syntax

```vibe
// Basic destructuring from do (single-round)
const {name: text, age: number} = do "Get user info" model default

// Destructuring from vibe (multi-round with tools)
const {summary: text, score: number} = vibe "Analyze this code" model default

// Nested not supported initially (keep it simple)
// const {user: {name: text}} = do "..."  // NOT SUPPORTED
```

## Implementation

### Phase 1: AST Changes

**File: `src/ast/index.ts`**

Add new AST node for destructuring pattern:

```typescript
/** A single field in a destructuring pattern */
export interface DestructuringField {
  name: string;           // Field name to extract
  type: string;           // Required type: 'text', 'number', 'boolean', 'json', arrays
}

/** Destructuring declaration: const {a: text, b: number} = expr */
export interface DestructuringDeclaration extends BaseNode {
  type: 'DestructuringDeclaration';
  fields: DestructuringField[];
  initializer: Expression;
  isConst: boolean;       // true for const, false for let
}
```

Add to Statement union type.

### Phase 2: Lexer Changes

**File: `src/tokens.ts`**

No new tokens needed - we already have:
- `LBrace`, `RBrace` for `{ }`
- `Colon` for `:`
- `Comma` for `,`
- Type tokens: `TextType`, `NumberType`, `BooleanType`, `JsonType`

### Phase 3: Parser Changes

**File: `src/parser/rules.ts`**

Add grammar rule for destructuring pattern:

```typescript
// Destructuring field: identifier : type
$.RULE('destructuringField', () => {
  $.CONSUME(Identifier);
  $.CONSUME(Colon);
  $.SUBRULE($.typeAnnotation);
});

// Destructuring pattern: { field, field, ... }
$.RULE('destructuringPattern', () => {
  $.CONSUME(LBrace);
  $.AT_LEAST_ONE_SEP({
    SEP: Comma,
    DEF: () => $.SUBRULE($.destructuringField),
  });
  $.CONSUME(RBrace);
});

// Update constDeclaration to allow destructuring
// const { name: text, age: number } = expression
// OR
// const identifier : type = expression
$.RULE('constDeclaration', () => {
  $.CONSUME(Const);
  $.OR([
    { ALT: () => {
      $.SUBRULE($.destructuringPattern);
      $.CONSUME(Equals);
      $.SUBRULE($.expression);
    }},
    { ALT: () => {
      // existing: const identifier : type = expression
      $.CONSUME(Identifier);
      $.OPTION(() => $.SUBRULE($.typeAnnotation));
      $.CONSUME2(Equals);
      $.SUBRULE2($.expression);
    }},
  ]);
});
```

**File: `src/parser/visitor.ts`**

Add visitor methods:

```typescript
destructuringField(ctx): AST.DestructuringField {
  return {
    name: ctx.Identifier[0].image,
    type: this.visit(ctx.typeAnnotation),
  };
}

destructuringPattern(ctx): AST.DestructuringField[] {
  return ctx.destructuringField.map(f => this.visit(f));
}

// Update constDeclaration visitor to handle both cases
constDeclaration(ctx): AST.ConstDeclaration | AST.DestructuringDeclaration {
  if (ctx.destructuringPattern) {
    return {
      type: 'DestructuringDeclaration',
      fields: this.visit(ctx.destructuringPattern),
      initializer: this.visit(ctx.expression),
      isConst: true,
      location: tokenLocation(ctx.Const[0]),
    };
  }
  // existing simple const declaration
  return { ... };
}
```

### Phase 4: Semantic Validation

**File: `src/semantics/visitor.ts`**

Add validation for DestructuringDeclaration:

```typescript
DestructuringDeclaration(node: AST.DestructuringDeclaration) {
  // Validate each field has a valid type
  for (const field of node.fields) {
    if (!isValidType(field.type)) {
      this.error(`Invalid type '${field.type}' for field '${field.name}'`, node);
    }
  }

  // Validate initializer is a do/vibe expression
  if (node.initializer.type !== 'DoExpression' && node.initializer.type !== 'VibeExpression') {
    this.error('Destructuring assignment requires a do or vibe expression', node);
  }

  // Check for duplicate field names
  const names = new Set<string>();
  for (const field of node.fields) {
    if (names.has(field.name)) {
      this.error(`Duplicate field '${field.name}' in destructuring pattern`, node);
    }
    names.add(field.name);
  }

  // Register variables in scope
  for (const field of node.fields) {
    this.declareVariable(field.name, node.isConst, field.type);
  }
}
```

### Phase 5: Runtime - Per-Field Return Tools

**File: `src/runtime/ai/return-tools.ts`**

Add function to create per-field return tools:

```typescript
export interface DestructuringField {
  name: string;
  type: TargetType;  // 'text' | 'number' | 'boolean' | 'json' | arrays
}

/**
 * Create return tools for each field in a destructuring pattern.
 * Each tool is named __vibe_return_<fieldname> with appropriate type validation.
 *
 * Example: {name: text, age: number} generates:
 *   - __vibe_return_name (validates text)
 *   - __vibe_return_age (validates number)
 */
export function createFieldReturnTools(fields: DestructuringField[]): VibeToolValue[] {
  return fields.map(field => createFieldReturnTool(field.name, field.type));
}

function createFieldReturnTool(fieldName: string, fieldType: TargetType): VibeToolValue {
  const toolName = `__vibe_return_${fieldName}`;

  return {
    __vibeTool: true,
    name: toolName,
    schema: {
      name: toolName,
      description: `Return the ${fieldType} value for '${fieldName}'.`,
      parameters: [{
        name: 'value',
        type: vibeTypeToJsonSchema(fieldType),
        description: `The ${fieldType} value to return for ${fieldName}`,
        required: true,
      }],
    },
    executor: async (args) => {
      const value = args.value;
      validateFieldValue(value, fieldType, fieldName);
      return { fieldName, value };  // Return tagged with field name
    },
  };
}

function validateFieldValue(value: unknown, type: TargetType, fieldName: string): void {
  // Reuse existing validation logic from individual return tools
  switch (type) {
    case 'text':
      if (typeof value !== 'string') {
        throw new Error(`'${fieldName}' expected text, got ${typeof value}: ${JSON.stringify(value)}`);
      }
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`'${fieldName}' expected number, got ${typeof value}: ${JSON.stringify(value)}`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(`'${fieldName}' expected boolean, got ${typeof value}: ${JSON.stringify(value)}`);
      }
      break;
    case 'json':
      if (typeof value !== 'object' || value === null) {
        throw new Error(`'${fieldName}' expected json object, got ${typeof value}`);
      }
      break;
    case 'text[]':
      if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
        throw new Error(`'${fieldName}' expected text[], got invalid value`);
      }
      break;
    case 'number[]':
      if (!Array.isArray(value) || !value.every(v => typeof v === 'number' && Number.isFinite(v))) {
        throw new Error(`'${fieldName}' expected number[], got invalid value`);
      }
      break;
    case 'boolean[]':
      if (!Array.isArray(value) || !value.every(v => typeof v === 'boolean')) {
        throw new Error(`'${fieldName}' expected boolean[], got invalid value`);
      }
      break;
    case 'json[]':
      if (!Array.isArray(value) || !value.every(v => typeof v === 'object' && v !== null)) {
        throw new Error(`'${fieldName}' expected json[], got invalid value`);
      }
      break;
  }
}

function vibeTypeToJsonSchema(type: TargetType): JsonSchema {
  switch (type) {
    case 'text': return { type: 'string' };
    case 'number': return { type: 'number' };
    case 'boolean': return { type: 'boolean' };
    case 'json': return { type: 'object' };
    case 'text[]': return { type: 'array', items: { type: 'string' } };
    case 'number[]': return { type: 'array', items: { type: 'number' } };
    case 'boolean[]': return { type: 'array', items: { type: 'boolean' } };
    case 'json[]': return { type: 'array', items: { type: 'object' } };
    default: return { type: 'string' };
  }
}

/**
 * Check if a tool name is a field return tool (starts with __vibe_return_ but isn't a type tool).
 */
export function isFieldReturnTool(toolName: string): boolean {
  return toolName.startsWith('__vibe_return_') && !isReturnToolCall(toolName);
}

/**
 * Extract field name from a field return tool name.
 */
export function getFieldNameFromTool(toolName: string): string {
  return toolName.replace('__vibe_return_', '');
}
```

### Phase 6: Runtime - Execution

**File: `src/runtime/exec/statements.ts`**

Add execution for DestructuringDeclaration:

```typescript
export function execDestructuringDeclaration(
  state: RuntimeState,
  stmt: AST.DestructuringDeclaration
): RuntimeState {
  // Push instructions:
  // 1. Execute the initializer (do/vibe expression)
  // 2. Destructure the result into individual variables
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: stmt.initializer, location: stmt.initializer.location },
      {
        op: 'destructure_assign',
        fields: stmt.fields,
        isConst: stmt.isConst,
        location: stmt.location
      },
      ...state.instructionStack,
    ],
  };
}
```

**File: `src/runtime/exec/variables.ts`**

Add destructure_assign instruction handler:

```typescript
export function execDestructureAssign(
  state: RuntimeState,
  fields: DestructuringField[],
  isConst: boolean,
  location: SourceLocation
): RuntimeState {
  const value = state.lastResult as Record<string, unknown>;

  // Validate we got an object
  if (typeof value !== 'object' || value === null) {
    throw new RuntimeError(
      `Destructuring expected object, got ${typeof value}`,
      location
    );
  }

  // Assign each field to a variable
  let newState = state;
  for (const field of fields) {
    const fieldValue = value[field.name];
    if (fieldValue === undefined) {
      throw new RuntimeError(
        `Missing field '${field.name}' in destructured value`,
        location
      );
    }
    newState = execDeclareVar(newState, field.name, isConst, field.type, fieldValue, location);
  }

  return newState;
}
```

### Phase 7: AI Provider Integration

**File: `src/runtime/ai-provider.ts`**

Detect destructuring target and generate dynamic tool:

```typescript
// In createRealAIProvider execute function:

// Check if this is a destructuring assignment
const destructuringFields = getDestructuringFields(state);

if (destructuringFields) {
  // Generate dynamic return tool
  const objectReturnTool = createObjectReturnTool(destructuringFields);
  allTools.push(objectReturnTool);

  // Build prompt instruction
  const fieldList = destructuringFields
    .map(f => `${f.name} (${f.type})`)
    .join(', ');
  finalPrompt = `${prompt}\n\nIMPORTANT: You MUST call the ${RETURN_OBJECT_TOOL} tool with: ${fieldList}. Do not respond with plain text.`;

  // Set expected return tool
  expectedReturnTool = RETURN_OBJECT_TOOL;
}

function getDestructuringFields(state: RuntimeState): ObjectReturnField[] | null {
  // Look for destructure_assign in instruction stack
  const nextInstruction = state.instructionStack[0];
  if (nextInstruction?.op === 'destructure_assign') {
    return nextInstruction.fields;
  }
  return null;
}
```

### Phase 8: Step Execution

**File: `src/runtime/step.ts`**

Add case for DestructuringDeclaration in step function:

```typescript
case 'DestructuringDeclaration':
  return execDestructuringDeclaration(state, stmt);
```

Add case for destructure_assign instruction:

```typescript
case 'destructure_assign':
  return execDestructureAssign(state, instruction.fields, instruction.isConst, instruction.location);
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/ast/index.ts` | Add `DestructuringField`, `DestructuringDeclaration` types |
| `src/parser/rules.ts` | Add `destructuringField`, `destructuringPattern` rules; update `constDeclaration` |
| `src/parser/visitor.ts` | Add visitor methods for new rules |
| `src/semantics/visitor.ts` | Add validation for `DestructuringDeclaration` |
| `src/runtime/types.ts` | Add `destructure_assign` instruction type |
| `src/runtime/exec/statements.ts` | Add `execDestructuringDeclaration` |
| `src/runtime/exec/variables.ts` | Add `execDestructureAssign` |
| `src/runtime/step.ts` | Handle new statement and instruction types |
| `src/runtime/ai/return-tools.ts` | Add `createObjectReturnTool`, `RETURN_OBJECT_TOOL` |
| `src/runtime/ai-provider.ts` | Detect destructuring, generate dynamic tool |

## Example Flow

```vibe
const {name: text, age: number} = do "Get info for user Alice" model default
```

1. **Parser** creates `DestructuringDeclaration` with fields `[{name: "name", type: "text"}, {name: "age", type: "number"}]`

2. **Semantic validation** checks types are valid, no duplicates

3. **Runtime** pushes instructions: `exec_expression` (do), `destructure_assign` (fields)

4. **AI Provider** sees `destructure_assign` coming next, generates tool:
   ```json
   {
     "name": "__vibe_return_object",
     "parameters": [
       {"name": "name", "type": {"type": "string"}},
       {"name": "age", "type": {"type": "number"}}
     ]
   }
   ```

5. **Prompt** becomes:
   ```
   Get info for user Alice

   IMPORTANT: You MUST call the __vibe_return_object tool with: name (text), age (number). Do not respond with plain text.
   ```

6. **AI** calls `__vibe_return_object({name: "Alice", age: 30})`

7. **Tool executor** validates types, returns `{name: "Alice", age: 30}`

8. **destructure_assign** creates variables: `name = "Alice"`, `age = 30`

## Testing Strategy

### Unit Tests

1. **Parser tests** - Parse destructuring patterns correctly
2. **Semantic tests** - Validate types, catch duplicates, require do/vibe
3. **Return tool tests** - Dynamic tool creation, field validation
4. **Runtime tests** - Destructure_assign extracts fields correctly

### Integration Tests

```vibe
model m = { name: "gemini-3-flash-preview", apiKey: env("GOOGLE_API_KEY"), provider: "google" }

// Basic destructuring
const {name: text, age: number} = do "Get info for a person named Bob who is 25 years old" m default
assert(name == "Bob")
assert(age == 25)

// Boolean field
const {valid: boolean, reason: text} = do "Is 5 > 3? Return valid (true/false) and reason" m default
assert(valid == true)

// Array field
const {colors: text[], count: number} = do "List 3 primary colors and their count" m default
assert(count == 3)
assert(colors.length == 3)
```

## Verification Steps

1. `bun run test` - All unit tests pass
2. `bun tsc --noEmit` - No TypeScript errors
3. Run integration tests with at least one provider
4. Manual test with simple destructuring example

## Out of Scope

- Nested destructuring: `const {user: {name: text}} = ...`
- Array destructuring: `const [a, b] = ...`
- Default values: `const {name: text = "default"} = ...`
- Rest patterns: `const {name: text, ...rest} = ...`
- let destructuring (start with const only, add let later if needed)
