// Re-export types
export type {
  RuntimeState,
  RuntimeStatus,
  StackFrame,
  Variable,
  AIOperation,
  ExecutionEntry,
  PendingAI,
  Instruction,
} from './types';

// Re-export state functions
export {
  createInitialState,
  createFrame,
  resumeWithAIResponse,
  resumeWithUserInput,
  pauseExecution,
  resumeExecution,
  currentFrame,
  getVariable,
} from './state';

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

// Re-export serialization
export {
  serializeState,
  deserializeState,
  cloneState,
  getStateSummary,
} from './serialize';

// Legacy imports for backward compatibility
import * as AST from '../ast';
import type { RuntimeState, AIOperation } from './types';
import { createInitialState, resumeWithAIResponse, resumeWithUserInput } from './state';
import { step, runUntilPause } from './step';

// AI provider interface (for external callers)
export interface AIProvider {
  execute(prompt: string): Promise<string>;
  generateCode(prompt: string): Promise<string>;
  askUser(prompt: string): Promise<string>;
}

// Legacy Runtime class - convenience wrapper around functional API
export class Runtime {
  private state: RuntimeState;
  private aiProvider: AIProvider;

  constructor(program: AST.Program, aiProvider: AIProvider) {
    this.state = createInitialState(program);
    this.aiProvider = aiProvider;
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

  // Run the program to completion, handling AI calls
  async run(): Promise<unknown> {
    // Run until pause or complete
    this.state = runUntilPause(this.state);

    // Handle AI calls in a loop
    while (this.state.status === 'awaiting_ai' || this.state.status === 'awaiting_user') {
      if (!this.state.pendingAI) {
        throw new Error('State awaiting AI but no pending AI request');
      }

      let response: string;

      if (this.state.status === 'awaiting_ai') {
        if (this.state.pendingAI.type === 'do') {
          response = await this.aiProvider.execute(this.state.pendingAI.prompt);
        } else if (this.state.pendingAI.type === 'vibe') {
          response = await this.aiProvider.generateCode(this.state.pendingAI.prompt);
        } else {
          response = await this.aiProvider.execute(this.state.pendingAI.prompt);
        }
        this.state = resumeWithAIResponse(this.state, response);
      } else {
        response = await this.aiProvider.askUser(this.state.pendingAI.prompt);
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
  COMPLETED = 'completed',
  ERROR = 'error',
}
