// System module - re-exports utility functions for convenience
// Prefer importing from "system/utils" directly.
//
// Import with: import { uuid, random, now } from "system"
// Or directly: import { uuid, random, now } from "system/utils"
//
// For AI tools, use: import { allTools } from "system/tools"
//
// NOTE: print() and env() are auto-imported core functions.
// They are available everywhere without import.

export { uuid, now, random, jsonParse, jsonStringify } from './utils';
