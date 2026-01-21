# Claude AI Assistant Instructions

This file contains instructions for Claude when working on this codebase.

## Project Overview

Vibe is a domain-specific language for AI agent orchestration, with a TypeScript runtime.

## Project Structure
```
src/
  tokens.ts    - Token types and keywords
  lexer.ts     - Tokenizer
  ast.ts       - AST node definitions
  parser.ts    - Recursive descent parser
  runtime.ts   - Execution engine with context/call stack tracking
  index.ts     - Entry point
```

## Screenshots

User screenshots are located at: `C:\Users\jerem\Pictures\Screenshots\`

Use `ls -lt` to find the most recent screenshot when the user references one.

## Lessons Learned

Review `auto-learning.md` at the project root for past mistakes and lessons learned. Pay attention to high-priority (P7+) entries to avoid repeating previous errors.

## Build Commands
```bash
bun run start              # Run the CLI
bun run dev                # Watch mode
bun run src/index.ts <file.vibe>  # Run a vibe program
```

## Test Commands
```bash
bun run test               # Unit tests only (~1s) - USE THIS
bun run test:integration   # Integration tests (real API calls, ~40s)
bun run test:all           # Everything

# Run a SINGLE test file (bypasses npm scripts, avoids running all tests)
bun test path/to/specific.test.ts
```

**Note:** `bun test` (without `run`) bypasses npm scripts. Use `bun test path/to/file.test.ts` to run a single specific test file. Never use bare `bun test` without a path - it runs ALL tests including slow integration tests.

### Integration Test Policy

**IMPORTANT:** Do NOT run the full integration test suite (`bun run test:integration` or `bun run test:all`) unless explicitly requested by the user.

- Integration tests make real API calls and cost money
- They are slow (~40s+) and should not be run routinely
- When verifying changes, run only:
  - `bun run test` for unit tests (fast, free)
  - A single targeted integration test if specifically relevant to current work
  - 1-2 integration tests as a smoke test if requested

Only run the full integration suite when the user explicitly asks for it.

---

## TypeScript Runtime Coding Standards

These rules apply when writing the TypeScript code that implements the Vibe runtime.

### Functional Programming Principles
- **Prefer Pure Functions**: No side effects, same input = same output
- **Use Immutable Patterns**: Array spread syntax, avoid mutations
- **Function Composition**: Break complex operations into smaller, composable functions

### Array Methods - Always Prefer Functional Approach
1. **`map`** - Transform each element
2. **`filter`** - Select elements matching criteria
3. **`flatMap`** - Transform and flatten (prefer over map + flat)
4. **`reduce`** - Accumulate to single value
5. **`find`** - Get first matching element
6. **`some`/`every`** - Boolean checks
7. **`forEach`** - Only when side effects are necessary

```typescript
// Good - Functional approach
const errors = items.flatMap(item => validateItem(item))
const names = users.map(user => user.name)
return [...selectErrors, ...duplicateErrors]

// Bad - Imperative loops
const errors = []
items.forEach(item => {
  const itemErrors = validateItem(item)
  errors.push(...itemErrors)
})
```

### Modern JavaScript/TypeScript Patterns
- **Optional Chaining**: `obj?.prop?.method?.()`
- **Nullish Coalescing**: `value ?? defaultValue`
- **Array Spread**: `[...array1, ...array2]`
- **Object Destructuring**: `const { name, value } = obj`
- **Guard Clauses / Early Returns**: Handle edge cases first, reduce nesting

### Guard Clause Style (Preferred)
Use guard clauses (early returns) instead of nested if-else statements. This reduces indentation, makes the "happy path" clearer, and improves readability.

```typescript
// Good - Guard clause style
function processUser(user: User | null): Result {
  if (!user) {
    return { error: 'No user provided' };
  }
  if (!user.isActive) {
    return { error: 'User is inactive' };
  }
  if (!user.hasPermission) {
    return { error: 'User lacks permission' };
  }

  // Happy path - main logic at lowest indentation
  return { value: doSomething(user) };
}

// Bad - Nested if-else
function processUser(user: User | null): Result {
  if (user) {
    if (user.isActive) {
      if (user.hasPermission) {
        return { value: doSomething(user) };
      } else {
        return { error: 'User lacks permission' };
      }
    } else {
      return { error: 'User is inactive' };
    }
  } else {
    return { error: 'No user provided' };
  }
}
```

```typescript
// Good patterns
b.fields?.forEach(field => processField(field))
const blocks = fieldToBlocks.get(field) ?? []
const { fields, fieldToBlocks } = getAvailableFields(block)
```

### Function Declaration Style
- **Prefer Function Declarations**: Use `function foo() {}` over `const foo = () => {}`
- **Benefits**: Hoisting, clearer intent, better debugging, consistent style
- **Exception**: Use arrow functions for callbacks, array methods, and inline functions

```typescript
// Good - Function declarations for named functions
function validateFields(block: CTEBlock): string[] {
   return block.def.select?.flatMap(item => validateItem(item)) ?? []
}

// Good - Arrow functions for callbacks and array methods
const errors = items.flatMap(item => validateItem(item))

// Bad - Arrow function variables for named functions
const validateFields = (block: CTEBlock): string[] => {
   return block.def.select?.flatMap(item => validateItem(item)) ?? []
}
```

### Function Design Rules
- **Single Responsibility**: Each function does one thing well
- **Extract Helper Functions**: Move complex logic to well-named pure functions
- **Use Type Guards**: Narrow types with proper checks
- **Declarative over Imperative**: Show intent, not implementation steps

### Error Handling
- **Functional Error Collection**: Use `flatMap` to collect errors
- **Early Returns**: Exit early from invalid states
- **Pure Error Functions**: Return error arrays, don't throw when possible

### Performance Guidelines
- Use `Set` for uniqueness checks
- Use `Map` for key-value relationships
- Prefer `flatMap` over `map().flat()`
- Use appropriate data structures for the use case

### Async Operations in Loops

Use traditional `for` loops for sequential async operations:

```typescript
// Good - Sequential async operations
for (const item of items) {
  await processItemAsync(item)
}

// Bad - forEach with async doesn't wait
items.forEach(async item => {
  await processItemAsync(item)
})
```

Use `Promise.all()` for parallel async operations:

```typescript
const results = await Promise.all(
  items.map(async item => await processItemAsync(item))
)
```

### When to Break These Rules
- Performance-critical code (document why)
- Third-party library integration requirements
- Async operations requiring sequential execution (use traditional for loops)

Remember: The goal is readable, maintainable, and correct code.

---

## Testing Standards

### Prefer Complete Value Assertions Over Point Checks

When testing data structures like context arrays, state objects, or formatted output, prefer asserting the **entire value** rather than individual point checks. This catches unexpected fields, ordering issues, and ensures comprehensive coverage.

```typescript
// Good - Verify the complete structure
expect(state.localContext).toEqual([
  { name: 'API_KEY', value: 'secret', type: null, isConst: true },
  { name: 'counter', value: '0', type: null, isConst: false },
  { name: 'm', value: "test" },
]);

// Bad - Point checks miss structural issues
expect(state.localContext.some(v => v.name === 'API_KEY')).toBe(true);
expect(state.localContext.find(v => v.name === 'API_KEY')?.isConst).toBe(true);
```

### When Point Checks Are Acceptable
- When only a specific field matters and the rest is implementation detail
- When the structure is very large and only a subset is relevant to the test
- When testing error conditions or status flags
