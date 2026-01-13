import { $ } from 'bun';
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const dryRun = process.argv.includes('--dry-run');
const version = (await Bun.file('VERSION').text()).trim();

console.log(`Publishing @vibe-lang/vibe v${version}${dryRun ? ' (dry run)' : ''}...\n`);

// 1. Update version in source (before build so it's baked in)
console.log('Step 1: Updating source version...');
const indexPath = 'packages/runtime/src/index.ts';
let indexContent = await Bun.file(indexPath).text();
indexContent = indexContent.replace(
  /export const VERSION = '[^']+';/,
  `export const VERSION = '${version}';`
);
await Bun.write(indexPath, indexContent);
console.log(`  ✓ ${indexPath}`);

// 2. Build binaries for all platforms
console.log('\nStep 2: Building binaries...');
await $`bun run scripts/build.ts`;

// 3. Update version in package.json files
console.log('\nStep 3: Updating package versions...');

const packages = [
  'npm/vibe/package.json',
  'npm/vibe-linux-x64/package.json',
  'npm/vibe-linux-arm64/package.json',
  'npm/vibe-darwin-arm64/package.json',
  'npm/vibe-darwin-x64/package.json',
  'npm/vibe-windows-x64/package.json',
];

for (const pkgPath of packages) {
  const pkg = await Bun.file(pkgPath).json();
  pkg.version = version;

  // Update optionalDependencies versions in main package
  if (pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) {
      pkg.optionalDependencies[dep] = version;
    }
  }

  await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ✓ ${pkgPath}`);
}

// 4. Copy binaries to platform packages
console.log('\nStep 4: Copying binaries to packages...');

const binaries = [
  { src: 'dist/vibe-linux-x64', dest: 'npm/vibe-linux-x64/bin/vibe' },
  { src: 'dist/vibe-linux-arm64', dest: 'npm/vibe-linux-arm64/bin/vibe' },
  { src: 'dist/vibe-darwin-arm64', dest: 'npm/vibe-darwin-arm64/bin/vibe' },
  { src: 'dist/vibe-darwin-x64', dest: 'npm/vibe-darwin-x64/bin/vibe' },
  { src: 'dist/vibe-windows-x64.exe', dest: 'npm/vibe-windows-x64/bin/vibe.exe' },
];

for (const { src, dest } of binaries) {
  if (!existsSync(src)) {
    console.error(`  ✗ Binary not found: ${src}`);
    process.exit(1);
  }
  cpSync(src, dest);
  console.log(`  ✓ ${src} -> ${dest}`);
}

// 5. Copy README to main package
console.log('\nStep 5: Copying README...');
if (existsSync('README.md')) {
  cpSync('README.md', 'npm/vibe/README.md');
  console.log('  ✓ README.md -> npm/vibe/README.md');
}

// 6. Publish packages
console.log('\nStep 6: Publishing packages...');

const platforms = ['linux-x64', 'linux-arm64', 'darwin-arm64', 'darwin-x64', 'windows-x64'];

for (const platform of platforms) {
  const pkgDir = `npm/vibe-${platform}`;
  process.stdout.write(`  Publishing @vibe-lang/vibe-${platform}...`);
  if (dryRun) {
    await $`cd ${pkgDir} && npm publish --access public --dry-run`.quiet();
  } else {
    await $`cd ${pkgDir} && npm publish --access public`.quiet();
  }
  console.log(` ✓`);
}

// Publish main package
process.stdout.write(`  Publishing @vibe-lang/vibe...`);
if (dryRun) {
  await $`cd npm/vibe && npm publish --access public --dry-run`.quiet();
} else {
  await $`cd npm/vibe && npm publish --access public`.quiet();
}
console.log(` ✓`);

console.log(`\n✓ All packages published${dryRun ? ' (dry run)' : ''}!`);
console.log('\nTo install:');
console.log('  npm install -g @vibe-lang/vibe');
