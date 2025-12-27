# Symbol Tree Analysis Skill

Use the `symbol_tree` MCP tool to analyze TypeScript codebases.

## Usage
`/symbol [target] [options]`

## Examples
- `/symbol` - Full project analysis
- `/symbol step` - Analyze the `step` function and its call graph
- `/symbol src/runtime/step.ts` - Analyze a specific file
- `/symbol step depth=2` - Limit to 2 levels of calls
- `/symbol step file=src/runtime/step.ts` - Disambiguate: find `step` only in that file

## Instructions

When this skill is invoked:

1. Parse the arguments:
   - If a function/class name is given, use it as `symbol` parameter
   - If a file path is given, use it as `file` parameter
   - If `file=` is specified with a symbol, use BOTH to disambiguate duplicates
   - Look for `depth=N` to set depth limit
   - Default format is `adjacency` (use `format=tree` for tree view)

2. Call the `symbol_tree` MCP tool with appropriate parameters

3. Present the results with a brief explanation:
   - For adjacency format: explain the SYMBOLS and DEPENDENCIES sections
   - For tree format: explain the call hierarchy
   - Highlight any interesting patterns (heavily-called functions, external dependencies, etc.)

## Default Parameters
- `format`: "adjacency" (more token-efficient)
- `depth`: 3 (reasonable default, use higher for full graph)
- `show_files`: true
