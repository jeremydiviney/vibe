// Run on a specific file and output full tree
import { extractSymbols } from './src/symbol-extractor.js';
import { formatSymbolTree } from './src/formatter.js';
import path from 'path';

async function main() {
  const vibeRoot = path.resolve('../..');
  const targetFile = process.argv[2] || 'src/runtime/step.ts';

  console.log(`Analyzing: ${targetFile}\n`);

  const symbols = await extractSymbols({
    file: path.join(vibeRoot, targetFile),
    depth: 3,
    exportsOnly: false
  });

  console.log(formatSymbolTree(symbols, {
    showFiles: true,
    basePath: vibeRoot,
    textLimit: 50000  // High limit to show full tree
  }));
}

main().catch(console.error);
