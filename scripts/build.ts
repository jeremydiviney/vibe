import { $ } from 'bun';
import { mkdirSync, existsSync, rmSync } from 'fs';

// Use baseline targets for x64 platforms to avoid AVX2 requirement
// This ensures compatibility with older CPUs (pre-2013)
// ARM64 platforms don't need baseline - instruction set is consistent
const targets = [
  { target: 'bun-linux-x64-baseline', name: 'vibe-linux-x64' },
  { target: 'bun-linux-arm64', name: 'vibe-linux-arm64' },  // AWS Graviton, Raspberry Pi, etc.
  { target: 'bun-darwin-arm64', name: 'vibe-darwin-arm64' },
  { target: 'bun-darwin-x64-baseline', name: 'vibe-darwin-x64' },
  { target: 'bun-windows-x64-baseline', name: 'vibe-windows-x64.exe' },
];

console.log('Building Vibe binaries (parallel)...\n');

if (existsSync('dist')) {
  rmSync('dist', { recursive: true });
}
mkdirSync('dist', { recursive: true });

// Build all targets in parallel
const startTime = Date.now();
const results = await Promise.all(
  targets.map(async ({ target, name }) => {
    const buildStart = Date.now();
    try {
      await $`bun build --compile --target=${target} ./packages/runtime/src/index.ts --outfile ./dist/${name}`.quiet();
      const duration = ((Date.now() - buildStart) / 1000).toFixed(1);
      return { name, success: true, duration };
    } catch (error) {
      return { name, success: false, error };
    }
  })
);

// Report results
for (const result of results) {
  if (result.success) {
    console.log(`  ✓ dist/${result.name} (${result.duration}s)`);
  } else {
    console.error(`  ✗ ${result.name} failed:`, result.error);
  }
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nDone! ${results.filter(r => r.success).length}/${results.length} binaries built in ${totalTime}s`);
