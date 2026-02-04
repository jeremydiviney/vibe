import { $ } from 'bun';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const platform = process.platform;
const rootDir = join(import.meta.dir, '..');
const runtimeDir = join(rootDir, 'packages', 'runtime');
const runtimeEntry = join(runtimeDir, 'src', 'index.ts');

if (!existsSync(runtimeEntry)) {
  console.error(`Runtime entry not found: ${runtimeEntry}`);
  process.exit(1);
}

const { stdout: prefixOut } = await $`npm prefix -g`;
const prefix = prefixOut.toString().trim();
const globalBinDir = platform === 'win32' ? prefix : join(prefix, 'bin');

if (!globalBinDir) {
  console.error('Failed to locate global npm bin directory.');
  process.exit(1);
}

mkdirSync(globalBinDir, { recursive: true });

const bunCommand = `bun --cwd "${runtimeDir}" src/index.ts`;

if (platform === 'win32') {
  const cmdPath = join(globalBinDir, 'vibe.cmd');
  const ps1Path = join(globalBinDir, 'vibe.ps1');
  const cmdContents = `@echo off\r\n${bunCommand} %*\r\n`;
  const ps1Contents = `${bunCommand} $args\r\n`;

  writeFileSync(cmdPath, cmdContents);
  writeFileSync(ps1Path, ps1Contents);
  console.log(`Installed shims: ${cmdPath}, ${ps1Path}`);
} else {
  const shimPath = join(globalBinDir, 'vibe');
  const shimContents = `#!/usr/bin/env sh\nexec ${bunCommand} "$@"\n`;

  writeFileSync(shimPath, shimContents);
  chmodSync(shimPath, 0o755);
  console.log(`Installed shim: ${shimPath}`);
}

console.log('Done. `vibe` now runs from packages/runtime.');
