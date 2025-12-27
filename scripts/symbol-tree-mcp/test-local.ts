// Quick test script to verify symbol extraction works
import { extractSymbols } from './src/symbol-extractor.js';
import { formatSymbolTree, formatByFile } from './src/formatter.js';
import path from 'path';

async function test() {
  const vibeRoot = path.resolve('../..');

  console.log('=== Testing Symbol Extraction ===\n');

  // Test 1: Extract from a single file
  console.log('Test 1: Single file (src/lexer/index.ts)');
  const singleFile = await extractSymbols({
    file: path.join(vibeRoot, 'src/lexer/index.ts'),
    depth: 2,
    exportsOnly: true
  });
  console.log(formatSymbolTree(singleFile, { showFiles: true, basePath: vibeRoot, textLimit: 3000 }));
  console.log('\n---\n');

  // Test 2: Search for specific symbol
  console.log('Test 2: Find symbol "RuntimeState"');
  const symbolSearch = await extractSymbols({
    path: path.join(vibeRoot, 'src'),
    symbol: 'RuntimeState',
    depth: 3
  });
  console.log(formatSymbolTree(symbolSearch, { showFiles: true, basePath: vibeRoot }));
  console.log('\n---\n');

  // Test 3: Full src directory with limit
  console.log('Test 3: Full src/ directory (text_limit: 2000)');
  const fullSrc = await extractSymbols({
    path: path.join(vibeRoot, 'src'),
    pattern: '**/*.ts',
    depth: 1,
    exportsOnly: true
  });
  console.log(formatSymbolTree(fullSrc, { showFiles: true, basePath: vibeRoot, textLimit: 2000 }));
  console.log('\n---\n');

  // Test 4: Group by file
  console.log('Test 4: Group by file view');
  console.log(formatByFile(singleFile, { basePath: vibeRoot }));
}

test().catch(console.error);
