import * as AST from '../ast';
import type { RuntimeState, AIOperation, AIInteraction, StackFrame, FrameEntry, PromptToolCall, ToolCallRecord, VibeValue } from './types';
import { createVibeValue, createVibeError } from './types';
import type { ToolRoundResult } from './ai/tool-loop';
import type { ModelUsageRecord } from './ai/types';

// Options for creating initial state
export interface InitialStateOptions {
  logAiInteractions?: boolean;
  rootDir?: string;       // Root directory for file operation sandboxing (defaults to cwd)
  maxParallel?: number;   // Max concurrent async operations (default: 4)
}

// Create initial runtime state from a program AST
export function createInitialState(
  program: AST.Program,
  options?: InitialStateOptions
): RuntimeState {
  // Collect function declarations (including exported ones)
  const functions: Record<string, AST.FunctionDeclaration> = {};
  for (const stmt of program.body) {
    if (stmt.type === 'FunctionDeclaration') {
      functions[stmt.name] = stmt;
    } else if (stmt.type === 'ExportDeclaration' && stmt.declaration.type === 'FunctionDeclaration') {
      functions[stmt.declaration.name] = stmt.declaration;
    }
  }

  // Collect type declarations (both standalone and exported)
  const typeDefinitions = new Map<string, AST.StructuralType>();
  for (const stmt of program.body) {
    if (stmt.type === 'TypeDeclaration') {
      typeDefinitions.set(stmt.name, stmt.structure);
    } else if (stmt.type === 'ExportDeclaration' && stmt.declaration.type === 'TypeDeclaration') {
      typeDefinitions.set(stmt.declaration.name, stmt.declaration.structure);
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
    typeDefinitions,
    tsModules: {},
    vibeModules: {},
    importedNames: {},
    callStack: [createFrame('<entry>')],
    instructionStack,
    valueStack: [],
    lastResult: null,
    lastResultSource: null,
    aiHistory: [],
    executionLog: [],
    logAiInteractions: options?.logAiInteractions ?? false,
    aiInteractions: [],
    localContext: [],
    globalContext: [],
    pendingAI: null,
    pendingCompress: null,
    pendingTS: null,
    pendingImportedTsCall: null,
    pendingToolCall: null,
    pendingDestructuring: null,
    expectedFields: null,
    lastUsedModel: null,
    rootDir: options?.rootDir ?? process.cwd(),
    error: null,
    errorObject: null,

    // Async execution tracking
    asyncOperations: new Map(),
    pendingAsyncIds: new Set(),
    asyncVarToOpId: new Map(),
    asyncWaves: [],
    currentWaveId: 0,
    maxParallel: options?.maxParallel ?? 4,
    nextAsyncId: 1,
    awaitingAsyncIds: [],

    // Async declaration context (null when not in async declaration)
    asyncContext: null,

    // Async function isolation
    isInAsyncIsolation: false,

    // Scheduled async operations
    pendingAsyncStarts: [],

    // String interpolation context (for prompt strings in do/vibe)
    inPromptContext: false,
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
  interaction?: AIInteraction,
  toolRounds?: ToolRoundResult[],
  usageRecord?: ModelUsageRecord,
  textContent?: string,
  error?: Error | string
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

  // Build ordered entries with prompt containing embedded tool calls
  const frame = state.callStack[state.callStack.length - 1];

  // Convert tool rounds to PromptToolCall format (embedded in prompt entry for context)
  const promptToolCalls: PromptToolCall[] = (toolRounds ?? []).flatMap((round) =>
    round.toolCalls.map((call, index) => {
      const result = round.results[index];
      const toolCall: PromptToolCall = {
        toolName: call.toolName,
        args: call.args,
      };
      if (result?.error) {
        toolCall.error = result.error;
      } else if (result?.result !== undefined) {
        toolCall.result = result.result;
      }
      return toolCall;
    })
  );

  // Build ToolCallRecord array for VibeValue (all rounds accumulated)
  const toolCallRecords: ToolCallRecord[] = (toolRounds ?? []).flatMap((round) =>
    round.toolCalls.map((call, index) => {
      const result = round.results[index];
      const error = result?.error;
      return {
        toolName: call.toolName,
        args: call.args,
        result: error ? null : String(result?.result ?? ''),
        err: !!error,
        errDetails: error ? { message: error } : null,
        duration: result?.duration ?? 0,
      };
    })
  );

  // Create VibeValue — error VibeValue if AI call failed, normal VibeValue otherwise
  const aiResultValue: VibeValue = error
    ? createVibeError(error, null, { source: 'ai' })
    : createVibeValue(response, {
        source: 'ai',
        toolCalls: toolCallRecords,
        usage: usageRecord,
        textContent,
      });

  // Create prompt entry with embedded tool calls (order: prompt → tools → response)
  // Note: promptEntry.response stores raw value for context display
  const promptEntry: FrameEntry = {
    kind: 'prompt' as const,
    aiType: pendingAI.type,
    prompt: pendingAI.prompt,
    toolCalls: promptToolCalls.length > 0 ? promptToolCalls : undefined,
    response,  // Include response for context history
  };

  const newOrderedEntries = [
    ...frame.orderedEntries,
    promptEntry,
  ];
  const updatedCallStack = [
    ...state.callStack.slice(0, -1),
    { ...frame, orderedEntries: newOrderedEntries },
  ];

  return {
    ...state,
    status: 'running',
    lastResult: aiResultValue,  // Store VibeValue with response and toolCalls
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
        details: { prompt: pendingAI.prompt, toolRounds: toolRounds?.length ?? 0 },
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

  // Normalize undefined to null for Vibe's single null concept
  const normalizedResult = result === undefined ? null : result;

  return {
    ...state,
    status: 'running',
    lastResult: normalizedResult,
    pendingTS: null,
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ts_eval_result',
        details: { params: state.pendingTS.params },
        result: normalizedResult,
      },
    ],
  };
}

// Resume execution after imported TS function call
export function resumeWithImportedTsResult(state: RuntimeState, result: unknown): RuntimeState {
  if (state.status !== 'awaiting_ts' || !state.pendingImportedTsCall) {
    throw new Error('Cannot resume: not awaiting imported TS function result');
  }

  // Normalize undefined to null for Vibe's single null concept
  const normalizedResult = result === undefined ? null : result;

  return {
    ...state,
    status: 'running',
    lastResult: normalizedResult,
    pendingImportedTsCall: null,
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'imported_ts_call_result',
        details: { funcName: state.pendingImportedTsCall.funcName },
        result: normalizedResult,
      },
    ],
  };
}

