import type { RuntimeState, ContextEntry, ContextVariable, ContextPrompt, ContextToolCall, FrameEntry } from './types';
import { resolveValue } from './types';

// Types that are filtered from context (config/instructions, not data for AI)
const FILTERED_TYPES = ['model', 'prompt'];

// Build local context - entries from current frame only
// Pure function: takes full state, returns context array
// Uses snapshotted values from entries for accurate history
// Note: Model and prompt variables are filtered out (they are config/instructions, not data for AI context)
export function buildLocalContext(state: RuntimeState): ContextEntry[] {
  const frameIndex = state.callStack.length - 1;
  const frame = state.callStack[frameIndex];
  if (!frame) return [];

  return frame.orderedEntries
    .flatMap((entry): ContextEntry[] => {
      if (entry.kind === 'variable') {
        // Filter out model and prompt types
        if (FILTERED_TYPES.includes(entry.type ?? '')) {
          return [];
        }
        // Use snapshotted value from entry, resolving AIResultObject to its value
        const contextVar: ContextEntry = {
          kind: 'variable',
          name: entry.name,
          value: resolveValue(entry.value),  // Resolve AIResultObject to primitive
          type: entry.type as 'text' | 'json' | 'boolean' | 'number' | null,
          isConst: entry.isConst,  // Use snapshotted isConst
          frameName: frame.name,
          frameDepth: frameIndex,
        };
        // Only include source if defined
        if (entry.source !== undefined) {
          (contextVar as ContextVariable).source = entry.source;
        }
        return [contextVar];
      } else if (entry.kind === 'prompt') {
        const contextPrompt: ContextPrompt = {
          kind: 'prompt',
          aiType: entry.aiType,
          prompt: entry.prompt,
          frameName: frame.name,
          frameDepth: frameIndex,
        };
        // Include toolCalls if present
        if (entry.toolCalls && entry.toolCalls.length > 0) {
          contextPrompt.toolCalls = entry.toolCalls;
        }
        // Only include response if defined
        if (entry.response !== undefined) {
          contextPrompt.response = entry.response;
        }
        return [contextPrompt];
      } else if (entry.kind === 'scope-enter' || entry.kind === 'scope-exit') {
        return [{
          kind: entry.kind,
          scopeType: entry.scopeType,
          label: entry.label,
          frameName: frame.name,
          frameDepth: frameIndex,
        }];
      } else if (entry.kind === 'summary') {
        return [{
          kind: 'summary',
          text: entry.text,
          frameName: frame.name,
          frameDepth: frameIndex,
        }];
      } else if (entry.kind === 'tool-call') {
        const toolEntry: ContextToolCall = {
          kind: 'tool-call',
          toolName: entry.toolName,
          args: entry.args,
          frameName: frame.name,
          frameDepth: frameIndex,
        };
        if (entry.result !== undefined) {
          toolEntry.result = entry.result;
        }
        if (entry.error !== undefined) {
          toolEntry.error = entry.error;
        }
        return [toolEntry];
      }
      return [];
    });
}

