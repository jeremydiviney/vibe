export type {
  RuntimeState,
  StackFrame,
  ContextVariable,
  ContextEntry,
  AIOperation,
  AIInteraction,
  ExecutionEntry,
  PendingAI,
  PendingCompress,
  PendingTS,
  PendingToolCall,
  TsModule,
  VibeModule,
  ExportedItem,
  Instruction,
} from './types';

// Re-export module functions
export {
  loadImports,
  getImportedValue,
  isImportedTsFunction,
  isImportedVibeFunction,
  getImportedVibeFunction,
  getImportedTsFunction,
} from './modules';

// Re-export state functions
export {
  createInitialState,
  createFrame,
  resumeWithAIResponse,
  resumeWithUserInput,
  resumeWithTsResult,
  resumeWithImportedTsResult,
  resumeWithToolResult,
  resumeWithCompressResult,
  pauseExecution,
  resumeExecution,
  currentFrame,
  getVariable,
} from './state';

// Re-export TypeScript evaluation functions
export { evalTsBlock, validateReturnType, clearFunctionCache, getFunctionCacheSize, TsBlockError } from './ts-eval';

// Re-export step functions
export {
  step,
  stepN,
  runUntilPause,
  getNextInstruction,
  stepUntilCondition,
  stepUntilStatement,
  stepUntilOp,
} from './step';

// Re-export context functions
export {
  buildLocalContext,
  buildGlobalContext,
  formatContextForAI,
  formatEntriesForSummarization,
  type FormattedContext,
} from './context';

// Re-export serialization
export {
  serializeState,
  deserializeState,
  cloneState,
  deepCloneState,
  getStateSummary,
} from './serialize';

// Re-export AI provider implementations
export { createRealAIProvider, createMockAIProvider } from './ai-provider';

// Re-export AI module
export * from './ai';

// Re-export AI interaction logging utilities
export { formatAIInteractions, dumpAIInteractions, saveAIInteractions } from './ai-logger';

// Re-export verbose logging
export { VerboseLogger, type VerboseLoggerOptions } from './verbose-logger';
export type { LogEvent, AILogMessage, TokenUsage } from './types';

// Imports used by the Runtime class
import * as AST from '../ast';
import { dirname } from 'path';
import { RuntimeError } from '../errors';
import type { RuntimeState, AIInteraction } from './types';
import { resolveValue } from './types';
import { createInitialState, resumeWithAIResponse, resumeWithUserInput, resumeWithTsResult, resumeWithImportedTsResult, resumeWithToolResult, resumeWithCompressResult, resumeWithAsyncResults } from './state';
import type { VibeValue, PendingAsyncStart } from './types';
import { createVibeValue, isVibeValue } from './types';
import { awaitOperations, completeAsyncOperation, failAsyncOperation, createAsyncVibeError, startAsyncOperation } from './async';
import { step, runUntilPause } from './step';
import { evalTsBlock, TsBlockError } from './ts-eval';
import { loadImports, getImportedTsFunction, getImportedVibeFunction } from './modules';
import { createFunctionFrame } from './exec/functions';
import { buildLocalContext, formatContextForAI } from './context';
import { saveAIInteractions } from './ai-logger';
import { deepCloneState } from './serialize';

// Token usage from AI providers
import type { TokenUsage, ModelUsageRecord } from './ai/types';
import type { ToolRoundResult } from './ai/tool-loop';
import type { AILogMessage, ContextEntry, PromptToolCall, LogEvent } from './types';
import { VerboseLogger } from './verbose-logger';

// Sequential request ID counter for usage tracking
let nextRequestId = 1;

/** Create a ModelUsageRecord from provider TokenUsage */
function createUsageRecord(usage: TokenUsage | undefined): ModelUsageRecord {
  const requestId = nextRequestId++;
  return {
    requestId,
    inputTokens: (usage?.inputTokens ?? 0) + (usage?.cacheCreationTokens ?? 0),
    outputTokens: usage?.outputTokens ?? 0,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    thinkingTokens: usage?.thinkingTokens ?? 0,
  };
}

/** Find a model variable in the state and push a usage record onto it */
function pushModelUsage(state: RuntimeState, modelName: string, record: ModelUsageRecord): void {
  for (let i = state.callStack.length - 1; i >= 0; i--) {
    const frame = state.callStack[i];
    const variable = frame.locals[modelName];
    if (variable?.vibeType === 'model' && variable.value) {
      const model = variable.value as { usage: ModelUsageRecord[] };
      model.usage.push(record);
      return;
    }
  }
}

