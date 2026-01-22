---
title: Syntax Reference
description: Complete syntax reference for Vibe
---

## Keywords

### Declaration Keywords

| Keyword | Description |
|---------|-------------|
| `let` | Declare mutable variable |
| `const` | Declare immutable constant |
| `function` | Declare function |
| `tool` | Declare AI-callable tool |
| `model` | Declare AI model configuration |
| `type` | Declare structural type |
| `export` | Export declaration |
| `import` | Import from module |
| `from` | Specify import source |

### Control Flow Keywords

| Keyword | Description |
|---------|-------------|
| `if` | Conditional statement |
| `else` | Else clause |
| `for` | For-in loop |
| `in` | Loop iterator |
| `while` | While loop |
| `break` | Exit innermost loop |
| `return` | Return from function |

### AI Keywords

| Keyword | Description |
|---------|-------------|
| `do` | Single-turn AI call |
| `vibe` | Multi-turn AI with tools |

### Modifiers

| Keyword | Description |
|---------|-------------|
| `async` | Asynchronous execution |
| `private` | Hide from AI context |

### Context Modes

| Keyword | Description |
|---------|-------------|
| `forget` | Discard loop context |
| `verbose` | Keep full context (default) |
| `compress` | Summarize context |
| `default` | Default context mode |
| `local` | Local context mode |

### Literals

| Keyword | Description |
|---------|-------------|
| `true` | Boolean true |
| `false` | Boolean false |
| `null` | Null value |

### Logical Operators

| Keyword | Description |
|---------|-------------|
| `and` | Logical AND |
| `or` | Logical OR |
| `not` | Logical NOT |

## Statements

### Variable Declaration

```
let identifier: type = expression
let identifier = expression
const identifier: type = expression
const identifier = expression
```

### Async Declaration

```
async let identifier = expression
async const identifier = expression
```

### Private Declaration

```
private let identifier = expression
let private identifier = expression
```

### Destructuring

```
let { field1: type1, field2: type2 } = expression
const { private field: type } = expression
```

### Function Declaration

```
function name(param1: type1, param2: type2): returnType {
  statements
}

export function name(params): type { ... }
```

### Tool Declaration

```
tool name(param1: type1, param2: type2): returnType
  @description "description"
  @param param1 "description"
{
  ts(params) {
    // implementation
  }
}
```

### Model Declaration

```
model name = {
  name: "model-id",
  apiKey: expression,
  provider: "anthropic" | "openai" | "google",
  url: "optional-url",
  maxRetriesOnError: number,
  thinkingLevel: "none" | "low" | "medium" | "high" | "max",
  tools: [tool1, tool2]
}
```

### Type Declaration

```
type TypeName {
  field1: type1
  field2: type2
}

type TypeName { field1: type1, field2: type2 }
```

Fields can be separated by commas, newlines, or both.

Nested types:
```
type Outer {
  inner: InnerType          // Reference named type
  data: {                   // Inline nested object
    value: number
    label: text
  }
}
```

Arrays of types:
```
type Team { players: Player[] }
```

### If Statement

```
if condition { statements }
if condition { statements } else { statements }
if condition { statements } else if condition { statements } else { statements }
```

### For Loop

```
for identifier in expression { statements }
for identifier in expression { statements } forget
for identifier in expression { statements } verbose
for identifier in expression { statements } compress
for identifier in expression { statements } compress("prompt")
for identifier in expression { statements } compress(model)
for identifier in expression { statements } compress("prompt", model)
```

### While Loop

```
while condition { statements }
while condition { statements } forget
while condition { statements } compress
```

### Return Statement

```
return expression
return
```

### Break Statement

```
break
```

Exits the innermost `for` or `while` loop immediately.

### Import Statement

```
import { name1, name2 } from "path"
```

### Export Statement

```
export function name() { }
export let name = value
export const name = value
export model name = { }
```

## Expressions

### AI Expressions

```
do "prompt"
do "prompt" model
do "prompt" model context

vibe "prompt"
vibe "prompt" model
vibe "prompt" model context
```

### TypeScript Block

```
ts() { code }
ts(var1, var2) { code }
```

### Range Expression

```
start..end
1..10
```

### Binary Operators

```
a + b    // Addition
a - b    // Subtraction
a * b    // Multiplication
a / b    // Division
a % b    // Modulo
a == b   // Equality
a != b   // Inequality
a < b    // Less than
a > b    // Greater than
a <= b   // Less or equal
a >= b   // Greater or equal
a and b  // Logical AND
a or b   // Logical OR
```

### Unary Operators

```
not a    // Logical NOT
-a       // Negation
```

### Access Expressions

```
object.property     // Member access
array[index]        // Index access
array[start:end]    // Slice access
array[:end]         // Slice from start
array[start:]       // Slice to end
```

### Function Call

```
functionName()
functionName(arg1, arg2)
```

### Literals

```
"string"            // Double-quoted string
'string'            // Single-quoted string
`template {var}`    // Template literal
42                  // Integer
3.14                // Decimal
true                // Boolean
false               // Boolean
null                // Null
[1, 2, 3]           // Array
{ key: value }      // Object
```

## Comments

```
// Single line comment
/* Multi-line
   comment */
```

## Operator Precedence

From lowest to highest:

1. Assignment (`=`)
2. Logical OR (`or`)
3. Logical AND (`and`)
4. Equality (`==`, `!=`)
5. Comparison (`<`, `>`, `<=`, `>=`)
6. Addition (`+`, `-`)
7. Multiplication (`*`, `/`, `%`)
8. Unary (`not`, `-`)
9. Range (`..`)
10. Postfix (`.`, `[]`, `()`)
11. Primary (literals, identifiers, parentheses)
