#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { extractSymbols, findSymbol } from './symbol-extractor.js';
import { formatSymbolTree, formatByFile, formatAdjacencyList } from './formatter.js';
import path from 'path';

const server = new Server(
  {
    name: 'symbol-tree',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'symbol_tree',
        description:
          'Analyze TypeScript/JavaScript files and display a hierarchical tree of symbols (functions, classes, interfaces, types, variables). Use this to quickly understand codebase architecture without reading full implementations.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to analyze. Defaults to current working directory.',
            },
            file: {
              type: 'string',
              description: 'Specific file to analyze. Takes precedence over path.',
            },
            symbol: {
              type: 'string',
              description: 'Symbol name to search for and build subtree from (e.g., "RuntimeState", "parse").',
            },
            pattern: {
              type: 'string',
              description: 'Glob pattern to filter files (e.g., "**/*.ts", "src/**/*.tsx"). Default: "**/*.{ts,tsx,js,jsx}"',
            },
            depth: {
              type: 'number',
              description: 'Max call depth from entry point (path/file/symbol). Controls output size. Omit or use large number for full graph.',
            },
            text_limit: {
              type: 'number',
              description: 'Maximum output characters. Stops building tree when reached. Default: 10000',
            },
            exports_only: {
              type: 'boolean',
              description: 'Only show exported symbols. Default: false',
            },
            show_files: {
              type: 'boolean',
              description: 'Include file path and line number with each symbol. Default: true',
            },
            group_by_file: {
              type: 'boolean',
              description: 'Group symbols by file instead of symbol-first view. Default: false',
            },
            format: {
              type: 'string',
              enum: ['adjacency', 'tree'],
              description: 'Output format. "adjacency" is a flat call graph (token-efficient). "tree" shows nested symbol hierarchy. Default: "adjacency"',
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'symbol_tree') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as {
    path?: string;
    file?: string;
    symbol?: string;
    pattern?: string;
    depth?: number;
    text_limit?: number;
    exports_only?: boolean;
    show_files?: boolean;
    group_by_file?: boolean;
    format?: 'adjacency' | 'tree';
  };

  const basePath = args.path ? path.resolve(args.path) : process.cwd();

  try {
    let fileSymbols;

    // Always do full extraction (depth 10 covers most call chains)
    // The depth parameter controls OUTPUT filtering, not extraction
    fileSymbols = await extractSymbols({
      path: basePath,
      file: args.file,
      pattern: args.pattern,
      depth: 10, // High extraction depth for complete call graph
      exportsOnly: args.exports_only ?? false,
    });

    if (fileSymbols.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No symbols found in the specified path.',
          },
        ],
      };
    }

    // Format output
    // When both file and symbol are specified, use file to disambiguate the entry point
    const formatOptions = {
      textLimit: args.text_limit ?? 10000,
      showFiles: args.show_files ?? true,
      basePath,
      entrySymbol: args.symbol,
      entryFile: args.symbol && args.file ? args.file : undefined,
      depth: args.depth ?? Infinity,
    };

    const format = args.format ?? 'adjacency';
    let output: string;

    if (args.group_by_file) {
      output = formatByFile(fileSymbols, formatOptions);
    } else if (format === 'adjacency') {
      output = formatAdjacencyList(fileSymbols, formatOptions);
    } else {
      output = formatSymbolTree(fileSymbols, formatOptions);
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error analyzing symbols: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Symbol Tree MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
