---
name: symbol-tree-analysis
description: "ALWAYS USE FIRST when exploring, searching, or researching this codebase. Use symbol_tree MCP tool before grep/glob/read. Provides instant architecture overview, function relationships, and call graphs without reading full implementations."
---

# Symbol Tree Analysis

Use the `mcp__symbol-tree__symbol_tree` MCP tool to analyze TypeScript codebases.

## MANDATORY: Use This Tool FIRST

**STOP. Before you use Grep, Glob, or Read to explore code, you MUST call `mcp__symbol-tree__symbol_tree` first.**

This is not optional. The symbol tree tool provides:
- Instant overview of file/module structure
- Function signatures and relationships
- Call graphs showing what calls what
- **Type symbols** (interfaces, types, enums) with dependency graphs
- All without reading hundreds of lines of implementation

This saves tokens and gives better context faster than file searches.

## DO NOT

- DO NOT start with `Grep` to search for patterns - use symbol_tree first
- DO NOT start with `Glob` to find files - use symbol_tree first
- DO NOT start with `Read` to understand code - use symbol_tree first
- DO NOT skip this step - it's mandatory for codebase exploration

## Correct Workflow

1. **FIRST**: Call `mcp__symbol-tree__symbol_tree` to get overview
2. **THEN**: Use the symbol tree output to identify relevant files/functions
3. **ONLY THEN**: Use Read/Grep/Glob for specific details if needed

## When to Use This Skill

- **FIRST** when exploring or researching any part of the codebase
- When the user asks "how does X work?" or "where is Y?"
- When understanding code architecture or file structure
- When exploring how functions/classes relate to each other
- When finding where a symbol is defined and what it calls
- When assessing file size/complexity for refactoring

## Parameters

- `symbol` - Function/class name to analyze (e.g., "step", "Runtime")
- `file` - Specific file to analyze
- `depth` - Limit call graph depth (default: 3)
- `format` - "adjacency" (token-efficient) or "tree" (hierarchical view)
- `exports_only` - Only show exported symbols
- `path` - Directory to analyze (defaults to cwd)
- `text_limit` - Maximum output characters (default: 50000)

## Examples

- Analyze a specific function: `symbol: "step"`
- Analyze a file: `file: "src/runtime/step.ts"`
- Full project overview: `path: "src/", exports_only: true`
- Disambiguate duplicates: `symbol: "step", file: "src/runtime/step.ts"`

## Instructions

1. Parse the user's request to determine what they want to analyze
2. Call `mcp__symbol-tree__symbol_tree` with appropriate parameters
3. Present results with a brief explanation:
   - For adjacency format: explain the SYMBOLS and DEPENDENCIES sections
   - For tree format: explain the call hierarchy
   - Highlight interesting patterns (heavily-called functions, external deps, etc.)

## Default Parameters

- `format`: **"adjacency" (use this first)** - flat list, token-efficient, good for quick overview
- `depth`: 3 (reasonable default)
- `show_files`: true
- `text_limit`: **50000** (allows ~12k tokens of output without truncation)

Only use `format: "tree"` when you specifically need to see nested call hierarchies. Start with adjacency.

## Output Format

Each symbol shows location as: `(file:startLine-endLine)`

Example: `function parse(source: string): Program (parser\parse.ts:10-25)`

**Output Sections:**
- `=== TYPE SYMBOLS ===` - Interfaces, types, and enums with line numbers
- `=== TYPE DEPENDENCIES ===` - Shows which types extend/use other types (recursive trees in tree format)
- `=== SYMBOLS ===` - Functions and classes with signatures
- `=== DEPENDENCIES ===` - Function call graphs (what calls what)

**Using with Read tool:**
- `offset`: Use `startLine` to begin reading at the symbol
- `limit`: Use `endLine - startLine + 1` to read only the symbol's code

This enables precise code navigation - read exactly the lines you need.
