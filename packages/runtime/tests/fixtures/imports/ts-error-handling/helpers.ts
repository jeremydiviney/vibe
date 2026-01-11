// TypeScript helpers that throw errors for testing error handling

/**
 * A function that always throws an error.
 * Used to test that stack traces include the correct file and line.
 */
export function alwaysThrows(): never {
  throw new Error('This function always throws');
}

/**
 * A function that throws when given invalid input.
 */
export function validatePositive(n: number): number {
  if (n < 0) {
    throw new RangeError(`Expected positive number, got ${n}`);
  }
  return n;
}

/**
 * A function that accesses a property on null (TypeError).
 */
export function accessNullProperty(): string {
  const obj: { name: string } | null = null;
  return obj!.name; // This will throw TypeError
}

/**
 * A nested function call that throws - to test stack trace depth.
 */
export function outerFunction(): void {
  innerFunction();
}

function innerFunction(): void {
  deepFunction();
}

function deepFunction(): never {
  throw new Error('Error from deep in the call stack');
}
