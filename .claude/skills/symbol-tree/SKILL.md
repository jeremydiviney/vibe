---
name: symbol-tree-analysis
description: Use this skill to analyze TypeScript/JavaScript codebase structure using the symbol_tree MCP tool. Helpful for understanding code architecture, finding functions, and exploring call graphs.
---

# Symbol Tree Analysis

Use the `mcp__symbol-tree__symbol_tree` MCP tool to analyze TypeScript codebases.

## When to Use This Skill

- When the user wants to understand codebase architecture
- When exploring how functions/classes relate to each other
- When finding where a symbol is defined and what it calls
- When getting a high-level overview without reading full implementations

## Parameters

- `symbol` - Function/class name to analyze (e.g., "step", "Runtime")
- `file` - Specific file to analyze
- `depth` - Limit call graph depth (default: 3)
- `format` - "adjacency" (token-efficient) or "tree" (hierarchical view)
- `exports_only` - Only show exported symbols
- `path` - Directory to analyze (defaults to cwd)

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

- `format`: "adjacency" (more token-efficient)
- `depth`: 3 (reasonable default)
- `show_files`: true
