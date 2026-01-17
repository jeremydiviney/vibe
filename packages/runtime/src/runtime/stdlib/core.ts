// Core system functions - automatically available in all Vibe modules
// These functions are injected into scope without requiring an import.
// They CANNOT be imported via "system" or any other module path.

/**
 * Print a message to the console.
 * @param message - The message to print
 */
export function print(message: unknown): void {
  console.log(message);
}

/**
 * Get an environment variable value.
 * @param name - The environment variable name
 * @param defaultValue - Default value if not set (defaults to empty string)
 * @returns The environment variable value or default
 */
export function env(name: string, defaultValue: string = ''): string {
  return process.env[name] ?? defaultValue;
}

// Registry of all core functions
// These are checked during identifier resolution before throwing "not defined" error
export const coreFunctions: Record<string, (...args: unknown[]) => unknown> = {
  print,
  env,
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
export function getCoreFunction(name: string): ((...args: unknown[]) => unknown) | undefined {
  return coreFunctions[name];
}
