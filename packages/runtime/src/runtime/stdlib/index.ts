// Standard library functions for Vibe scripts
// Import with: import { env, print, uuid } from "system"
//
// These are TypeScript functions that can be called directly from Vibe scripts.
// For AI tools, use: import { standardTools } from "system/tools"

/**
 * Get an environment variable value.
 * @param name - The environment variable name
 * @param defaultValue - Default value if not set (defaults to empty string)
 * @returns The environment variable value or default
 */
export function env(name: string, defaultValue: string = ''): string {
  return process.env[name] ?? defaultValue;
}

/**
 * Print a message to the console.
 * @param message - The message to print
 */
export function print(message: unknown): void {
  console.log(message);
}

/**
 * Generate a UUID v4.
 * @returns A new UUID string
 */
export function uuid(): string {
  return crypto.randomUUID();
}
