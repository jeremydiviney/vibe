/**
 * Test fixture for TS type checking tests
 */

// Function declaration
export function add(a: number, b: number): number {
  return a + b;
}

// Arrow function
export const multiply = (a: number, b: number): number => a * b;

// Function with optional parameter
export function greet(name: string, greeting?: string): string {
  return `${greeting ?? 'Hello'}, ${name}!`;
}

// Function with object parameter
export function processData(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

// Function with array parameter
export function sumArray(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

// Function with default parameter
export function repeat(str: string, times: number = 1): string {
  return str.repeat(times);
}
