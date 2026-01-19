// Standard library functions for Vibe scripts
// Import with: import { uuid } from "system"
//
// These are TypeScript functions that can be called directly from Vibe scripts.
// For AI tools, use: import { allTools } from "system/tools"
//
// NOTE: print() and env() are auto-imported core functions.
// They are available everywhere without import and CANNOT be imported from "system".

/**
 * Generate a UUID v4.
 * @returns A new UUID string
 */
export function uuid(): string {
  return crypto.randomUUID();
}
