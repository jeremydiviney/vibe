import type { RuntimeState, ContextVariable, ContextEntry, ContextPrompt } from './types';

// Types that are filtered from context (config/instructions, not data for AI)
const FILTERED_TYPES = ['model', 'prompt'];

// Build local context - entries from current frame only
// Pure function: takes full state, returns context array
// Note: Model and prompt variables are filtered out (they are config/instructions, not data for AI context)
export function buildLocalContext(state: RuntimeState): ContextEntry[] {
  const frameIndex = state.callStack.length - 1;
  const frame = state.callStack[frameIndex];
  if (!frame) return [];

  return frame.orderedEntries
    .flatMap((entry): ContextEntry[] => {
      if (entry.kind === 'variable') {
        const variable = frame.locals[entry.name];
        if (!variable || FILTERED_TYPES.includes(variable.typeAnnotation ?? '')) {
          return [];
        }
        return [{
          kind: 'variable',
          name: entry.name,
          value: variable.value,
          type: variable.typeAnnotation as 'text' | 'json' | null,
          isConst: variable.isConst,
          source: variable.source,
          frameName: frame.name,
          frameDepth: frameIndex,
        }];
      } else {
        // Prompt entry
        return [{
          kind: 'prompt',
          aiType: entry.aiType,
          prompt: entry.prompt,
          frameName: frame.name,
          frameDepth: frameIndex,
        }];
      }
    });
}

// Build global context - entries from all frames in call stack
// Pure function: takes full state, returns context array
// Note: Model and prompt variables are filtered out (they are config/instructions, not data for AI context)
// Entries are returned with frameDepth: 0 = entry frame, higher = deeper in call stack
export function buildGlobalContext(state: RuntimeState): ContextEntry[] {
  return state.callStack.flatMap((frame, frameIndex) => {
    const frameDepth = frameIndex;

    return frame.orderedEntries.flatMap((entry): ContextEntry[] => {
      if (entry.kind === 'variable') {
        const variable = frame.locals[entry.name];
        if (!variable || FILTERED_TYPES.includes(variable.typeAnnotation ?? '')) {
          return [];
        }
        return [{
          kind: 'variable',
          name: entry.name,
          value: variable.value,
          type: variable.typeAnnotation as 'text' | 'json' | null,
          isConst: variable.isConst,
          source: variable.source,
          frameName: frame.name,
          frameDepth,
        }];
      } else {
        // Prompt entry
        return [{
          kind: 'prompt',
          aiType: entry.aiType,
          prompt: entry.prompt,
          frameName: frame.name,
          frameDepth,
        }];
      }
    });
  });
}

// Formatted context for AI consumption
export interface FormattedContext {
  text: string;
  variables: ContextEntry[];
}

// Format context for AI calls with instructional wrapping
export function formatContextForAI(
  context: ContextEntry[],
  options?: { includeInstructions?: boolean }
): FormattedContext {
  const text = formatContextText(context, options?.includeInstructions ?? true);
  return { text, variables: context };
}

// Group entries by frame for structured output
function groupByFrame(entries: ContextEntry[]): Map<string, ContextEntry[]> {
  const groups = new Map<string, ContextEntry[]>();

  for (const entry of entries) {
    const key = `${entry.frameDepth}:${entry.frameName}`;
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing, entry]);
  }

  return groups;
}

// Format context as text with optional instruction header
// Entries are grouped by call stack frame in execution order
function formatContextText(
  entries: ContextEntry[],
  includeInstructions: boolean
): string {
  const lines: string[] = [];

  if (includeInstructions) {
    lines.push('## VIBE Program Context');
    lines.push('Variables from the VIBE language call stack.');
    lines.push('');
  }

  if (entries.length > 0) {
    formatFrameGroups(entries, lines);
  }

  return lines.join('\n').trimEnd();
}

// Format entries grouped by frame with indentation
// Depth 0 = entry (leftmost), higher depth = deeper in call stack (more indented)
function formatFrameGroups(entries: ContextEntry[], lines: string[]): void {
  const frameGroups = groupByFrame(entries);
  const sortedKeys = [...frameGroups.keys()].sort((a, b) => {
    const depthA = parseInt(a.split(':')[0]);
    const depthB = parseInt(b.split(':')[0]);
    return depthA - depthB; // Lower depth (entry) first
  });

  // Find max depth to identify current scope
  const maxDepth = Math.max(...entries.map((e) => e.frameDepth));

  for (const key of sortedKeys) {
    const frameEntries = frameGroups.get(key) ?? [];
    if (frameEntries.length === 0) continue;

    const { frameName, frameDepth } = frameEntries[0];
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

    for (const entry of frameEntries) {
      if (entry.kind === 'variable') {
        const typeStr = entry.type ? ` (${entry.type})` : '';
        const valueStr =
          typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value);
        // Use <-- for AI/user responses, - for regular variables
        const prefix = entry.source === 'ai' || entry.source === 'user' ? '<--' : '-';
        lines.push(`${indent}  ${prefix} ${entry.name}${typeStr}: ${valueStr}`);
      } else {
        // Prompt entry
        lines.push(`${indent}  --> ${entry.aiType}: "${entry.prompt}"`);
      }
    }

    lines.push('');
  }
}