// Resume execution after compress AI summarization
export function resumeWithCompressResult(state: RuntimeState, summary: string): RuntimeState {
  if (state.status !== 'awaiting_compress' || !state.pendingCompress) {
    throw new Error('Cannot resume: not awaiting compress result');
  }

  const { entryIndex, scopeType, label } = state.pendingCompress;
  const frame = state.callStack[state.callStack.length - 1];

  // Replace loop entries with summary, keeping scope markers
  const newOrderedEntries: FrameEntry[] = [
    ...frame.orderedEntries.slice(0, entryIndex),
    { kind: 'scope-enter', scopeType, label },
    { kind: 'summary', text: summary },
    { kind: 'scope-exit', scopeType, label },
  ];

  return {
    ...state,
    status: 'running',
    pendingCompress: null,
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, orderedEntries: newOrderedEntries },
    ],
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'compress_result',
        details: { scopeType, label, prompt: state.pendingCompress.prompt },
        result: summary,
      },
    ],
  };
}

// Resume execution after tool call
export function resumeWithToolResult(
  state: RuntimeState,
  result: unknown,
  error?: string
): RuntimeState {
  if (state.status !== 'awaiting_tool' || !state.pendingToolCall) {
    throw new Error('Cannot resume: not awaiting tool result');
  }

  const pendingTool = state.pendingToolCall;
  const finalResult = error ? { error } : result;

  return {
    ...state,
    status: 'running',
    lastResult: finalResult,
    pendingToolCall: null,
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'tool_call_result',
        details: {
          toolName: pendingTool.toolName,
          hasError: !!error,
        },
        result: finalResult,
      },
    ],
  };
}

// Resume execution after async operations complete
export function resumeWithAsyncResults(
  state: RuntimeState,
  results: Map<string, VibeValue>
): RuntimeState {
  if (state.status !== 'awaiting_async') {
    throw new Error('Cannot resume: not awaiting async results');
  }

  // Update variables with their async results
  const frame = state.callStack[state.callStack.length - 1];
  const newLocals = { ...frame.locals };

  // Track the last result for operations that need it (e.g., destructuring)
  let lastResult: VibeValue | null = null;

  for (const [opId, result] of results) {
    const operation = state.asyncOperations.get(opId);
    if (operation?.variableName) {
      // Preserve existing variable properties (isConst, isPrivate, vibeType)
      // when updating with the async result
      const existingVar = newLocals[operation.variableName];
      newLocals[operation.variableName] = {
        ...result,
        isConst: existingVar?.isConst ?? result.isConst,
        isPrivate: existingVar?.isPrivate ?? result.isPrivate,
        vibeType: existingVar?.vibeType ?? result.vibeType,
      };
    }
    // Mark operation as no longer pending
    state.pendingAsyncIds.delete(opId);
    // Keep track of the result (for destructuring and other uses)
    lastResult = result;
  }

  const updatedCallStack = [
    ...state.callStack.slice(0, -1),
    { ...frame, locals: newLocals },
  ];

  return {
    ...state,
    status: 'running',
    // Set lastResult so instructions like destructure_assign can use it
    lastResult: lastResult ?? state.lastResult,
    callStack: updatedCallStack,
    awaitingAsyncIds: [],
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'async_results',
        details: { operationCount: results.size },
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
    return { kind: 'vibe-function', name };
  }

  throw new Error(`ReferenceError: '${name}' is not defined`);
}
