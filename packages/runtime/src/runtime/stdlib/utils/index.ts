// System utility functions for Vibe scripts
// Import with: import { uuid, now, random, jsonParse, jsonStringify } from "system/utils"
//
// These are utility functions that can be called directly from Vibe scripts.
// For AI tools, use: import { readFile, writeFile, ... } from "system/tools"
//
// NOTE: print() and env() are auto-imported core functions.
// They are available everywhere without import.

/**
 * Generate a UUID v4.
 * @returns A new UUID string
 */
export function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Get the current timestamp in milliseconds.
 * @returns Unix timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Generate a random number.
 * Without arguments, returns a float between 0 and 1.
 * With min/max, returns an integer in the range [min, max] inclusive.
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns Random number
 */
export function random(min?: number, max?: number): number {
  if (min !== undefined && max !== undefined) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  return Math.random();
}

/**
 * Parse a JSON string into an object.
 * @param text - The JSON string to parse
 * @returns Parsed object
 */
export function jsonParse(text: string): unknown {
  return JSON.parse(text);
}

/**
 * Convert a value to a JSON string.
 * @param value - The value to stringify
 * @param pretty - Whether to format with indentation
 * @returns JSON string
 */
export function jsonStringify(value: unknown, pretty?: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}