// Build global context - entries from all frames in call stack
// Pure function: takes full state, returns context array
// Uses snapshotted values from entries for accurate history
// Note: Model and prompt variables are filtered out (they are config/instructions, not data for AI context)
// Entries are returned with frameDepth: 0 = entry frame, higher = deeper in call stack
export function buildGlobalContext(state: RuntimeState): ContextEntry[] {
  return state.callStack.flatMap((frame, frameIndex) => {
    const frameDepth = frameIndex;

    return frame.orderedEntries.flatMap((entry): ContextEntry[] => {
      if (entry.kind === 'variable') {
        // Filter out model and prompt types
        if (FILTERED_TYPES.includes(entry.type ?? '')) {
          return [];
        }
        // Use snapshotted value from entry, resolving AIResultObject to its value
        const contextVar: ContextEntry = {
          kind: 'variable',
          name: entry.name,
          value: resolveValue(entry.value),  // Resolve AIResultObject to primitive
          type: entry.type as 'text' | 'json' | 'boolean' | 'number' | null,
          isConst: entry.isConst,  // Use snapshotted isConst
          frameName: frame.name,
          frameDepth,
        };
        // Only include source if defined
        if (entry.source !== undefined) {
          (contextVar as ContextVariable).source = entry.source;
        }
        return [contextVar];
      } else if (entry.kind === 'prompt') {
        const contextPrompt: ContextPrompt = {
          kind: 'prompt',
          aiType: entry.aiType,
          prompt: entry.prompt,
          frameName: frame.name,
          frameDepth,
        };
        // Include toolCalls if present
        if (entry.toolCalls && entry.toolCalls.length > 0) {
          contextPrompt.toolCalls = entry.toolCalls;
        }
        // Only include response if defined
        if (entry.response !== undefined) {
          contextPrompt.response = entry.response;
        }
        return [contextPrompt];
      } else if (entry.kind === 'scope-enter' || entry.kind === 'scope-exit') {
        return [{
          kind: entry.kind,
          scopeType: entry.scopeType,
          label: entry.label,
          frameName: frame.name,
          frameDepth,
        }];
      } else if (entry.kind === 'summary') {
        return [{
          kind: 'summary',
          text: entry.text,
          frameName: frame.name,
          frameDepth,
        }];
      } else if (entry.kind === 'tool-call') {
        const toolEntry: ContextToolCall = {
          kind: 'tool-call',
          toolName: entry.toolName,
          args: entry.args,
          frameName: frame.name,
          frameDepth,
        };
        if (entry.result !== undefined) {
          toolEntry.result = entry.result;
        }
        if (entry.error !== undefined) {
          toolEntry.error = entry.error;
        }
        return [toolEntry];
      }
      return [];
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
      } else if (entry.kind === 'prompt') {
        // Prompt entry: AI call → tool calls → response
        lines.push(`${indent}  --> ${entry.aiType}: "${entry.prompt}"`);
        // Format tool calls in order (between prompt and response)
        if (entry.toolCalls && entry.toolCalls.length > 0) {
          for (const toolCall of entry.toolCalls) {
            const argsStr = JSON.stringify(toolCall.args);
            lines.push(`${indent}  [tool] ${toolCall.toolName}(${argsStr})`);
            if (toolCall.error) {
              lines.push(`${indent}  [error] ${toolCall.error}`);
            } else if (toolCall.result !== undefined) {
              const resultStr =
                typeof toolCall.result === 'object' ? JSON.stringify(toolCall.result) : String(toolCall.result);
              lines.push(`${indent}  [result] ${resultStr}`);
            }
          }
        }
        // Note: We don't show the response here because it will be shown
        // with the variable assignment that follows (with source: 'ai')
        // This avoids duplication like:
        //   --> do: "prompt"
        //   <-- response      <- would be duplicate
        //   <-- varName: response
      } else if (entry.kind === 'scope-enter') {
        // Scope enter marker
        const labelStr = entry.label ? ` ${entry.label}` : '';
        lines.push(`${indent}  ==> ${entry.scopeType}${labelStr}`);
      } else if (entry.kind === 'scope-exit') {
        // Scope exit marker
        const labelStr = entry.label ? ` ${entry.label}` : '';
        lines.push(`${indent}  <== ${entry.scopeType}${labelStr}`);
      } else if (entry.kind === 'summary') {
        // Summary from compress mode
        lines.push(`${indent}  [summary] ${entry.text}`);
      } else if (entry.kind === 'tool-call') {
        // Tool call with args and result/error
        const argsStr = JSON.stringify(entry.args);
        lines.push(`${indent}  [tool] ${entry.toolName}(${argsStr})`);
        if (entry.error) {
          lines.push(`${indent}  [error] ${entry.error}`);
        } else if (entry.result !== undefined) {
          const resultStr =
            typeof entry.result === 'object' ? JSON.stringify(entry.result) : String(entry.result);
          lines.push(`${indent}  [result] ${resultStr}`);
        }
      }
    }

    lines.push('');
  }
}

/**
 * Format FrameEntries for AI summarization (used by compress mode).
 * Converts frame entries into a human-readable format suitable for AI summarization.
 */
export function formatEntriesForSummarization(entries: FrameEntry[]): string {
  const lines: string[] = [];

  for (const entry of entries) {
    if (entry.kind === 'variable') {
      const typeStr = entry.type ? ` (${entry.type})` : '';
      const valueStr = typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value);
      const sourceStr = entry.source === 'ai' ? ' [from AI]' : entry.source === 'user' ? ' [from user]' : '';
      lines.push(`Variable ${entry.name}${typeStr} = ${valueStr}${sourceStr}`);
    } else if (entry.kind === 'prompt') {
      lines.push(`AI ${entry.aiType}: "${entry.prompt}"`);
      if (entry.toolCalls && entry.toolCalls.length > 0) {
        for (const toolCall of entry.toolCalls) {
          const argsStr = JSON.stringify(toolCall.args);
          lines.push(`  Tool call: ${toolCall.toolName}(${argsStr})`);
          if (toolCall.error) {
            lines.push(`  Error: ${toolCall.error}`);
          } else if (toolCall.result !== undefined) {
            const resultStr = typeof toolCall.result === 'object' ? JSON.stringify(toolCall.result) : String(toolCall.result);
            lines.push(`  Result: ${resultStr}`);
          }
        }
      }
      if (entry.response !== undefined) {
        const responseStr = typeof entry.response === 'object' ? JSON.stringify(entry.response) : String(entry.response);
        lines.push(`  Response: ${responseStr}`);
      }
    } else if (entry.kind === 'scope-enter') {
      const labelStr = entry.label ? ` (${entry.label})` : '';
      lines.push(`==> ${entry.scopeType}${labelStr} started`);
    } else if (entry.kind === 'scope-exit') {
      const labelStr = entry.label ? ` (${entry.label})` : '';
      lines.push(`<== ${entry.scopeType}${labelStr} ended`);
    } else if (entry.kind === 'summary') {
      lines.push(`Summary: ${entry.text}`);
    } else if (entry.kind === 'tool-call') {
      const argsStr = JSON.stringify(entry.args);
      lines.push(`Tool call: ${entry.toolName}(${argsStr})`);
      if (entry.error) {
        lines.push(`  Error: ${entry.error}`);
      } else if (entry.result !== undefined) {
        const resultStr = typeof entry.result === 'object' ? JSON.stringify(entry.result) : String(entry.result);
        lines.push(`  Result: ${resultStr}`);
      }
    }
  }

  return lines.join('\n');
}
