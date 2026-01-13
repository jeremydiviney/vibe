#!/usr/bin/env bun
/**
 * Unified versioning script for Vibe monorepo
 *
 * Usage:
 *   bun scripts/version.ts          # Show current version
 *   bun scripts/version.ts 0.2.0    # Set all packages to 0.2.0
 *   bun scripts/version.ts patch    # Bump patch (0.1.0 -> 0.1.1)
 *   bun scripts/version.ts minor    # Bump minor (0.1.0 -> 0.2.0)
 *   bun scripts/version.ts major    # Bump major (0.1.0 -> 1.0.0)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const VERSION_FILE = join(ROOT, 'VERSION')

const PACKAGES = [
  'packages/runtime/package.json',
  'packages/debug-core/package.json',
  'packages/vscode-extension/package.json',
]

function readVersion(): string {
  return readFileSync(VERSION_FILE, 'utf-8').trim()
}

function writeVersion(version: string): void {
  writeFileSync(VERSION_FILE, version + '\n')
}

function updatePackageJson(path: string, version: string): void {
  const fullPath = join(ROOT, path)
  if (!existsSync(fullPath)) {
    console.log(`  Skipping ${path} (not found)`)
    return
  }

  const pkg = JSON.parse(readFileSync(fullPath, 'utf-8'))
  const oldVersion = pkg.version
  pkg.version = version
  writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`  ${path}: ${oldVersion} -> ${version}`)
}

function bumpVersion(current: string, type: 'major' | 'minor' | 'patch'): string {
  const [major, minor, patch] = current.split('.').map(Number)

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

function isValidVersion(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v)
}

// Main
const arg = process.argv[2]
const currentVersion = readVersion()

if (!arg) {
  // Show current version
  console.log(`Current version: ${currentVersion}`)
  console.log('\nPackages:')
  for (const pkg of PACKAGES) {
    const fullPath = join(ROOT, pkg)
    if (existsSync(fullPath)) {
      const { version } = JSON.parse(readFileSync(fullPath, 'utf-8'))
      const status = version === currentVersion ? '✓' : `⚠ (${version})`
      console.log(`  ${pkg}: ${status}`)
    }
  }
  console.log('\nUsage: bun scripts/version.ts [version|patch|minor|major]')
  process.exit(0)
}

let newVersion: string

if (arg === 'patch' || arg === 'minor' || arg === 'major') {
  newVersion = bumpVersion(currentVersion, arg)
} else if (isValidVersion(arg)) {
  newVersion = arg
} else {
  console.error(`Invalid version: ${arg}`)
  console.error('Use semver format (e.g., 0.2.0) or bump type (patch|minor|major)')
  process.exit(1)
}

console.log(`Updating version: ${currentVersion} -> ${newVersion}\n`)

// Update VERSION file
writeVersion(newVersion)
console.log(`  VERSION: ${currentVersion} -> ${newVersion}`)

// Update all package.json files
for (const pkg of PACKAGES) {
  updatePackageJson(pkg, newVersion)
}

console.log('\nDone! Run these commands to publish:')
console.log('  cd packages/runtime && bun publish')
console.log('  cd packages/vscode-extension && bunx vsce package --no-dependencies')