// AI execution result with optional usage and tool rounds
export interface AIExecutionResult {
  value: unknown;
  textContent?: string;  // Plain text output from AI (alongside tool calls)
  usage?: TokenUsage;
  toolRounds?: ToolRoundResult[];  // Tool calling rounds that occurred during execution
  retryAttempts?: Array<{ aiResponse: string; rawResponse?: string; followUpMessage: string; followUpResponse: string; rawFollowUpResponse?: string }>;  // Retries where AI didn't call tools
  rawResponse?: string;  // Raw API response from provider (for verbose debugging)
  // Context for logging (single source of truth)
  messages?: AILogMessage[];  // Complete message sequence sent to model
  executionContext?: ContextEntry[];  // Structured execution context
  interactionToolCalls?: PromptToolCall[];  // Tool calls made during interaction
}

// AI provider interface (for external callers)
export interface AIProvider {
  execute(prompt: string): Promise<AIExecutionResult>;
  generateCode(prompt: string): Promise<AIExecutionResult>;
  askUser(prompt: string): Promise<string>;
}

// Runtime options
export interface RuntimeOptions {
  basePath?: string;           // Base path for resolving imports (defaults to cwd)
  logAiInteractions?: boolean; // Capture detailed AI interaction logs for debugging (DEPRECATED: use verbose)
  rootDir?: string;            // Root directory for file operation sandboxing (defaults to cwd)
  verbose?: boolean;           // Enable verbose logging (JSONL events + context files)
  logDir?: string;             // Directory for verbose logs (default: .vibe-logs)
  printToConsole?: boolean;    // Print verbose logs to console (default: true)
  writeToFile?: boolean;       // Write verbose logs to file (default: true)
  maxParallel?: number;        // Max concurrent async operations (default: 4)
  programArgs?: string[];      // CLI arguments passed after the .vibe filename
}

// Options for the unified execution loop
interface ExecuteLoopOptions {
  logger?: VerboseLogger | null;
  logInteractions?: boolean;
}

// Runtime class - convenience wrapper around functional API
export class Runtime {
  private state: RuntimeState;
  private aiProvider: AIProvider;
  private basePath: string;
  private importsLoaded: boolean = false;
  private logAiInteractions: boolean;
  private verboseLogger: VerboseLogger | null = null;

  constructor(program: AST.Program, aiProvider: AIProvider, options?: RuntimeOptions) {
    this.logAiInteractions = options?.logAiInteractions ?? false;
    this.state = createInitialState(program, {
      logAiInteractions: this.logAiInteractions,
      rootDir: options?.rootDir,
      maxParallel: options?.maxParallel,
      programArgs: options?.programArgs,
    });
    this.aiProvider = aiProvider;
    this.basePath = options?.basePath ?? process.cwd() + '/main.vibe';

    // Initialize verbose logger if enabled
    if (options?.verbose) {
      this.verboseLogger = new VerboseLogger({
        logDir: options.logDir,
        printToConsole: options.printToConsole,
        writeToFile: options.writeToFile,
      });
    }
  }

  getState(): RuntimeState {
    return { ...this.state };
  }

  getValue(name: string): unknown {
    const frame = this.state.callStack[this.state.callStack.length - 1];
    if (!frame) return undefined;

    const variable = frame.locals[name];
    // Resolve VibeValue to its value for easier testing
    return resolveValue(variable?.value);
  }

  // Get raw VibeValue wrapper (for testing error state, toolCalls, etc.)
  getRawValue(name: string): unknown {
    const frame = this.state.callStack[this.state.callStack.length - 1];
    if (!frame) return undefined;

    return frame.locals[name];
  }

  // Get all AI interactions (for debugging)
  getAIInteractions(): AIInteraction[] {
    return [...this.state.aiInteractions];
  }

  // Run the program to completion, handling AI calls and TS evaluation
  async run(): Promise<unknown> {
    this.verboseLogger?.start(this.basePath);

    // Load imports if not already loaded
    if (!this.importsLoaded) {
      this.state = await loadImports(this.state, this.basePath);
      this.importsLoaded = true;
    }

    this.state = await this.executeLoop(this.state, {
      logger: this.verboseLogger,
      logInteractions: this.logAiInteractions,
    });

    if (this.state.status === 'error') {
      this.verboseLogger?.complete('error', this.state.error ?? 'Unknown error');
      this.saveLogsIfEnabled();
      throw this.state.errorObject ?? new Error(this.state.error ?? 'Unknown runtime error');
    }

    this.verboseLogger?.complete('completed');
    this.saveLogsIfEnabled();
    return resolveValue(this.state.lastResult);
  }

