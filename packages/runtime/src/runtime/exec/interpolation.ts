// String interpolation execution for Vibe
//
// Two contexts:
// 1. Regular strings: {var} expands to value
// 2. Prompt strings (do/vibe): {var} is a reference (left as-is), !{var} expands

import type { SourceLocation } from '../../errors';
import type { RuntimeState } from '../types';
import { resolveValue, isVibeValue } from '../types';
import { lookupVariable } from './variables';
import { unescapeBraces } from '../../parser/visitor/helpers';

// Pattern for interpolation: {var}, {obj.prop}, {arr[0]}, {arr[1:3]}, !{...}
// Captures: [1] = optional !, [2] = path (var.prop[0] etc.)
const INTERPOLATION_PATTERN = /(!?)\{(\w+(?:\.\w+|\[\d+\]|\[\d*:\d*\])*)\}/g;

// Pattern for simple variable detection (for async checking)
const SIMPLE_VAR_PATTERN = /(!?)\{(\w+)/g;

/**
 * Access path element types
 */
type AccessElement =
  | { type: 'property'; name: string }
  | { type: 'index'; value: number }
  | { type: 'slice'; start: number | null; end: number | null };

/**
 * Parsed interpolation reference
 */
interface InterpolationRef {
  varName: string;
  accessPath: AccessElement[];
  expand: boolean;  // true for !{...}, false for {...}
  fullMatch: string;
}

/**
 * Parse an access path like "obj.prop[0][1:3]" into structured elements
 */
function parseAccessPath(path: string): { varName: string; accessPath: AccessElement[] } {
  const accessPath: AccessElement[] = [];

  // Extract variable name (first identifier)
  const varMatch = path.match(/^(\w+)/);
  if (!varMatch) {
    return { varName: path, accessPath: [] };
  }

  const varName = varMatch[1];
  let remaining = path.slice(varName.length);

  while (remaining.length > 0) {
    // Property access: .propName
    if (remaining.startsWith('.')) {
      const propMatch = remaining.match(/^\.(\w+)/);
      if (propMatch) {
        accessPath.push({ type: 'property', name: propMatch[1] });
        remaining = remaining.slice(propMatch[0].length);
        continue;
      }
    }

    // Index or slice access: [n] or [start:end]
    if (remaining.startsWith('[')) {
      // Try slice first: [start:end], [:end], [start:], [:]
      const sliceMatch = remaining.match(/^\[(\d*):(\d*)\]/);
      if (sliceMatch) {
        accessPath.push({
          type: 'slice',
          start: sliceMatch[1] ? parseInt(sliceMatch[1], 10) : null,
          end: sliceMatch[2] ? parseInt(sliceMatch[2], 10) : null,
        });
        remaining = remaining.slice(sliceMatch[0].length);
        continue;
      }

      // Try index: [n]
      const indexMatch = remaining.match(/^\[(\d+)\]/);
      if (indexMatch) {
        accessPath.push({ type: 'index', value: parseInt(indexMatch[1], 10) });
        remaining = remaining.slice(indexMatch[0].length);
        continue;
      }
    }

    // Unknown syntax - stop parsing
    break;
  }

  return { varName, accessPath };
}

/**
 * Resolve a value following an access path
 */
function resolveAccessPath(value: unknown, accessPath: AccessElement[]): unknown {
  let current = value;

  for (const element of accessPath) {
    if (current === null || current === undefined) {
      return undefined;
    }

    switch (element.type) {
      case 'property':
        current = (current as Record<string, unknown>)[element.name];
        break;

      case 'index':
        current = (current as unknown[])[element.value];
        break;

      case 'slice': {
        const arr = current as unknown[];
        if (!Array.isArray(arr)) {
          return undefined;
        }
        const start = element.start ?? 0;
        const end = element.end ?? arr.length;
        current = arr.slice(start, end);
        break;
      }
    }
  }

  return current;
}

/**
 * Parse all interpolation references from a template string
 */
function parseInterpolations(template: string): InterpolationRef[] {
  const refs: InterpolationRef[] = [];
  INTERPOLATION_PATTERN.lastIndex = 0;

  let match;
  while ((match = INTERPOLATION_PATTERN.exec(template)) !== null) {
    const [fullMatch, bang, path] = match;
    const { varName, accessPath } = parseAccessPath(path);

    refs.push({
      varName,
      accessPath,
      expand: bang === '!',
      fullMatch,
    });
  }

  return refs;
}

/**
 * Check for pending async variables in the template
 */
function getPendingAsyncIds(state: RuntimeState, template: string): string[] {
  const pendingIds: string[] = [];
  SIMPLE_VAR_PATTERN.lastIndex = 0;

  let match;
  while ((match = SIMPLE_VAR_PATTERN.exec(template)) !== null) {
    const varName = match[2];
    const found = lookupVariable(state, varName);

    if (found) {
      const variable = found.variable;
      if (isVibeValue(variable) && variable.asyncOperationId) {
        const opId = variable.asyncOperationId;
        const operation = state.asyncOperations.get(opId);
        if (operation && (operation.status === 'pending' || operation.status === 'running')) {
          if (!pendingIds.includes(opId)) {
            pendingIds.push(opId);
          }
        }
      }
    }
  }

  return pendingIds;
}

/**
 * Resolve a single interpolation reference to a string value
 */
function resolveInterpolationToString(state: RuntimeState, ref: InterpolationRef): string {
  const found = lookupVariable(state, ref.varName);

  if (!found) {
    // Variable not found - leave as placeholder
    return ref.fullMatch;
  }

  // Get the raw value, resolving VibeValue if needed
  let value = resolveValue(found.variable.value);

  // Follow access path
  if (ref.accessPath.length > 0) {
    value = resolveAccessPath(value, ref.accessPath);
  }

  // Convert to string
  if (value === undefined) {
    return ref.fullMatch;
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Core interpolation logic shared between regular and prompt string contexts.
 *
 * Regular strings: all {var} patterns expand to their value.
 * Prompt strings: {var} is left as-is (reference for AI), only !{var} expands.
 */
function interpolateString(
  state: RuntimeState,
  template: string,
  isPromptContext: boolean,
  location?: SourceLocation
): RuntimeState {
  // Check for pending async variables
  const pendingAsyncIds = getPendingAsyncIds(state, template);

  if (pendingAsyncIds.length > 0) {
    const retryOp = isPromptContext ? 'interpolate_prompt_string' as const : 'interpolate_string' as const;
    return {
      ...state,
      status: 'awaiting_async',
      awaitingAsyncIds: pendingAsyncIds,
      instructionStack: [
        { op: retryOp, template, location: location ?? { line: 0, column: 0 } },
        ...state.instructionStack,
      ],
    };
  }

  // Perform interpolation
  const result = template.replace(INTERPOLATION_PATTERN, (fullMatch, bang, path) => {
    const isExpansion = bang === '!';

    // In prompt context, non-expansion refs are left as-is for the AI
    if (isPromptContext && !isExpansion) {
      return fullMatch;
    }

    // Expand: resolve variable and convert to string
    const { varName, accessPath } = parseAccessPath(path);
    const ref: InterpolationRef = { varName, accessPath, expand: true, fullMatch };
    return resolveInterpolationToString(state, ref);
  });

  return { ...state, lastResult: unescapeBraces(result) };
}

/**
 * Regular string interpolation - {var} expands to value.
 */
export function execInterpolateRegularString(
  state: RuntimeState,
  template: string,
  location?: SourceLocation
): RuntimeState {
  return interpolateString(state, template, false, location);
}

/**
 * Prompt string interpolation - {var} is reference (left as-is), !{var} expands.
 */
export function execInterpolatePromptString(
  state: RuntimeState,
  template: string,
  location?: SourceLocation
): RuntimeState {
  return interpolateString(state, template, true, location);
}

/**
 * Clear prompt context flag
 */
export function execClearPromptContext(state: RuntimeState): RuntimeState {
  return {
    ...state,
    inPromptContext: false,
  };
}
