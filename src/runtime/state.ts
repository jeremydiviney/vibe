import * as AST from '../ast';
import type { RuntimeState, AIOperation, AIInteraction, StackFrame } from './types';

// Options for creating initial state
export interface InitialStateOptions {
  logAiInteractions?: boolean;
}

// Create initial runtime state from a program AST
export function createInitialState(
  program: AST.Program,
  options?: InitialStateOptions
): RuntimeState {
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
    .map((stmt) => ({ op: 'exec_statement' as const, stmt, location: stmt.location }));

  return {
    status: 'running',
    program,
    functions,
    tsModules: {},
    vibeModules: {},
    importedNames: {},
    callStack: [createFrame('<entry>')],
    instructionStack,
    valueStack: [],
    lastResult: null,
    lastResultSource: undefined,
    aiHistory: [],
    executionLog: [],
    logAiInteractions: options?.logAiInteractions ?? false,
    aiInteractions: [],
    localContext: [],
    globalContext: [],
    pendingAI: null,
    pendingTS: null,
    pendingImportedTsCall: null,
    error: null,
    errorObject: null,
  };
}

// Create a new stack frame
export function createFrame(name: string, parentFrameIndex: number | null = null): StackFrame {
  return {
    name,
    locals: {},
    parentFrameIndex,
    orderedEntries: [],
  };
}

// Resume execution after AI response
export function resumeWithAIResponse(
  state: RuntimeState,
  response: unknown,
  interaction?: AIInteraction
): RuntimeState {
  if (state.status !== 'awaiting_ai' || !state.pendingAI) {
    throw new Error('Cannot resume: not awaiting AI response');
  }

  const responseStr = typeof response === 'string' ? response : JSON.stringify(response);
  const pendingAI = state.pendingAI;

  const aiOp: AIOperation = {
    type: pendingAI.type,
    prompt: pendingAI.prompt,
    response: responseStr,
    timestamp: Date.now(),
  };

  // Add interaction to log if provided and logging is enabled
  const aiInteractions = state.logAiInteractions && interaction
    ? [...state.aiInteractions, interaction]
    : state.aiInteractions;

  // Add the completed prompt to orderedEntries in current frame (with response for history)
  const frame = state.callStack[state.callStack.length - 1];
  const newOrderedEntries = [
    ...frame.orderedEntries,
    {
      kind: 'prompt' as const,
      aiType: pendingAI.type as 'do' | 'ask' | 'vibe',
      prompt: pendingAI.prompt,
      response,  // Include response for context history
    }
  ];
  const updatedCallStack = [
    ...state.callStack.slice(0, -1),
    { ...frame, orderedEntries: newOrderedEntries },
  ];

  return {
    ...state,
    status: 'running',
    lastResult: response,
    lastResultSource: 'ai',
    callStack: updatedCallStack,
    aiHistory: [...state.aiHistory, aiOp],
    aiInteractions,
    pendingAI: null,
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: `ai_${pendingAI.type}_response`,
        details: { prompt: pendingAI.prompt },
        result: responseStr,
      },
    ],
  };
}

// Resume execution after user input
export function resumeWithUserInput(state: RuntimeState, input: string): RuntimeState {
  if (state.status !== 'awaiting_user' || !state.pendingAI) {
    throw new Error('Cannot resume: not awaiting user input');
  }

  const pendingAI = state.pendingAI;

  const aiOp: AIOperation = {
    type: 'ask',
    prompt: pendingAI.prompt,
    response: input,
    timestamp: Date.now(),
  };

  // Add the completed prompt to orderedEntries in current frame (with response for history)
  const frame = state.callStack[state.callStack.length - 1];
  const newOrderedEntries = [
    ...frame.orderedEntries,
    {
      kind: 'prompt' as const,
      aiType: 'ask' as const,
      prompt: pendingAI.prompt,
      response: input,  // Include user input for context history
    }
  ];
  const updatedCallStack = [
    ...state.callStack.slice(0, -1),
    { ...frame, orderedEntries: newOrderedEntries },
  ];

  return {
    ...state,
    status: 'running',
    lastResult: input,
    lastResultSource: 'user',
    callStack: updatedCallStack,
    aiHistory: [...state.aiHistory, aiOp],
    pendingAI: null,
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'user_input_response',
        details: { prompt: pendingAI.prompt },
        result: input,
      },
    ],
  };
}

// Resume execution after TypeScript evaluation (inline ts block)
export function resumeWithTsResult(state: RuntimeState, result: unknown): RuntimeState {
  if (state.status !== 'awaiting_ts' || !state.pendingTS) {
    throw new Error('Cannot resume: not awaiting TypeScript result');
  }

  return {
    ...state,
    status: 'running',
    lastResult: result,
    pendingTS: null,
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ts_eval_result',
        details: { params: state.pendingTS.params },
        result,
      },
    ],
  };
}

// Resume execution after imported TS function call
export function resumeWithImportedTsResult(state: RuntimeState, result: unknown): RuntimeState {
  if (state.status !== 'awaiting_ts' || !state.pendingImportedTsCall) {
    throw new Error('Cannot resume: not awaiting imported TS function result');
  }

  return {
    ...state,
    status: 'running',
    lastResult: result,
    pendingImportedTsCall: null,
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'imported_ts_call_result',
        details: { funcName: state.pendingImportedTsCall.funcName },
        result,
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

// Get variable value (walks scope chain)
export function getVariable(state: RuntimeState, name: string): unknown {
  // Walk the scope chain
  let frameIndex: number | null = state.callStack.length - 1;
  while (frameIndex !== null && frameIndex >= 0) {
    const frame: StackFrame = state.callStack[frameIndex];
    const variable = frame.locals[name];
    if (variable) {
      return variable.value;
    }
    frameIndex = frame.parentFrameIndex;
  }

  // Check if it's a function
  if (state.functions[name]) {
    return { __vibeFunction: true, name };
  }

  throw new Error(`ReferenceError: '${name}' is not defined`);
}