  // Save AI interaction logs if logging is enabled
  private saveLogsIfEnabled(): void {
    if (this.logAiInteractions && this.state.aiInteractions.length > 0) {
      const projectRoot = dirname(this.basePath);
      saveAIInteractions(this.state, projectRoot);
    }
  }

  /**
   * Core execution loop - runs state to completion, handling all pause types.
   * Used by both run() (with logging) and runIsolatedState() (without).
   */
  private async executeLoop(state: RuntimeState, options?: ExecuteLoopOptions): Promise<RuntimeState> {
    state = runUntilPause(state);
    state = await this.startAsyncOperations(state);

    while (
      state.status === 'awaiting_ai' ||
      state.status === 'awaiting_user' ||
      state.status === 'awaiting_ts' ||
      state.status === 'awaiting_tool' ||
      state.status === 'awaiting_compress' ||
      state.status === 'awaiting_async'
    ) {
      // Sync this.state so the AI provider's getState() sees current state
      this.state = state;
      state = await this.handlePause(state, options);
      state = runUntilPause(state);
      state = await this.startAsyncOperations(state);
    }

    // Await remaining pending async operations at boundary
    if (state.pendingAsyncIds.size > 0) {
      const pendingIds = Array.from(state.pendingAsyncIds);
      const results = await awaitOperations(pendingIds, state.asyncOperations);
      state = resumeWithAsyncResults(
        { ...state, status: 'awaiting_async', awaitingAsyncIds: pendingIds },
        results
      );
      state = runUntilPause(state);
    }

    return state;
  }

  /** Dispatch a single pause state to its handler. */
  private async handlePause(state: RuntimeState, options?: ExecuteLoopOptions): Promise<RuntimeState> {
    const logger = options?.logger;

    switch (state.status) {
      case 'awaiting_async':
        return this.handleAwaitingAsync(state);
      case 'awaiting_ts':
        return this.handleAwaitingTs(state, logger);
      case 'awaiting_ai':
        return this.handleAwaitingAi(state, options);
      case 'awaiting_tool':
        return this.handleAwaitingTool(state, logger);
      case 'awaiting_compress':
        return this.handleAwaitingCompress(state);
      case 'awaiting_user':
        return this.handleAwaitingUser(state);
      default:
        return state;
    }
  }

  private async handleAwaitingAsync(state: RuntimeState): Promise<RuntimeState> {
    // Start scheduled async ops BEFORE awaiting them
    state = await this.startAsyncOperations(state);
    const results = await awaitOperations(state.awaitingAsyncIds, state.asyncOperations);
    state = resumeWithAsyncResults(state, results);
    state = runUntilPause(state);
    state = await this.startAsyncOperations(state);
    return state;
  }

