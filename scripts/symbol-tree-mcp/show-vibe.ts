import { extractSymbols } from './src/symbol-extractor.js';
import { formatSymbolTree, formatAdjacencyList } from './src/formatter.js';
import path from 'path';
import fs from 'fs';

const vibeRoot = path.resolve('../..');

// Full extraction (high depth)
const symbols = await extractSymbols({
  path: path.join(vibeRoot, 'src'),
  pattern: '**/*.ts',
  depth: 10,  // Full extraction
  exportsOnly: false
});

// Full output (no depth limit)
const treeOutput = formatSymbolTree(symbols, {
  showFiles: true,
  basePath: vibeRoot,
  textLimit: 500000
});

const adjacencyOutput = formatAdjacencyList(symbols, {
  showFiles: true,
  basePath: vibeRoot,
  textLimit: 500000
});

// Depth-limited output from specific entry point
const limitedOutput = formatAdjacencyList(symbols, {
  showFiles: true,
  basePath: vibeRoot,
  textLimit: 500000,
  entrySymbol: 'step',
  depth: 2
});

// File+symbol disambiguation (e.g., if 'step' existed in multiple files)
const fileSpecificOutput = formatAdjacencyList(symbols, {
  showFiles: true,
  basePath: vibeRoot,
  textLimit: 500000,
  entrySymbol: 'step',
  entryFile: 'runtime/step.ts',  // Only match 'step' in this file
  depth: 2
});

// Write outputs
fs.writeFileSync(path.join(vibeRoot, 'symbol-tree-output.txt'), treeOutput);
fs.writeFileSync(path.join(vibeRoot, 'symbol-adjacency-output.txt'), adjacencyOutput);
fs.writeFileSync(path.join(vibeRoot, 'symbol-limited-output.txt'), limitedOutput);
fs.writeFileSync(path.join(vibeRoot, 'symbol-file-specific-output.txt'), fileSpecificOutput);

console.log(`Tree format (full): ${treeOutput.split('\n').length} lines`);
console.log(`Adjacency format (full): ${adjacencyOutput.split('\n').length} lines`);
console.log(`Adjacency format (step, depth=2): ${limitedOutput.split('\n').length} lines`);
console.log(`Adjacency format (step in runtime/step.ts, depth=2): ${fileSpecificOutput.split('\n').length} lines`);
console.log('\nOutputs written to:');
console.log('  - symbol-tree-output.txt');
console.log('  - symbol-adjacency-output.txt');
console.log('  - symbol-limited-output.txt');
console.log('  - symbol-file-specific-output.txt');
