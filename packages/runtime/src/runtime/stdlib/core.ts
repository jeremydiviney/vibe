// Core system functions - automatically available in all Vibe modules
// These functions are injected into scope without requiring an import.
// They CANNOT be imported via "system" or any other module path.

import type { RuntimeState } from '../types';

/**
 * Print a message to the console.
 * @param message - The message to print
 */
function print(state: RuntimeState, message: unknown): void {
  // Trigger args checks if defineArg was used (handles --help and unknown arg warnings)
  if (state.argDefinitions.length > 0) performArgsChecks(state);
  console.log(message);
}

/**
 * Get an environment variable value.
 * @param name - The environment variable name
 * @param defaultValue - Default value if not set (defaults to empty string)
 * @returns The environment variable value or default
 */
function env(_state: RuntimeState, name: string, defaultValue: string = ''): string {
  return process.env[name] ?? defaultValue;
}

/**
 * Look up a --name flag value from program args.
 * Returns the string value, "" for boolean flags, or null if not found.
 */
function lookupFlag(programArgs: string[], flagName: string): string | null {
  const doubleDash = `--${flagName}`;
  for (let i = 0; i < programArgs.length; i++) {
    const arg = programArgs[i];
    if (arg.startsWith(doubleDash + '=')) {
      return arg.slice(doubleDash.length + 1);
    }
    if (arg === doubleDash) {
      const nextArg = programArgs[i + 1];
      if (nextArg === undefined || nextArg.startsWith('--')) return '';
      return nextArg;
    }
  }
  return null;
}

// Module-level flag to track if args checks have been performed.
// Must be module-level because RuntimeState object spreads in the runtime
// overwrite mutations made during core function execution.
let argsChecked = false;

/**
 * Reset args check state (for testing).
 */
export function resetArgsChecked(): void {
  argsChecked = false;
}

/**
 * Perform one-time args checks: print help if --help/-h, warn about unknown flags.
 * Called automatically on first core function call after defineArg() registrations.
 */
function performArgsChecks(state: RuntimeState): void {
  if (argsChecked) return;
  argsChecked = true;

  // Help check (only if there are registered definitions)
  if (state.argDefinitions.length > 0 && state.programArgs.some(a => a === '--help' || a === '-h')) {
    printArgHelp(state);
    process.exit(0);
  }

  // Warn about unknown flags (only if there are registered definitions)
  if (state.argDefinitions.length > 0) {
    const registeredNames = new Set(state.argDefinitions.map(d => d.name));
    for (const arg of state.programArgs) {
      if (!arg.startsWith('--')) continue;
      const flagName = arg.includes('=') ? arg.slice(2, arg.indexOf('=')) : arg.slice(2);
      if (!registeredNames.has(flagName)) {
        console.warn(`Warning: unknown argument '--${flagName}'. Use --help to see available options.`);
      }
    }
  }
}

/**
 * Access CLI program arguments passed after the .vibe filename.
 *
 * Overloaded:
 * - args()          → text[] of all program args
 * - args(n)         → text at index n, or null if out of bounds
 * - args("name")    → typed value matching defineArg definition, or raw text if not defined.
 *                     Warns if accessing an arg not registered via defineArg().
 */
function args(state: RuntimeState, keyOrIndex?: unknown): unknown {
  // Trigger one-time checks on first access
  performArgsChecks(state);

  const programArgs = state.programArgs;

  // No argument: return all args as text[]
  if (keyOrIndex === undefined || keyOrIndex === null) {
    return programArgs;
  }

  // Numeric index: return positional arg
  if (typeof keyOrIndex === 'number') {
    const index = Math.floor(keyOrIndex);
    return index >= 0 && index < programArgs.length ? programArgs[index] : null;
  }

  // String: look up --name flag with typed coercion
  if (typeof keyOrIndex === 'string') {
    const flagName = keyOrIndex;

    // Warn if accessing an arg not registered via defineArg
    const def = state.argDefinitions.find(d => d.name === flagName);
    if (!def && state.argDefinitions.length > 0) {
      console.warn(`Warning: accessing undefined argument '${flagName}'. Use defineArg() to register it.`);
    }

    const rawValue = lookupFlag(programArgs, flagName);

    // Not provided
    if (rawValue === null || rawValue === '') {
      if (rawValue === '' && (!def || def.type === 'text')) return '';
      if (def?.required) {
        console.error(`Error: --${flagName} is required`);
        printArgHelp(state);
        process.exit(1);
      }
      if (def?.defaultValue !== undefined) return def.defaultValue;
      return null;
    }

    // Type coercion based on defineArg definition
    if (def?.type === 'number') {
      const num = parseFloat(rawValue);
      if (isNaN(num)) throw new Error(`args: --${flagName} expects a number, got "${rawValue}"`);
      return num;
    }

    return rawValue;
  }

  return null;
}

