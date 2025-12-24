import type { RuntimeState, ContextVariable } from './types';

// Build local context - variables from current frame only
// Pure function: takes full state, returns context array
// Note: Model variables are filtered out (they are config, not data for AI context)
export function buildLocalContext(state: RuntimeState): ContextVariable[] {
  const frameIndex = state.callStack.length - 1;
  const frame = state.callStack[frameIndex];
  if (!frame) return [];

  return Object.entries(frame.locals)
    .filter(([, variable]) => variable.typeAnnotation !== 'model')
    .map(([name, variable]) => ({
      name,
      value: variable.value,
      type: variable.typeAnnotation as 'text' | 'json' | null,
      isConst: variable.isConst,
      frameName: frame.name,
      frameDepth: frameIndex, // Depth from entry: 0 = entry, higher = deeper in call stack
    }));
}

// Build global context - variables from all frames in call stack
// Pure function: takes full state, returns context array
// Note: Model variables are filtered out (they are config, not data for AI context)
// Variables are returned with frameDepth: 0 = entry frame, higher = deeper in call stack
export function buildGlobalContext(state: RuntimeState): ContextVariable[] {
  return state.callStack.flatMap((frame, frameIndex) => {
    // frameDepth: 0 = entry (first in stack), higher = deeper calls
    const frameDepth = frameIndex;

    return Object.entries(frame.locals)
      .filter(([, variable]) => variable.typeAnnotation !== 'model')
      .map(([name, variable]) => ({
        name,
        value: variable.value,
        type: variable.typeAnnotation as 'text' | 'json' | null,
        isConst: variable.isConst,
        frameName: frame.name,
        frameDepth,
      }));
  });
}

// Formatted context for AI consumption
export interface FormattedContext {
  text: string;
  variables: ContextVariable[];
}

// Format context for AI calls with instructional wrapping
export function formatContextForAI(
  context: ContextVariable[],
  options?: { includeInstructions?: boolean }
): FormattedContext {
  const text = formatContextText(context, options?.includeInstructions ?? true);
  return { text, variables: context };
}

// Group variables by frame for structured output
function groupByFrame(variables: ContextVariable[]): Map<string, ContextVariable[]> {
  const groups = new Map<string, ContextVariable[]>();

  for (const v of variables) {
    const key = `${v.frameDepth}:${v.frameName}`;
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing, v]);
  }

  return groups;
}

// Format context as text with optional instruction header
// Variables are grouped by call stack frame in declaration order
function formatContextText(
  variables: ContextVariable[],
  includeInstructions: boolean
): string {
  const lines: string[] = [];

  if (includeInstructions) {
    lines.push('## VIBE Program Context');
    lines.push('Variables from the VIBE language call stack.');
    lines.push('');
  }

  if (variables.length > 0) {
    formatFrameGroups(variables, lines);
  }

  return lines.join('\n').trimEnd();
}

// Format variables grouped by frame with indentation
// Depth 0 = entry (leftmost), higher depth = deeper in call stack (more indented)
function formatFrameGroups(variables: ContextVariable[], lines: string[]): void {
  const frameGroups = groupByFrame(variables);
  const sortedKeys = [...frameGroups.keys()].sort((a, b) => {
    const depthA = parseInt(a.split(':')[0]);
    const depthB = parseInt(b.split(':')[0]);
    return depthA - depthB; // Lower depth (entry) first
  });

  // Find max depth to identify current scope
  const maxDepth = Math.max(...variables.map((v) => v.frameDepth));

  for (const key of sortedKeys) {
    const frameVars = frameGroups.get(key) ?? [];
    if (frameVars.length === 0) continue;

    const { frameName, frameDepth } = frameVars[0];
    // Label: entry at depth 0, current scope at max depth, otherwise show depth
    const scopeLabel =
      frameDepth === maxDepth
        ? '(current scope)'
        : frameDepth === 0
          ? '(entry)'
          : `(depth ${frameDepth})`;
    // Indent: base indent for section + extra indent per frame depth
    const indent = '  ' + '  '.repeat(frameDepth);
    lines.push(`${indent}${frameName} ${scopeLabel}`);

    for (const v of frameVars) {
      const typeStr = v.type ? ` (${v.type})` : '';
      const valueStr =
        typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value);
      lines.push(`${indent}  - ${v.name}${typeStr}: ${valueStr}`);
    }

    lines.push('');
  }
}
