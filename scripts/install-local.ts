import { $ } from 'bun';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

type PlatformConfig = {
  packageDir: string;
  distBinary: string;
  binName: string;
};

const platform = process.platform;
const arch = process.arch;
const key = `${platform}-${arch}`;
const rootDir = join(import.meta.dir, '..');
const stagingDir = join(rootDir, '.npm-publish');
const mainPackageDir = join(stagingDir, 'vibe');

const platformMap: Record<string, PlatformConfig> = {
  'linux-x64': {
    packageDir: 'vibe-linux-x64',
    distBinary: 'dist/vibe-linux-x64',
    binName: 'vibe',
  },
  'linux-arm64': {
    packageDir: 'vibe-linux-arm64',
    distBinary: 'dist/vibe-linux-arm64',
    binName: 'vibe',
  },
  'darwin-arm64': {
    packageDir: 'vibe-darwin-arm64',
    distBinary: 'dist/vibe-darwin-arm64',
    binName: 'vibe',
  },
  'darwin-x64': {
    packageDir: 'vibe-darwin-x64',
    distBinary: 'dist/vibe-darwin-x64',
    binName: 'vibe',
  },
  'win32-x64': {
    packageDir: 'vibe-windows-x64',
    distBinary: 'dist/vibe-windows-x64.exe',
    binName: 'vibe.exe',
  },
};

const config = platformMap[key];

if (!config) {
  console.error(`Unsupported platform: ${key}`);
  process.exit(1);
}

if (!existsSync(mainPackageDir)) {
  console.error(`Missing staging folder: ${mainPackageDir}`);
  process.exit(1);
}

console.log(`Building binaries for ${key}...`);
await $`bun run scripts/build.ts`;

const platformPackageDir = join(stagingDir, config.packageDir);
const destDir = join(platformPackageDir, 'bin');
const destPath = join(destDir, config.binName);

if (!existsSync(config.distBinary)) {
  console.error(`Binary not found: ${config.distBinary}`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
cpSync(config.distBinary, destPath);
console.log(`Copied ${config.distBinary} -> ${destPath}`);

const mainPackageJsonPath = join(mainPackageDir, 'package.json');
const mainPackage = JSON.parse(readFileSync(mainPackageJsonPath, 'utf-8'));
mainPackage.optionalDependencies = {
  ...(mainPackage.optionalDependencies ?? {}),
  [`@vibe-lang/${config.packageDir}`]: `file:../${config.packageDir}`,
};
writeFileSync(mainPackageJsonPath, JSON.stringify(mainPackage, null, 2) + '\n');
console.log(`Updated optionalDependencies in ${mainPackageJsonPath}`);

console.log('Installing staged package globally...');
await $`npm uninstall -g @vibe-lang/vibe`.quiet();
await $`npm install -g ${`file:${platformPackageDir}`}`;
const { stdout: prefixOut } = await $`npm prefix -g`;
const prefix = prefixOut.toString().trim();
const globalBinDir = platform === 'win32' ? prefix : join(prefix, 'bin');
const staleBins = [
  join(globalBinDir, 'vibe.cmd'),
  join(globalBinDir, 'vibe.ps1'),
  join(globalBinDir, 'vibe'),
];

for (const binPath of staleBins) {
  if (existsSync(binPath)) {
    rmSync(binPath, { force: true });
    console.log(`Removed stale shim: ${binPath}`);
  }
}
await $`npm install -g ${`file:${mainPackageDir}`} --ignore-scripts`;

const globalNodeModules =
  platform === 'win32' ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules');
const globalPlatformBin = join(
  globalNodeModules,
  '@vibe-lang',
  config.packageDir,
  'bin',
  config.binName
);
const globalVibeBin = join(globalNodeModules, '@vibe-lang', 'vibe', 'bin', config.binName);

if (!existsSync(globalPlatformBin)) {
  console.error(`Global platform binary not found: ${globalPlatformBin}`);
  process.exit(1);
}

mkdirSync(join(globalNodeModules, '@vibe-lang', 'vibe', 'bin'), { recursive: true });
cpSync(globalPlatformBin, globalVibeBin);
console.log(`Copied binary to main package: ${globalVibeBin}`);

console.log('Building VS Code extension release...');
await $`bun install --cwd packages/vscode-extension`;
await $`bun run --cwd packages/vscode-extension package`;

console.log('Done. Global install is ready from .npm-publish.');
