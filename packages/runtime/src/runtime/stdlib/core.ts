// Core system functions - automatically available in all Vibe modules
// These functions are injected into scope without requiring an import.
// They CANNOT be imported via "system" or any other module path.

import type { RuntimeState } from '../types';

/**
 * Print a message to the console.
 * @param message - The message to print
 */
function print(_state: RuntimeState, message: unknown): void {
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
 * Access CLI program arguments passed after the .vibe filename.
 *
 * Overloaded:
 * - args()          → string[] of all program args
 * - args(n)         → string at index n, or null if out of bounds
 * - args("name")    → value of --name flag, or null if not present.
 *                     Returns "" for flags with no value (--flag, --flag=, --flag --other).
 *                     Supports --name=value and --name value forms.
 */
function args(state: RuntimeState, keyOrIndex?: unknown): unknown {
  const programArgs = state.programArgs;

  // No argument: return all args
  if (keyOrIndex === undefined || keyOrIndex === null) {
    return programArgs;
  }

  // Numeric index: return positional arg
  if (typeof keyOrIndex === 'number') {
    const index = Math.floor(keyOrIndex);
    return index >= 0 && index < programArgs.length ? programArgs[index] : null;
  }

  // String: look up --name flag
  if (typeof keyOrIndex === 'string') {
    const flagName = keyOrIndex;
    const doubleDash = `--${flagName}`;

    for (let i = 0; i < programArgs.length; i++) {
      const arg = programArgs[i];

      // --name=value form (includes --name= which returns "")
      if (arg.startsWith(doubleDash + '=')) {
        return arg.slice(doubleDash.length + 1);
      }

      // --name form: check if next arg is a value or another flag
      if (arg === doubleDash) {
        const nextArg = programArgs[i + 1];
        // No next arg, or next arg is a flag → empty string (boolean-style flag)
        if (nextArg === undefined || nextArg.startsWith('--')) {
          return '';
        }
        // Next arg is a value
        return nextArg;
      }
    }

    return null;
  }

  return null;
}

/**
 * Check if a CLI flag is present in program arguments.
 * @param name - Flag name without dashes (e.g., "dry-run" checks for --dry-run)
 * @returns true if the flag is present, false otherwise
 */
function hasArg(state: RuntimeState, name: unknown): boolean {
  if (typeof name !== 'string') return false;
  const doubleDash = `--${name}`;
  return state.programArgs.some(arg => arg === doubleDash || arg.startsWith(doubleDash + '='));
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
