import * as AST from '../ast';
import type { RuntimeState, AIOperation, StackFrame } from './types';

// Create initial runtime state from a program AST
export function createInitialState(program: AST.Program): RuntimeState {
  // Collect function declarations
  const functions: Record<string, AST.FunctionDeclaration> = {};
  for (const stmt of program.body) {
    if (stmt.type === 'FunctionDeclaration') {
      functions[stmt.name] = stmt;
    }
  }

  // Create initial instruction stack with all top-level statements
  // We pop from the front, so first statement should be at index 0
  const instructionStack = program.body
    .map((stmt) => ({ op: 'exec_statement' as const, stmt }));

  return {
    status: 'running',
    program,
    functions,
    callStack: [createFrame('main')],
    instructionStack,
    valueStack: [],
    lastResult: null,
    aiHistory: [],
    executionLog: [],
    pendingAI: null,
    error: null,
  };
}

// Create a new stack frame
export function createFrame(name: string): StackFrame {
  return {
    name,
    locals: {},
  };
}

// Resume execution after AI response
export function resumeWithAIResponse(state: RuntimeState, response: string): RuntimeState {
  if (state.status !== 'awaiting_ai' || !state.pendingAI) {
    throw new Error('Cannot resume: not awaiting AI response');
  }

  const aiOp: AIOperation = {
    type: state.pendingAI.type,
    prompt: state.pendingAI.prompt,
    response,
    timestamp: Date.now(),
  };

  return {
    ...state,
    status: 'running',
    lastResult: response,
    aiHistory: [...state.aiHistory, aiOp],
    pendingAI: null,
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: `ai_${state.pendingAI.type}_response`,
        details: { prompt: state.pendingAI.prompt },
        result: response,
      },
    ],
  };
}

// Resume execution after user input
export function resumeWithUserInput(state: RuntimeState, input: string): RuntimeState {
  if (state.status !== 'awaiting_user' || !state.pendingAI) {
    throw new Error('Cannot resume: not awaiting user input');
  }

  const aiOp: AIOperation = {
    type: 'ask',
    prompt: state.pendingAI.prompt,
    response: input,
    timestamp: Date.now(),
  };

  return {
    ...state,
    status: 'running',
    lastResult: input,
    aiHistory: [...state.aiHistory, aiOp],
    pendingAI: null,
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'user_input_response',
        details: { prompt: state.pendingAI.prompt },
        result: input,
      },
    ],
  };
}

// Pause execution manually
export function pauseExecution(state: RuntimeState): RuntimeState {
  if (state.status !== 'running') {
    return state;
  }
  return {
    ...state,
    status: 'paused',
  };
}

// Resume from manual pause
export function resumeExecution(state: RuntimeState): RuntimeState {
  if (state.status !== 'paused') {
    return state;
  }
  return {
    ...state,
    status: 'running',
  };
}

// Get current frame
export function currentFrame(state: RuntimeState): StackFrame {
  const frame = state.callStack[state.callStack.length - 1];
  if (!frame) {
    throw new Error('No active stack frame');
  }
  return frame;
}

// Get variable value
export function getVariable(state: RuntimeState, name: string): unknown {
  const frame = currentFrame(state);
  const variable = frame.locals[name];

  if (variable) {
    return variable.value;
  }

  // Check if it's a function
  if (state.functions[name]) {
    return { __vibeFunction: true, name };
  }

  throw new Error(`ReferenceError: '${name}' is not defined`);
}
