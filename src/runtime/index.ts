// Re-export types (RuntimeStatus exported as enum below for backward compatibility)
export type {
  RuntimeState,
  StackFrame,
  Variable,
  ContextVariable,
  AIOperation,
  AIInteraction,
  ExecutionEntry,
  PendingAI,
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
import { createInitialState, resumeWithAIResponse, resumeWithUserInput, resumeWithTsResult, resumeWithImportedTsResult, resumeWithToolResult } from './state';
import { step, runUntilPause } from './step';
import { evalTsBlock } from './ts-eval';
import { loadImports, getImportedTsFunction } from './modules';
import { buildGlobalContext, formatContextForAI } from './context';
import { buildMessages } from './ai/formatters';
import { saveAIInteractions } from './ai-logger';

// Token usage from AI providers
import type { TokenUsage } from './ai/types';

// AI execution result with optional usage
export interface AIExecutionResult {
  value: unknown;
  usage?: TokenUsage;
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
    this.state = createInitialState(program, { logAiInteractions: this.logAiInteractions });
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

    // Handle AI calls, TS evaluation, and tool calls in a loop
    while (
      this.state.status === 'awaiting_ai' ||
      this.state.status === 'awaiting_user' ||
      this.state.status === 'awaiting_ts' ||
      this.state.status === 'awaiting_tool'
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

        // Capture messages if logging is enabled
        let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
        let targetType: string | null = null;

        if (this.logAiInteractions) {
          // Build context and messages exactly as the AI provider would
          const context = buildGlobalContext(this.state);
          const formattedContext = formatContextForAI(context);

          // Get target type from next instruction
          const nextInstruction = this.state.instructionStack[0];
          if (nextInstruction?.op === 'declare_var' && nextInstruction.type) {
            targetType = nextInstruction.type;
          }

          // Build the actual messages sent to the model
          messages = buildMessages(
            pendingAI.prompt,
            formattedContext.text,
            targetType as 'text' | 'json' | 'boolean' | 'number' | null,
            true // supportsStructuredOutput - assume true for logging
          );
        }

        let result: AIExecutionResult;
        if (pendingAI.type === 'do') {
          result = await this.aiProvider.execute(pendingAI.prompt);
        } else if (pendingAI.type === 'vibe') {
          result = await this.aiProvider.generateCode(pendingAI.prompt);
        } else {
          result = await this.aiProvider.execute(pendingAI.prompt);
        }

        // Create interaction record if logging
        let modelDetails: AIInteraction['modelDetails'];
        if (this.logAiInteractions) {
          // Get model details from state
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
        }

        const interaction: AIInteraction | undefined = this.logAiInteractions ? {
          type: pendingAI.type,
          prompt: pendingAI.prompt,
          response: result.value,
          timestamp: startTime,
          model: pendingAI.model,
          modelDetails,
          messages,
          targetType,
          usage: result.usage,
          durationMs: Date.now() - startTime,
        } : undefined;

        this.state = resumeWithAIResponse(this.state, result.value, interaction);
      } else if (this.state.status === 'awaiting_tool') {
        // Handle tool calls
        if (!this.state.pendingToolCall) {
          throw new Error('State awaiting tool but no pending tool call');
        }

        const { toolName, args } = this.state.pendingToolCall;
        const tool = this.state.toolRegistry.get(toolName);
        if (!tool) {
          throw new Error(`Tool '${toolName}' not found in registry`);
        }

        // Execute the tool - let errors propagate
        const result = await tool.executor(args);
        this.state = resumeWithToolResult(this.state, result);
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

    return this.state.lastResult;
  }

  // Save AI interaction logs if logging is enabled
  private saveLogsIfEnabled(): void {
    if (this.logAiInteractions && this.state.aiInteractions.length > 0) {
      const projectRoot = dirname(this.basePath);
      saveAIInteractions(this.state.aiInteractions, projectRoot);
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
  AWAITING_USER_INPUT = 'awaiting_user',
  AWAITING_TS = 'awaiting_ts',
  AWAITING_TOOL = 'awaiting_tool',
  COMPLETED = 'completed',
  ERROR = 'error',
}

// Re-export tool system
export * from './tools';