  private async handleAwaitingTs(state: RuntimeState, logger?: VerboseLogger | null): Promise<RuntimeState> {
    if (state.pendingTS) {
      const { params, body, paramValues, location } = state.pendingTS;
      const tsId = logger?.tsBlockStart(params, paramValues, body, { file: location.file ?? this.basePath, line: location.line });
      const startTime = Date.now();
      try {
        const result = await evalTsBlock(params, body, paramValues, location);
        if (tsId) logger?.tsBlockComplete(tsId, Date.now() - startTime);
        return resumeWithTsResult(state, result);
      } catch (error) {
        if (tsId) logger?.tsBlockComplete(tsId, Date.now() - startTime, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }

    if (state.pendingImportedTsCall) {
      const { funcName, args, location } = state.pendingImportedTsCall;
      const fn = getImportedTsFunction(state, funcName);
      if (!fn) {
        throw new Error(`Import error: Function '${funcName}' not found`);
      }
      const tsfId = logger?.tsFunctionStart(funcName, args, { file: location.file ?? this.basePath, line: location.line });
      const startTime = Date.now();
      try {
        const result = await fn(...args);
        if (tsfId) logger?.tsFunctionComplete(tsfId, Date.now() - startTime);
        return resumeWithImportedTsResult(state, result);
      } catch (error) {
        if (tsfId) logger?.tsFunctionComplete(tsfId, Date.now() - startTime, error instanceof Error ? error.message : String(error));
        const originalError = error instanceof Error ? error : new Error(String(error));
        throw new TsBlockError(
          `Error in imported function '${funcName}': ${originalError.message}`,
          [],
          `/* imported function: ${funcName} */`,
          originalError,
          location
        );
      }
    }

    throw new Error('State awaiting TS but no pending TS request');
  }

  private async handleAwaitingAi(state: RuntimeState, options?: ExecuteLoopOptions): Promise<RuntimeState> {
    if (!state.pendingAI) {
      throw new Error('State awaiting AI but no pending AI request');
    }

    const logger = options?.logger;
    const startTime = Date.now();
    const pendingAI = state.pendingAI;

    // Get target type from next instruction
    let targetType: string | null = null;
    const nextInstruction = state.instructionStack[0];
    if (nextInstruction?.op === 'declare_var' && nextInstruction.type) {
      targetType = nextInstruction.type;
    }

    // Get model details from state for logging
    let modelDetails: AIInteraction['modelDetails'];
    const modelVar = state.callStack[0]?.locals?.[pendingAI.model];
    if (modelVar?.value && typeof modelVar.value === 'object') {
      const mv = modelVar.value as Record<string, unknown>;
      modelDetails = {
        name: String(mv.name ?? ''),
        provider: String(mv.provider ?? ''),
        url: mv.url ? String(mv.url) : undefined,
        thinkingLevel: mv.thinkingLevel ? String(mv.thinkingLevel) : undefined,
      };
    }

    // Log AI start
    const contextMode = state.callStack.length > 1 ? 'local' as const : 'default' as const;
    const aiId = logger?.aiStart(pendingAI.type, pendingAI.model, pendingAI.prompt, {
      model: pendingAI.model,
      modelDetails,
      type: pendingAI.type,
      targetType,
      contextMode,
      messages: [],
    });

    let result: AIExecutionResult;
    try {
      result = await this.aiProvider.execute(pendingAI.prompt);
    } catch (error) {
      if (aiId) {
        const aiError = error instanceof Error ? error.message : String(error);
        const aiLogContext = (error instanceof RuntimeError && error.context?.__aiLogContext)
          ? error.context.__aiLogContext as { messages?: unknown[]; response?: string; rawResponse?: string; toolRounds?: unknown[]; retryAttempts?: unknown[] }
          : undefined;
        logger?.aiComplete(aiId, Date.now() - startTime, undefined, 0, aiError, aiLogContext ? {
          messages: aiLogContext.messages as AILogMessage[],
          response: aiLogContext.response,
          rawResponse: aiLogContext.rawResponse,
          toolRounds: aiLogContext.toolRounds as any,
          retryAttempts: aiLogContext.retryAttempts as any,
        } : undefined);
      }
      // Capture AI error into Vibe .err system instead of crashing
      const aiError = error instanceof Error ? error : new Error(String(error));
      return resumeWithAIResponse(state, null, undefined, undefined, undefined, undefined, aiError);
    }

    // Log AI complete
    if (aiId) {
      const toolCallCount = result.toolRounds?.reduce((sum, r) => sum + r.toolCalls.length, 0) ?? 0;
      logger?.aiComplete(aiId, Date.now() - startTime, result.usage, toolCallCount, undefined, {
        messages: result.messages,
        response: typeof result.value === 'string' ? result.value : JSON.stringify(result.value),
        toolRounds: result.toolRounds,
        retryAttempts: result.retryAttempts,
        rawResponse: result.rawResponse,
      });
    }

    // Create interaction record if logging enabled
    let interaction: AIInteraction | undefined;
    if (options?.logInteractions) {
      interaction = {
        type: pendingAI.type,
        prompt: pendingAI.prompt,
        response: result.value,
        timestamp: startTime,
        model: pendingAI.model,
        modelDetails,
        targetType,
        usage: result.usage,
        durationMs: Date.now() - startTime,
        messages: result.messages ?? [],
        executionContext: result.executionContext ?? [],
        interactionToolCalls: result.interactionToolCalls,
      };
    }

    // Track token usage on model variable
    const usageRecord = createUsageRecord(result.usage);
    pushModelUsage(state, pendingAI.model, usageRecord);

    return resumeWithAIResponse(state, result.value, interaction, result.toolRounds, usageRecord, result.textContent);
  }

  private async handleAwaitingTool(state: RuntimeState, logger?: VerboseLogger | null): Promise<RuntimeState> {
    if (!state.pendingToolCall) {
      throw new Error('State awaiting tool but no pending tool call');
    }

    const { toolName, args, executor } = state.pendingToolCall;
    logger?.toolStart('', toolName ?? 'unknown', args as Record<string, unknown>);
    const startTime = Date.now();

    try {
      const context = { rootDir: state.rootDir };
      const result = await executor(args, context);
      logger?.toolComplete('', toolName ?? 'unknown', Date.now() - startTime, true);
      return resumeWithToolResult(state, result);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger?.toolComplete('', toolName ?? 'unknown', Date.now() - startTime, false, errMsg);
      throw error;
    }
  }

  private async handleAwaitingCompress(state: RuntimeState): Promise<RuntimeState> {
    if (!state.pendingCompress) {
      throw new Error('State awaiting compress but no pending compress request');
    }

    const { prompt, scopeType } = state.pendingCompress;
    const localContext = buildLocalContext(state);
    const contextFormatted = formatContextForAI(localContext, { includeInstructions: false });
    const defaultPrompt = `Provide a concise summary of the most recent ${scopeType} loop execution. Focus on key results, state changes, and outcomes.`;
    const summaryPrompt = `${prompt ?? defaultPrompt}\n\n${contextFormatted.text}`;
    const result = await this.aiProvider.execute(summaryPrompt);
    const summary = typeof result.value === 'string' ? result.value : String(result.value);
    return resumeWithCompressResult(state, summary);
  }

  private async handleAwaitingUser(state: RuntimeState): Promise<RuntimeState> {
    if (!state.pendingAI) {
      throw new Error('State awaiting user but no pending AI request');
    }
    const response = await this.aiProvider.askUser(state.pendingAI.prompt);
    return resumeWithUserInput(state, response);
  }

  /** Start pending async operations as background Promises. */
  private async startAsyncOperations(state: RuntimeState): Promise<RuntimeState> {
    const pending = state.pendingAsyncStarts;
    if (pending.length === 0) return state;

    state = { ...state, pendingAsyncStarts: [] };

    for (const start of pending) {
      const operation = state.asyncOperations.get(start.operationId);
      if (!operation) continue;

      let promise: Promise<VibeValue>;
      switch (start.type) {
        case 'do':
        case 'vibe':
          promise = this.executeAsyncAI(state, start);
          break;
        case 'ts':
          promise = this.executeAsyncTs(state, start);
          break;
        case 'ts-function':
          promise = this.executeAsyncTsFunc(state, start);
          break;
        case 'vibe-function':
          promise = this.executeAsyncVibeFunc(state, start);
          break;
      }
      startAsyncOperation(operation, promise);
    }

    return state;
  }

  private async executeAsyncAI(state: RuntimeState, start: PendingAsyncStart & { type: 'do' | 'vibe' }): Promise<VibeValue> {
    try {
      const result = await this.aiProvider.execute(start.prompt);
      const vibeValue = createVibeValue(result.value, {
        source: 'ai',
        toolCalls: result.toolRounds?.flatMap((round) =>
          round.toolCalls.map((call, i) => {
            const error = round.results[i]?.error;
            return {
              toolName: call.toolName,
              args: call.args,
              result: error ? null : String(round.results[i]?.result ?? ''),
              err: !!error,
              errDetails: error ? { message: error } : null,
              duration: round.results[i]?.duration ?? 0,
            };
          })
        ) ?? [],
      });
      completeAsyncOperation(state, start.operationId, vibeValue);
      return vibeValue;
    } catch (error) {
      const vibeError = createAsyncVibeError(error);
      failAsyncOperation(state, start.operationId, vibeError);
      return createVibeValue(null, { source: 'ai', err: true, errDetails: vibeError });
    }
  }

  private async executeAsyncTs(state: RuntimeState, start: PendingAsyncStart & { type: 'ts' }): Promise<VibeValue> {
    try {
      const result = await evalTsBlock(start.params, start.body, start.paramValues, start.location);
      const vibeValue = createVibeValue(result, { source: 'ts' });
      completeAsyncOperation(state, start.operationId, vibeValue);
      return vibeValue;
    } catch (error) {
      const vibeError = createAsyncVibeError(error, start.location);
      failAsyncOperation(state, start.operationId, vibeError);
      return createVibeValue(null, { source: 'ts', err: true, errDetails: vibeError });
    }
  }

  private async executeAsyncTsFunc(state: RuntimeState, start: PendingAsyncStart & { type: 'ts-function' }): Promise<VibeValue> {
    try {
      const fn = getImportedTsFunction(state, start.funcName);
      if (!fn) {
        throw new Error(`Import error: Function '${start.funcName}' not found`);
      }
      const result = await fn(...start.args);
      const vibeValue = createVibeValue(result, { source: 'ts' });
      completeAsyncOperation(state, start.operationId, vibeValue);
      return vibeValue;
    } catch (error) {
      const vibeError = createAsyncVibeError(error, start.location);
      failAsyncOperation(state, start.operationId, vibeError);
      return createVibeValue(null, { source: 'ts', err: true, errDetails: vibeError });
    }
  }

  private async executeAsyncVibeFunc(state: RuntimeState, start: PendingAsyncStart & { type: 'vibe-function' }): Promise<VibeValue> {
    try {
      const result = await this.runVibeFuncIsolated(state, start.funcName, start.args, start.modulePath);
      if (isVibeValue(result) && result.err) {
        completeAsyncOperation(state, start.operationId, result);
        return result;
      }
      const vibeValue = createVibeValue(result, { source: 'vibe-function' });
      completeAsyncOperation(state, start.operationId, vibeValue);
      return vibeValue;
    } catch (error) {
      const vibeError = createAsyncVibeError(error);
      failAsyncOperation(state, start.operationId, vibeError);
      return createVibeValue(null, { source: 'vibe-function', err: true, errDetails: vibeError });
    }
  }

  /**
   * Run a Vibe function in isolated state.
   * The function runs to completion in isolation - only the return value persists.
   */
  private async runVibeFuncIsolated(
    sourceState: RuntimeState,
    funcName: string,
    args: unknown[],
    modulePath?: string
  ): Promise<unknown> {
    let func: AST.FunctionDeclaration | undefined;
    if (modulePath) {
      func = getImportedVibeFunction(sourceState, funcName);
    } else {
      func = sourceState.functions[funcName];
    }

    if (!func) {
      throw new Error(`ReferenceError: '${funcName}' is not defined`);
    }

    let isolatedState = deepCloneState(sourceState);
    isolatedState.asyncOperations = new Map();
    isolatedState.pendingAsyncIds = new Set();
    isolatedState.asyncVarToOpId = new Map();
    isolatedState.pendingAsyncStarts = [];
    isolatedState.awaitingAsyncIds = [];

    const newFrame = createFunctionFrame(funcName, func.params, args, modulePath);
    const bodyInstructions = func.body.body.map((s) => ({
      op: 'exec_statement' as const,
      stmt: s,
      location: s.location,
    }));

    isolatedState = {
      ...isolatedState,
      status: 'running',
      callStack: [...isolatedState.callStack, newFrame],
      instructionStack: [
        ...bodyInstructions,
        { op: 'pop_frame' as const, location: func.body.location },
      ],
      lastResult: null,
      isInAsyncIsolation: true,
    };

    return this.runIsolatedState(isolatedState);
  }

  /** Run an isolated state to completion without logging. */
  private async runIsolatedState(state: RuntimeState): Promise<unknown> {
    state = await this.executeLoop(state);

    if (state.status === 'error') {
      throw state.errorObject ?? new Error(state.error ?? 'Unknown runtime error');
    }

    if (isVibeValue(state.lastResult) && state.lastResult.err) {
      return state.lastResult;
    }
    return resolveValue(state.lastResult);
  }

  // Step through one instruction at a time
  step(): RuntimeState {
    this.state = step(this.state);
    return this.state;
  }

  // Run until pause point (AI call, user input, or completion)
  runUntilPause(): RuntimeState {
    this.state = runUntilPause(this.state);
    return this.state;
  }

  // Resume after providing AI response
  resumeWithAIResponse(response: string): RuntimeState {
    this.state = resumeWithAIResponse(this.state, response);
    return this.state;
  }

  // Resume after providing user input
  resumeWithUserInput(input: string): RuntimeState {
    this.state = resumeWithUserInput(this.state, input);
    return this.state;
  }

  // Get all logged events (for programmatic access / testing)
  getLogEvents(): LogEvent[] {
    return this.verboseLogger?.getEvents() ?? [];
  }

  // Get the main log file path (for debugging)
  getMainLogPath(): string | null {
    return this.verboseLogger?.getMainLogPath() ?? null;
  }

  // Get the context directory path (for debugging)
  getContextDir(): string | null {
    return this.verboseLogger?.getContextDir() ?? null;
  }
}

// Re-export tool system
export * from './tools';
