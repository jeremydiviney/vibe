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
import type { RuntimeState, AIInteraction } from './types';
import { createInitialState, resumeWithAIResponse, resumeWithUserInput, resumeWithTsResult, resumeWithImportedTsResult } from './state';
import { step, runUntilPause } from './step';
import { evalTsBlock } from './ts-eval';
import { loadImports, getImportedTsFunction } from './modules';
import { buildGlobalContext, formatContextForAI } from './context';
import { buildMessages } from './ai/formatters';

// AI provider interface (for external callers)
export interface AIProvider {
  execute(prompt: string): Promise<unknown>;
  generateCode(prompt: string): Promise<string>;
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

    // Handle AI calls and TS evaluation in a loop
    while (
      this.state.status === 'awaiting_ai' ||
      this.state.status === 'awaiting_user' ||
      this.state.status === 'awaiting_ts'
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

        let response: unknown;
        if (pendingAI.type === 'do') {
          response = await this.aiProvider.execute(pendingAI.prompt);
        } else if (pendingAI.type === 'vibe') {
          response = await this.aiProvider.generateCode(pendingAI.prompt);
        } else {
          response = await this.aiProvider.execute(pendingAI.prompt);
        }

        // Create interaction record if logging
        const interaction: AIInteraction | undefined = this.logAiInteractions ? {
          type: pendingAI.type,
          prompt: pendingAI.prompt,
          response,
          timestamp: startTime,
          model: pendingAI.model,
          messages,
          targetType,
          durationMs: Date.now() - startTime,
        } : undefined;

        this.state = resumeWithAIResponse(this.state, response, interaction);
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
      throw new Error(this.state.error ?? 'Unknown runtime error');
    }

    return this.state.lastResult;
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
  COMPLETED = 'completed',
  ERROR = 'error',
}