/**
 * Check if a CLI flag is present in program arguments.
 * @param name - Flag name without dashes (e.g., "dry-run" checks for --dry-run)
 * @returns true if the flag is present, false otherwise
 */
function hasArg(state: RuntimeState, name: unknown): boolean {
  // Trigger one-time checks on first access
  performArgsChecks(state);

  if (typeof name !== 'string') return false;

  // Warn if checking an arg not registered via defineArg
  if (state.argDefinitions.length > 0 && !state.argDefinitions.some(d => d.name === name)) {
    console.warn(`Warning: checking undefined argument '${name}'. Use defineArg() to register it.`);
  }

  const doubleDash = `--${name}`;
  return state.programArgs.some(arg => arg === doubleDash || arg.startsWith(doubleDash + '='));
}

/**
 * Print help message for all registered arg definitions.
 */
export function printArgHelp(state: RuntimeState): void {
  console.log('\nUsage: vibe <program.vibe> [options]\n');
  console.log('Options:');

  const lines = state.argDefinitions.map(def => {
    const flag = `  --${def.name} <${def.type}>`;
    const suffix = def.required ? ' (required)' :
      def.defaultValue !== undefined ? ` (default: ${def.defaultValue})` : '';
    return { flag, desc: `${def.description}${suffix}` };
  });

  // Add help entry
  lines.push({ flag: '  -h, --help', desc: 'Show this help message' });

  const maxFlagLen = Math.max(...lines.map(l => l.flag.length));
  for (const line of lines) {
    console.log(`${line.flag.padEnd(maxFlagLen + 3)}${line.desc}`);
  }
  console.log('');
}

/**
 * Define a CLI argument with type, description, optional required flag, and default.
 *
 * defineArg(name, type, description)                    → optional, returns null if not provided
 * defineArg(name, type, description, false, default)    → optional with default
 * defineArg(name, type, description, true)              → required, errors if not provided
 *
 * Type is "number" or "text". Numbers are parsed from the string value.
 * When --help or -h is passed, defineArg registers silently and returns a safe dummy value;
 * help is printed automatically on first args()/hasArg() access.
 */
function defineArg(state: RuntimeState, name: unknown, type: unknown, description: unknown, required?: unknown, defaultValue?: unknown): unknown {
  if (typeof name !== 'string') throw new Error('defineArg: name must be a string');
  if (type !== 'number' && type !== 'text') throw new Error(`defineArg: type must be "number" or "text", got "${type}"`);
  if (typeof description !== 'string') throw new Error('defineArg: description must be a string');

  const isRequired = required === true;
  const hasDefault = defaultValue !== undefined && defaultValue !== null;

  // Register the definition
  state.argDefinitions.push({ name, type, description, required: isRequired, defaultValue: hasDefault ? defaultValue : undefined });

  // When --help / -h is present, skip validation and return safe dummy value.
  // Help is printed automatically on first args()/hasArg() access.
  if (state.programArgs.some(a => a === '--help' || a === '-h')) {
    return hasDefault ? defaultValue : null;
  }

  // Look up the flag value
  const rawValue = lookupFlag(state.programArgs, name);

  // Not provided
  if (rawValue === null || rawValue === '') {
    if (rawValue === '' && type === 'text') return '';
    if (isRequired) {
      console.error(`Error: --${name} is required`);
      printArgHelp(state);
      process.exit(1);
    }
    return hasDefault ? defaultValue : null;
  }

  // Coerce to type
  if (type === 'number') {
    const num = parseFloat(rawValue);
    if (isNaN(num)) throw new Error(`defineArg: --${name} expects a number, got "${rawValue}"`);
    return num;
  }

  return rawValue;
}

// Core function type: receives RuntimeState as first arg, then user args
export type CoreFunction = (state: RuntimeState, ...args: unknown[]) => unknown;

// Registry of all core functions
// These are checked during identifier resolution before throwing "not defined" error
export const coreFunctions: Record<string, CoreFunction> = {
  print,
  env,
  args,
  hasArg,
  defineArg,
};

// Set of core function names for quick lookup
export const coreFunctionNames = new Set(Object.keys(coreFunctions));

/**
 * Check if a name is a core function
 */
export function isCoreFunction(name: string): boolean {
  return coreFunctionNames.has(name);
}

/**
 * Get a core function by name
 */
export function getCoreFunction(name: string): CoreFunction | undefined {
  return coreFunctions[name];
}
