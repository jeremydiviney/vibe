// Re-export types (RuntimeStatus exported as enum below for backward compatibility)
export type {
  RuntimeState,
  StackFrame,
  Variable,
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

// Legacy imports for backward compatibility
import * as AST from '../ast';
import { dirname } from 'path';
import type { SourceLocation } from '../errors';
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
import { buildLocalContext, buildGlobalContext, formatContextForAI, formatEntriesForSummarization } from './context';
import { saveAIInteractions } from './ai-logger';
import { deepCloneState } from './serialize';

// Token usage from AI providers
import type { TokenUsage } from './ai/types';
import type { ToolRoundResult } from './ai/tool-loop';
import type { AILogMessage, ContextEntry, PromptToolCall, LogEvent } from './types';
import { VerboseLogger } from './verbose-logger';

// AI execution result with optional usage and tool rounds
export interface AIExecutionResult {
  value: unknown;
  usage?: TokenUsage;
  toolRounds?: ToolRoundResult[];  // Tool calling rounds that occurred during execution
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
}

// Legacy Runtime class - convenience wrapper around functional API
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

  // Get raw value including VibeValue wrapper if present
  getRawValue(name: string): unknown {
    const frame = this.state.callStack[this.state.callStack.length - 1];
    if (!frame) return undefined;

    const variable = frame.locals[name];
    return variable?.value;
  }

  // Get all AI interactions (for debugging)
  getAIInteractions(): AIInteraction[] {
    return [...this.state.aiInteractions];
  }

  // Run the program to completion, handling AI calls and TS evaluation
  async run(): Promise<unknown> {
    // Log run start
    this.verboseLogger?.start(this.basePath);

    // Load imports if not already loaded
    if (!this.importsLoaded) {
      this.state = await loadImports(this.state, this.basePath);
      this.importsLoaded = true;
    }

    // Run until pause or complete
    this.state = runUntilPause(this.state);

    // Start any scheduled async operations (non-blocking)
    await this.startScheduledAsyncOps();

    // Handle AI calls, TS evaluation, tool calls, compress, and async in a loop
    while (
      this.state.status === 'awaiting_ai' ||
      this.state.status === 'awaiting_user' ||
      this.state.status === 'awaiting_ts' ||
      this.state.status === 'awaiting_tool' ||
      this.state.status === 'awaiting_compress' ||
      this.state.status === 'awaiting_async'
    ) {
      // Handle awaiting_async - wait for pending async operations
      if (this.state.status === 'awaiting_async') {
        // IMPORTANT: Start scheduled async ops BEFORE awaiting them
        // Operations are scheduled (in pendingAsyncStarts) but their promises
        // are only created when started
        await this.startScheduledAsyncOps();

        const results = await awaitOperations(
          this.state.awaitingAsyncIds,
          this.state.asyncOperations
        );
        this.state = resumeWithAsyncResults(this.state, results);
        this.state = runUntilPause(this.state);
        await this.startScheduledAsyncOps();
        continue;
      }
      if (this.state.status === 'awaiting_ts') {
        if (this.state.pendingTS) {
          // Handle inline ts block evaluation
          const { params, body, paramValues, location } = this.state.pendingTS;

          // Log TS block start
          const tsId = this.verboseLogger?.tsBlockStart(
            params,
            paramValues,
            body,
            { file: location.file ?? this.basePath, line: location.line }
          );
          const tsStartTime = Date.now();

          try {
            const result = await evalTsBlock(params, body, paramValues, location);
            this.state = resumeWithTsResult(this.state, result);

            // Log TS block complete
            if (tsId) {
              this.verboseLogger?.tsBlockComplete(tsId, Date.now() - tsStartTime);
            }
          } catch (error) {
            // Log TS block error
            if (tsId) {
              const errMsg = error instanceof Error ? error.message : String(error);
              this.verboseLogger?.tsBlockComplete(tsId, Date.now() - tsStartTime, errMsg);
            }
            throw error;
          }
        } else if (this.state.pendingImportedTsCall) {
          // Handle imported TS function call
          const { funcName, args, location } = this.state.pendingImportedTsCall;
          const fn = getImportedTsFunction(this.state, funcName);
          if (!fn) {
            throw new Error(`Import error: Function '${funcName}' not found`);
          }

          // Log TS function start
          const tsfId = this.verboseLogger?.tsFunctionStart(
            funcName,
            args,
            { file: location.file ?? this.basePath, line: location.line }
          );
          const tsfStartTime = Date.now();

          try {
            const result = await fn(...args);
            this.state = resumeWithImportedTsResult(this.state, result);

            // Log TS function complete
            if (tsfId) {
              this.verboseLogger?.tsFunctionComplete(tsfId, Date.now() - tsfStartTime);
            }
          } catch (error) {
            // Log TS function error
            if (tsfId) {
              const errMsg = error instanceof Error ? error.message : String(error);
              this.verboseLogger?.tsFunctionComplete(tsfId, Date.now() - tsfStartTime, errMsg);
            }
            // Wrap imported TS function error with Vibe location info
            const originalError = error instanceof Error ? error : new Error(String(error));
            throw new TsBlockError(
              `Error in imported function '${funcName}': ${originalError.message}`,
              [], // no params for imported functions
              `/* imported function: ${funcName} */`,
              originalError,
              location
            );
          }
        } else {
          throw new Error('State awaiting TS but no pending TS request');
        }
      } else if (this.state.status === 'awaiting_ai') {
        // Handle AI calls
        if (!this.state.pendingAI) {
          throw new Error('State awaiting AI but no pending AI request');
        }

        const startTime = Date.now();
        const pendingAI = this.state.pendingAI;

        // Get target type from next instruction
        let targetType: string | null = null;
        const nextInstruction = this.state.instructionStack[0];
        if (nextInstruction?.op === 'declare_var' && nextInstruction.type) {
          targetType = nextInstruction.type;
        }

        // Get model details from state for logging
        let modelDetails: AIInteraction['modelDetails'];
        const modelVar = this.state.callStack[0]?.locals?.[pendingAI.model];
        if (modelVar?.value && typeof modelVar.value === 'object') {
          const mv = modelVar.value as Record<string, unknown>;
          modelDetails = {
            name: String(mv.name ?? ''),
            provider: String(mv.provider ?? ''),
            url: mv.url ? String(mv.url) : undefined,
            thinkingLevel: mv.thinkingLevel ? String(mv.thinkingLevel) : undefined,
          };
        }

        // Log AI start (verbose logger)
        const aiId = this.verboseLogger?.aiStart(
          pendingAI.type,
          pendingAI.model,
          pendingAI.prompt,
          {
            model: pendingAI.model,
            modelDetails,
            type: pendingAI.type,
            targetType,
            messages: [], // Will be updated after execution
          }
        );

        // vibe is the only AI expression type now
        let result: AIExecutionResult;
        let aiError: string | undefined;
        try {
          result = await this.aiProvider.execute(pendingAI.prompt);
        } catch (error) {
          aiError = error instanceof Error ? error.message : String(error);
          // Log AI error
          if (aiId) {
            this.verboseLogger?.aiComplete(aiId, Date.now() - startTime, undefined, 0, aiError);
          }
          throw error;
        }

        // Log AI complete (verbose logger)
        if (aiId) {
          const toolCallCount = result.toolRounds?.reduce((sum, r) => sum + r.toolCalls.length, 0) ?? 0;
          this.verboseLogger?.aiComplete(aiId, Date.now() - startTime, result.usage, toolCallCount);
        }

        // Create interaction record if logging (legacy)
        // Uses context from result (single source of truth from ai-provider)
        let interaction: AIInteraction | undefined;
        if (this.logAiInteractions) {
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
            // Context from ai-provider (single source of truth)
            messages: result.messages ?? [],
            executionContext: result.executionContext ?? [],
            interactionToolCalls: result.interactionToolCalls,
          };
        }

        this.state = resumeWithAIResponse(this.state, result.value, interaction, result.toolRounds);
      } else if (this.state.status === 'awaiting_tool') {
        // Handle tool calls
        if (!this.state.pendingToolCall) {
          throw new Error('State awaiting tool but no pending tool call');
        }

        const { toolName, args, executor } = this.state.pendingToolCall;

        // Log tool start (we don't have a parent AI ID here, use empty string)
        this.verboseLogger?.toolStart('', toolName ?? 'unknown', args as Record<string, unknown>);
        const toolStartTime = Date.now();

        try {
          // Execute the tool with context - let errors propagate
          const context = { rootDir: this.state.rootDir };
          const result = await executor(args, context);
          this.state = resumeWithToolResult(this.state, result);

          // Log tool complete
          this.verboseLogger?.toolComplete('', toolName ?? 'unknown', Date.now() - toolStartTime, true);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.verboseLogger?.toolComplete('', toolName ?? 'unknown', Date.now() - toolStartTime, false, errMsg);
          throw error;
        }
      } else if (this.state.status === 'awaiting_compress') {
        // Handle compress AI summarization
        if (!this.state.pendingCompress) {
          throw new Error('State awaiting compress but no pending compress request');
        }

        const { prompt, scopeType } = this.state.pendingCompress;

        // Build local context at end of loop (before we discard entries)
        const localContext = buildLocalContext(this.state);
        const contextFormatted = formatContextForAI(localContext, { includeInstructions: false });

        // Build summarization prompt
        const defaultPrompt = `Provide a concise summary of the most recent ${scopeType} loop execution. Focus on key results, state changes, and outcomes.`;
        const summaryPrompt = `${prompt ?? defaultPrompt}\n\n${contextFormatted.text}`;

        // Execute AI call for summarization (uses pendingCompress.model)
        const result = await this.aiProvider.execute(summaryPrompt);
        const summary = typeof result.value === 'string' ? result.value : String(result.value);

        this.state = resumeWithCompressResult(this.state, summary);
      } else {
        // Handle user input
        if (!this.state.pendingAI) {
          throw new Error('State awaiting user but no pending AI request');
        }
        const response = await this.aiProvider.askUser(this.state.pendingAI.prompt);
        this.state = resumeWithUserInput(this.state, response);
      }

      // Continue running
      this.state = runUntilPause(this.state);

      // Start any newly scheduled async operations
      await this.startScheduledAsyncOps();
    }

    if (this.state.status === 'error') {
      // Log run error
      this.verboseLogger?.complete('error', this.state.error ?? 'Unknown error');

      // Save logs even on error if logging enabled
      this.saveLogsIfEnabled();
      // Throw the original error object to preserve location info
      throw this.state.errorObject ?? new Error(this.state.error ?? 'Unknown runtime error');
    }

    // At program completion, await any remaining pending async operations
    // This implements "await at block boundary" for the main program
    if (this.state.pendingAsyncIds.size > 0) {
      const pendingIds = Array.from(this.state.pendingAsyncIds);
      const results = await awaitOperations(pendingIds, this.state.asyncOperations);
      this.state = resumeWithAsyncResults(
        { ...this.state, status: 'awaiting_async', awaitingAsyncIds: pendingIds },
        results
      );
      // resumeWithAsyncResults sets status to 'running', so run until completion again
      this.state = runUntilPause(this.state);
    }

    // Log run complete
    this.verboseLogger?.complete('completed');

    // Save logs on successful completion
    this.saveLogsIfEnabled();

    // Resolve VibeValue to its value for the final return
    return resolveValue(this.state.lastResult);
  }

  // Save AI interaction logs if logging is enabled
  private saveLogsIfEnabled(): void {
    if (this.logAiInteractions && this.state.aiInteractions.length > 0) {
      const projectRoot = dirname(this.basePath);
      saveAIInteractions(this.state, projectRoot);
    }
  }

  // Start scheduled async operations as background Promises
  private async startScheduledAsyncOps(): Promise<void> {
    const pending = this.state.pendingAsyncStarts;
    if (pending.length === 0) return;

    // Clear pending starts
    this.state = { ...this.state, pendingAsyncStarts: [] };

    // Start each operation as a Promise (non-blocking)
    for (const start of pending) {
      const operation = this.state.asyncOperations.get(start.operationId);
      if (!operation) continue;

      if (start.aiDetails) {
        // Start AI operation
        const { prompt } = start.aiDetails;

        // Create the Promise for this AI call
        const promise = this.executeAIAsync(start.operationId, prompt);

        // Store the promise in the operation (so awaiting_async can wait on it)
        startAsyncOperation(operation, promise);
      } else if (start.tsDetails) {
        // Start TS block operation
        const { params, body, paramValues, location } = start.tsDetails;

        // Create the Promise for this TS eval
        const promise = this.executeTsAsync(start.operationId, params, body, paramValues, location);

        startAsyncOperation(operation, promise);
      } else if (start.tsFuncDetails) {
        // Start imported TS function operation
        const { funcName, args, location } = start.tsFuncDetails;

        // Create the Promise for this TS function call
        const promise = this.executeTsFuncAsync(start.operationId, funcName, args, location);

        startAsyncOperation(operation, promise);
      } else if (start.vibeFuncDetails) {
        // Start Vibe function operation
        const { funcName, args, modulePath } = start.vibeFuncDetails;

        // Create the Promise for this Vibe function call
        const promise = this.executeVibeFuncAsync(start.operationId, funcName, args, modulePath);

        startAsyncOperation(operation, promise);
      }
    }
  }

  // Execute an AI call asynchronously (returns Promise that resolves to VibeValue)
  private async executeAIAsync(
    operationId: string,
    prompt: string
  ): Promise<VibeValue> {
    try {
      const result = await this.aiProvider.execute(prompt);

      // Create VibeValue with the result
      const vibeValue = createVibeValue(result.value, {
        source: 'ai',
        toolCalls: result.toolRounds?.flatMap((round) =>
          round.toolCalls.map((call, i) => ({
            toolName: call.toolName,
            args: call.args,
            result: round.results[i]?.error ? null : String(round.results[i]?.result ?? ''),
            error: round.results[i]?.error ?? null,
            duration: round.results[i]?.duration ?? 0,
          }))
        ) ?? [],
      });

      // Mark operation as complete
      completeAsyncOperation(this.state, operationId, vibeValue);

      return vibeValue;
    } catch (error) {
      const vibeError = createAsyncVibeError(error);
      failAsyncOperation(this.state, operationId, vibeError);
      return createVibeValue(null, { source: 'ai', err: true, errDetails: vibeError });
    }
  }

  // Execute a TS block asynchronously (returns Promise that resolves to VibeValue)
  private async executeTsAsync(
    operationId: string,
    params: string[],
    body: string,
    paramValues: unknown[],
    location: SourceLocation
  ): Promise<VibeValue> {
    try {
      const result = await evalTsBlock(params, body, paramValues, location);

      // Create VibeValue with the result
      const vibeValue = createVibeValue(result, { source: 'ts' });

      // Mark operation as complete
      completeAsyncOperation(this.state, operationId, vibeValue);

      return vibeValue;
    } catch (error) {
      const vibeError = createAsyncVibeError(error, location);
      failAsyncOperation(this.state, operationId, vibeError);
      return createVibeValue(null, { source: 'ts', err: true, errDetails: vibeError });
    }
  }

  // Execute an imported TS function asynchronously (returns Promise that resolves to VibeValue)
  private async executeTsFuncAsync(
    operationId: string,
    funcName: string,
    args: unknown[],
    location: SourceLocation
  ): Promise<VibeValue> {
    try {
      const fn = getImportedTsFunction(this.state, funcName);
      if (!fn) {
        throw new Error(`Import error: Function '${funcName}' not found`);
      }

      const result = await fn(...args);

      // Create VibeValue with the result
      const vibeValue = createVibeValue(result, { source: 'ts' });

      // Mark operation as complete
      completeAsyncOperation(this.state, operationId, vibeValue);

      return vibeValue;
    } catch (error) {
      const vibeError = createAsyncVibeError(error, location);
      failAsyncOperation(this.state, operationId, vibeError);
      return createVibeValue(null, { source: 'ts', err: true, errDetails: vibeError });
    }
  }

  /**
   * Core helper to run a Vibe function in isolated state.
   * Used by both top-level async calls and nested calls within isolated execution.
   * The function runs to completion in isolation - only the return value persists.
   */
  private async runVibeFuncIsolated(
    sourceState: RuntimeState,
    funcName: string,
    args: unknown[],
    modulePath?: string
  ): Promise<unknown> {
    // Get the function declaration
    let func: AST.FunctionDeclaration | undefined;
    if (modulePath) {
      func = getImportedVibeFunction(sourceState, funcName);
    } else {
      func = sourceState.functions[funcName];
    }

    if (!func) {
      throw new Error(`ReferenceError: '${funcName}' is not defined`);
    }

    // Deep clone the state for isolated execution
    let isolatedState = deepCloneState(sourceState);

    // Reset async-related state for the isolated execution
    isolatedState.asyncOperations = new Map();
    isolatedState.pendingAsyncIds = new Set();
    isolatedState.asyncVarToOpId = new Map();
    isolatedState.pendingAsyncStarts = [];
    isolatedState.awaitingAsyncIds = [];

    // Create the function frame
    const newFrame = createFunctionFrame(funcName, func.params, args, modulePath);

    // Set up the function call
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

    // Run the isolated state to completion
    return this.runIsolatedState(isolatedState);
  }

  /**
   * Execute a Vibe function asynchronously from main state.
   */
  private async executeVibeFuncAsync(
    operationId: string,
    funcName: string,
    args: unknown[],
    modulePath?: string
  ): Promise<VibeValue> {
    try {
      const result = await this.runVibeFuncIsolated(this.state, funcName, args, modulePath);

      // If result is already a VibeValue with error (from function returning error value), preserve it
      if (isVibeValue(result) && result.err) {
        completeAsyncOperation(this.state, operationId, result);
        return result;
      }

      // Otherwise wrap in a new VibeValue
      const vibeValue = createVibeValue(result, { source: 'vibe-function' });
      completeAsyncOperation(this.state, operationId, vibeValue);
      return vibeValue;
    } catch (error) {
      const vibeError = createAsyncVibeError(error);
      failAsyncOperation(this.state, operationId, vibeError);
      return createVibeValue(null, { source: 'vibe-function', err: true, errDetails: vibeError });
    }
  }

  /**
   * Run an isolated state to completion, handling AI calls, TS blocks, etc.
   * Returns the final lastResult value.
   */
  private async runIsolatedState(state: RuntimeState): Promise<unknown> {
    // Run until pause or complete
    state = runUntilPause(state);

    // Start any scheduled async operations in the isolated state
    state = await this.startIsolatedAsyncOps(state);

    // Handle AI calls, TS evaluation, async awaits, etc. in a loop
    while (
      state.status === 'awaiting_ai' ||
      state.status === 'awaiting_ts' ||
      state.status === 'awaiting_tool' ||
      state.status === 'awaiting_async'
    ) {
      if (state.status === 'awaiting_async') {
        // Wait for pending async operations in isolated state
        const results = await awaitOperations(
          state.awaitingAsyncIds,
          state.asyncOperations
        );
        state = resumeWithAsyncResults(state, results);
        state = runUntilPause(state);
        state = await this.startIsolatedAsyncOps(state);
        continue;
      }

      if (state.status === 'awaiting_ts') {
        if (state.pendingTS) {
          const { params, body, paramValues, location } = state.pendingTS;
          const result = await evalTsBlock(params, body, paramValues, location);
          state = resumeWithTsResult(state, result);
        } else if (state.pendingImportedTsCall) {
          const { funcName, args } = state.pendingImportedTsCall;
          const fn = getImportedTsFunction(state, funcName);
          if (!fn) {
            throw new Error(`Import error: Function '${funcName}' not found`);
          }
          const result = await fn(...args);
          state = resumeWithImportedTsResult(state, result);
        }
      } else if (state.status === 'awaiting_ai') {
        if (!state.pendingAI) {
          throw new Error('State awaiting AI but no pending AI request');
        }
        const result = await this.aiProvider.execute(state.pendingAI.prompt);
        state = resumeWithAIResponse(state, result.value);
      } else if (state.status === 'awaiting_tool') {
        if (!state.pendingToolCall) {
          throw new Error('State awaiting tool but no pending tool call');
        }
        const { args, executor } = state.pendingToolCall;
        const context = { rootDir: state.rootDir };
        const result = await executor(args, context);
        state = resumeWithToolResult(state, result);
      }

      // Continue running
      state = runUntilPause(state);

      // Start any newly scheduled async operations
      state = await this.startIsolatedAsyncOps(state);
    }

    if (state.status === 'error') {
      throw state.errorObject ?? new Error(state.error ?? 'Unknown runtime error');
    }

    // Await any remaining pending async operations at function exit
    if (state.pendingAsyncIds.size > 0) {
      const pendingIds = Array.from(state.pendingAsyncIds);
      const results = await awaitOperations(pendingIds, state.asyncOperations);
      state = resumeWithAsyncResults(
        { ...state, status: 'awaiting_async', awaitingAsyncIds: pendingIds },
        results
      );
      state = runUntilPause(state);
    }

    // If lastResult is a VibeValue with error, return it as-is to preserve error info
    if (isVibeValue(state.lastResult) && state.lastResult.err) {
      return state.lastResult;
    }
    return resolveValue(state.lastResult);
  }

  /**
   * Start scheduled async operations in an isolated state.
   * Similar to startScheduledAsyncOps but operates on passed state.
   */
  private async startIsolatedAsyncOps(state: RuntimeState): Promise<RuntimeState> {
    const pending = state.pendingAsyncStarts;
    if (pending.length === 0) return state;

    // Clear pending starts
    state = { ...state, pendingAsyncStarts: [] };

    // Start each operation as a Promise
    for (const start of pending) {
      const operation = state.asyncOperations.get(start.operationId);
      if (!operation) continue;

      if (start.aiDetails) {
        // Start AI operation
        const { prompt } = start.aiDetails;

        // Create the Promise for this AI call (simpler version for isolated state)
        const promise = (async () => {
          try {
            const result = await this.aiProvider.execute(prompt);
            const vibeValue = createVibeValue(result.value, { source: 'ai' });
            completeAsyncOperation(state, start.operationId, vibeValue);
            return vibeValue;
          } catch (error) {
            const vibeError = createAsyncVibeError(error);
            failAsyncOperation(state, start.operationId, vibeError);
            return createVibeValue(null, { source: 'ai', err: true, errDetails: vibeError });
          }
        })();

        startAsyncOperation(operation, promise);
      } else if (start.tsDetails) {
        // Start TS block operation
        const { params, body, paramValues, location } = start.tsDetails;

        const promise = (async () => {
          try {
            const result = await evalTsBlock(params, body, paramValues, location);
            const vibeValue = createVibeValue(result, { source: 'ts' });
            completeAsyncOperation(state, start.operationId, vibeValue);
            return vibeValue;
          } catch (error) {
            const vibeError = createAsyncVibeError(error, location);
            failAsyncOperation(state, start.operationId, vibeError);
            return createVibeValue(null, { source: 'ts', err: true, errDetails: vibeError });
          }
        })();

        startAsyncOperation(operation, promise);
      } else if (start.tsFuncDetails) {
        // Start imported TS function operation
        const { funcName, args, location } = start.tsFuncDetails;

        const promise = (async () => {
          try {
            const fn = getImportedTsFunction(state, funcName);
            if (!fn) {
              throw new Error(`Import error: Function '${funcName}' not found`);
            }
            const result = await fn(...args);
            const vibeValue = createVibeValue(result, { source: 'ts' });
            completeAsyncOperation(state, start.operationId, vibeValue);
            return vibeValue;
          } catch (error) {
            const vibeError = createAsyncVibeError(error, location);
            failAsyncOperation(state, start.operationId, vibeError);
            return createVibeValue(null, { source: 'ts', err: true, errDetails: vibeError });
          }
        })();

        startAsyncOperation(operation, promise);
      } else if (start.vibeFuncDetails) {
        // Nested Vibe function call - reuse shared helper
        const { funcName, args, modulePath } = start.vibeFuncDetails;

        const promise = (async () => {
          try {
            const result = await this.runVibeFuncIsolated(state, funcName, args, modulePath);
            const vibeValue = createVibeValue(result, { source: 'vibe-function' });
            completeAsyncOperation(state, start.operationId, vibeValue);
            return vibeValue;
          } catch (error) {
            const vibeError = createAsyncVibeError(error);
            failAsyncOperation(state, start.operationId, vibeError);
            return createVibeValue(null, { source: 'vibe-function', err: true, errDetails: vibeError });
          }
        })();

        startAsyncOperation(operation, promise);
      }
    }

    return state;
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

// Legacy enum for backward compatibility
export enum RuntimeStatus {
  RUNNING = 'running',
  AWAITING_AI_RESPONSE = 'awaiting_ai',
  AWAITING_COMPRESS = 'awaiting_compress',
  AWAITING_USER_INPUT = 'awaiting_user',
  AWAITING_TS = 'awaiting_ts',
  AWAITING_TOOL = 'awaiting_tool',
  COMPLETED = 'completed',
  ERROR = 'error',
}

// Re-export tool system
export * from './tools';
