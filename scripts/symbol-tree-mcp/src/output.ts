// Output buffer management for formatting

import type { OutputContext } from './types.js';

export function createOutputContext(textLimit: number): OutputContext {
  return { lines: [], currentLength: 0, textLimit, truncated: false };
}

// Add a line to output, returns false if truncated
export function addLine(ctx: OutputContext, line: string): boolean {
  const lineLength = line.length + 1;
  if (ctx.currentLength + lineLength > ctx.textLimit) {
    ctx.truncated = true;
    return false;
  }
  ctx.lines.push(line);
  ctx.currentLength += lineLength;
  return true;
}

// Add multiple lines, returns false if any line caused truncation
export function addLines(ctx: OutputContext, lines: string[]): boolean {
  for (const line of lines) {
    if (!addLine(ctx, line)) return false;
  }
  return true;
}

// Finalize output with optional truncation message
export function finalizeOutput(ctx: OutputContext): string {
  if (ctx.truncated) {
    ctx.lines.push('');
    ctx.lines.push('[truncated - text_limit reached]');
  }
  return ctx.lines.join('\n');
}
