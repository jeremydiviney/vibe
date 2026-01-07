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
  getStateSummary,
} from './serialize';

// Re-export AI provider implementations
export { createRealAIProvider, createMockAIProvider } from './ai-provider';

// Re-export AI module
export * from './ai';

// Re-export AI interaction logging utilities
export { formatAIInteractions, dumpAIInteractions, saveAIInteractions } from './ai-logger';

// Legacy imports for backward compatibility
import * as AST from '../ast';
import { dirname } from 'path';
import type { RuntimeState, AIInteraction } from './types';
import { resolveValue } from './types';
import { createInitialState, resumeWithAIResponse, resumeWithUserInput, resumeWithTsResult, resumeWithImportedTsResult, resumeWithToolResult, resumeWithCompressResult } from './state';
import { step, runUntilPause } from './step';
import { evalTsBlock } from './ts-eval';
import { loadImports, getImportedTsFunction } from './modules';
import { buildLocalContext, buildGlobalContext, formatContextForAI, formatEntriesForSummarization } from './context';
import { saveAIInteractions } from './ai-logger';

// Token usage from AI providers
import type { TokenUsage } from './ai/types';
import type { ToolRoundResult } from './ai/tool-loop';
import type { AILogMessage, ContextEntry, PromptToolCall } from './types';

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
  logAiInteractions?: boolean; // Capture detailed AI interaction logs for debugging
  rootDir?: string;            // Root directory for file operation sandboxing (defaults to cwd)
}

// Legacy Runtime class - convenience wrapper around functional API
export class Runtime {
  private state: RuntimeState;
  private aiProvider: AIProvider;
  private basePath: string;
  private importsLoaded: boolean = false;
  private logAiInteractions: boolean;

  constructor(program: AST.Program, aiProvider: AIProvider, options?: RuntimeOptions) {
    this.logAiInteractions = options?.logAiInteractions ?? false;
    this.state = createInitialState(program, {
      logAiInteractions: this.logAiInteractions,
      rootDir: options?.rootDir,
    });
    this.aiProvider = aiProvider;
    this.basePath = options?.basePath ?? process.cwd() + '/main.vibe';
  }

  getState(): RuntimeState {
    return { ...this.state };
  }

  getValue(name: string): unknown {
    const frame = this.state.callStack[this.state.callStack.length - 1];
    if (!frame) return undefined;

    const variable = frame.locals[name];
    // Resolve AIResultObject to its value for easier testing
    return resolveValue(variable?.value);
  }

  // Get raw value including AIResultObject wrapper if present
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
    // Load imports if not already loaded
    if (!this.importsLoaded) {
      this.state = await loadImports(this.state, this.basePath);
      this.importsLoaded = true;
    }

    // Run until pause or complete
    this.state = runUntilPause(this.state);

    // Handle AI calls, TS evaluation, tool calls, and compress in a loop
    while (
      this.state.status === 'awaiting_ai' ||
      this.state.status === 'awaiting_user' ||
      this.state.status === 'awaiting_ts' ||
      this.state.status === 'awaiting_tool' ||
      this.state.status === 'awaiting_compress'
    ) {
      if (this.state.status === 'awaiting_ts') {
        if (this.state.pendingTS) {
          // Handle inline ts block evaluation
          const { params, body, paramValues } = this.state.pendingTS;
          const result = await evalTsBlock(params, body, paramValues);
          this.state = resumeWithTsResult(this.state, result);
        } else if (this.state.pendingImportedTsCall) {
          // Handle imported TS function call
          const { funcName, args } = this.state.pendingImportedTsCall;
          const fn = getImportedTsFunction(this.state, funcName);
          if (!fn) {
            throw new Error(`Import error: Function '${funcName}' not found`);
          }
          const result = await fn(...args);
          this.state = resumeWithImportedTsResult(this.state, result);
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

        // vibe is the only AI expression type now
        const result: AIExecutionResult = await this.aiProvider.execute(pendingAI.prompt);

        // Create interaction record if logging
        // Uses context from result (single source of truth from ai-provider)
        let interaction: AIInteraction | undefined;
        if (this.logAiInteractions) {
          // Get model details from state
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

        const { args, executor } = this.state.pendingToolCall;

        // Execute the tool with context - let errors propagate
        const context = { rootDir: this.state.rootDir };
        const result = await executor(args, context);
        this.state = resumeWithToolResult(this.state, result);
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
    }

    if (this.state.status === 'error') {
      // Save logs even on error if logging enabled
      this.saveLogsIfEnabled();
      // Throw the original error object to preserve location info
      throw this.state.errorObject ?? new Error(this.state.error ?? 'Unknown runtime error');
    }

    // Save logs on successful completion
    this.saveLogsIfEnabled();

    // Resolve AIResultObject to its value for the final return
    return resolveValue(this.state.lastResult);
  }

  // Save AI interaction logs if logging is enabled
  private saveLogsIfEnabled(): void {
    if (this.logAiInteractions && this.state.aiInteractions.length > 0) {
      const projectRoot = dirname(this.basePath);
      saveAIInteractions(this.state, projectRoot);
    }
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
