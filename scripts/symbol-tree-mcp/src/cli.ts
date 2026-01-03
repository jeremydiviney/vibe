#!/usr/bin/env bun

import { extractSymbols } from './extraction.js';
import { formatSymbolTree, formatByFile, formatAdjacencyList } from './formatters.js';
import path from 'path';

interface CliArgs {
  path?: string;
  file?: string;
  symbol?: string;
  pattern?: string;
  depth?: number;
  textLimit?: number;
  exportsOnly?: boolean;
  showFiles?: boolean;
  groupByFile?: boolean;
  format?: 'adjacency' | 'tree';
  srcDir?: string;
  help?: boolean;
}

function printHelp() {
  console.log(`
symbol-tree - Analyze TypeScript/JavaScript codebase structure

Usage: bun run scripts/symbol-tree-mcp/src/cli.ts [path] [options]

Arguments:
  [path]              Directory to analyze (default: current directory)

Options:
  --file <file>       Specific file to analyze (takes precedence over path)
  --symbol <name>     Symbol name to search for (e.g., "RuntimeState", "parse")
  --pattern <glob>    Glob pattern (default: "**/*.{ts,tsx,js,jsx}")
  --depth <n>         Max call depth in output (default: unlimited)
  --text-limit <n>    Max output characters (default: 50000)
  --exports-only      Only show exported symbols
  --no-files          Hide file paths and line numbers
  --group-by-file     Group symbols by file
  --format <fmt>      Output format: "adjacency" (default) or "tree"
  --src-dir <dir>     Source directory filter (default: "src", use "" for all)
  --help              Show this help message

Examples:
  bun run scripts/symbol-tree-mcp/src/cli.ts src/runtime
  bun run scripts/symbol-tree-mcp/src/cli.ts --symbol step
  bun run scripts/symbol-tree-mcp/src/cli.ts --file src/runtime/state.ts
  bun run scripts/symbol-tree-mcp/src/cli.ts --exports-only --format tree
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  let i = 2; // Skip 'bun' and script path

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--file') {
      args.file = argv[++i];
    } else if (arg === '--symbol') {
      args.symbol = argv[++i];
    } else if (arg === '--pattern') {
      args.pattern = argv[++i];
    } else if (arg === '--depth') {
      args.depth = parseInt(argv[++i], 10);
    } else if (arg === '--text-limit') {
      args.textLimit = parseInt(argv[++i], 10);
    } else if (arg === '--exports-only') {
      args.exportsOnly = true;
    } else if (arg === '--no-files') {
      args.showFiles = false;
    } else if (arg === '--group-by-file') {
      args.groupByFile = true;
    } else if (arg === '--format') {
      args.format = argv[++i] as 'adjacency' | 'tree';
    } else if (arg === '--src-dir') {
      args.srcDir = argv[++i];
    } else if (!arg.startsWith('-')) {
      args.path = arg;
    }
    i++;
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const basePath = args.path ? path.resolve(args.path) : process.cwd();

  try {
    const fileSymbols = await extractSymbols({
      path: basePath,
      file: args.file,
      pattern: args.pattern,
      depth: 10,
      exportsOnly: args.exportsOnly ?? false,
      srcDir: args.srcDir,
    });

    if (fileSymbols.length === 0) {
      console.log('No symbols found in the specified path.');
      process.exit(0);
    }

    const formatOptions = {
      textLimit: args.textLimit ?? 50000,
      showFiles: args.showFiles ?? true,
      basePath,
      entrySymbol: args.symbol,
      entryFile: args.symbol && args.file ? args.file : undefined,
      depth: args.depth ?? Infinity,
    };

    const format = args.format ?? 'adjacency';
    let output: string;

    if (args.groupByFile) {
      output = formatByFile(fileSymbols, formatOptions);
    } else if (format === 'adjacency') {
      output = formatAdjacencyList(fileSymbols, formatOptions);
    } else {
      output = formatSymbolTree(fileSymbols, formatOptions);
    }

    console.log(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error analyzing symbols: ${message}`);
    process.exit(1);
  }
}

main();
