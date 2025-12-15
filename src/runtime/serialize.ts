import type { RuntimeState } from './types';

// Serialize runtime state to JSON string
export function serializeState(state: RuntimeState): string {
  return JSON.stringify(state, null, 2);
}

// Deserialize runtime state from JSON string
export function deserializeState(json: string): RuntimeState {
  const state = JSON.parse(json) as RuntimeState;

  // Validate required fields
  if (!state.status) {
    throw new Error('Invalid state: missing status');
  }
  if (!state.program) {
    throw new Error('Invalid state: missing program');
  }
  if (!Array.isArray(state.callStack)) {
    throw new Error('Invalid state: missing or invalid callStack');
  }
  if (!Array.isArray(state.instructionStack)) {
    throw new Error('Invalid state: missing or invalid instructionStack');
  }

  return state;
}

// Create a deep clone of the state (useful for debugging/testing)
export function cloneState(state: RuntimeState): RuntimeState {
  return JSON.parse(JSON.stringify(state)) as RuntimeState;
}

// Get a summary of the current state (for debugging)
export function getStateSummary(state: RuntimeState): {
  status: string;
  frameCount: number;
  currentFrame: string;
  instructionCount: number;
  nextInstruction: string | null;
  variables: Record<string, unknown>;
  lastResult: unknown;
} {
  const currentFrame = state.callStack[state.callStack.length - 1];
  const nextInstruction = state.instructionStack[0];

  const variables: Record<string, unknown> = {};
  if (currentFrame) {
    for (const [name, variable] of Object.entries(currentFrame.locals)) {
      variables[name] = variable.value;
    }
  }

  return {
    status: state.status,
    frameCount: state.callStack.length,
    currentFrame: currentFrame?.name ?? 'none',
    instructionCount: state.instructionStack.length,
    nextInstruction: nextInstruction ? nextInstruction.op : null,
    variables,
    lastResult: state.lastResult,
  };
}
