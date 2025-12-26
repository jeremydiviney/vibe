// Test various TS exports - functions and non-functions

export const PI = 3.14159;
export const CONFIG = { name: "test", version: "1.0" };
export const ITEMS = ["a", "b", "c"];
export const MESSAGE = "Hello from TypeScript";

export function greet(name: string): string {
  return `Hello, ${name}!`;
}
