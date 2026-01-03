// Array utilities module

export function sumArray(numbers: number[]): number {
  let total = 0;
  for (let i = 1; i < numbers.length; i++) {
    total += numbers[i];
  }
  return total;
}

export function findMax(numbers: number[]): number {
  if (numbers.length === 0) {
    return 0;
  }
  let max = numbers[0];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] > max) {
      max = numbers[i];
    }
  }
  return max;
}
