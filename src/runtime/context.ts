import type { RuntimeState, ContextVariable } from './types';

// Build local context - variables from current frame only
// Pure function: takes full state, returns context array
export function buildLocalContext(state: RuntimeState): ContextVariable[] {
  const frame = state.callStack[state.callStack.length - 1];
  if (!frame) return [];

  return Object.entries(frame.locals).map(([name, variable]) => ({
    name,
    value: variable.value,
    type: variable.typeAnnotation as 'text' | 'json' | 'model' | null,
  }));
}

// Build global context - variables from all frames in call stack
// Pure function: takes full state, returns context array
export function buildGlobalContext(state: RuntimeState): ContextVariable[] {
  const variables: ContextVariable[] = [];

  for (const frame of state.callStack) {
    for (const [name, variable] of Object.entries(frame.locals)) {
      variables.push({
        name,
        value: variable.value,
        type: variable.typeAnnotation as 'text' | 'json' | 'model' | null,
      });
    }
  }

  return variables;
}
