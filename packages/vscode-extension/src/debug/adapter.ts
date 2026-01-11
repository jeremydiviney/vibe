/**
 * Vibe Debug Adapter
 * Implements VSCode Debug Adapter Protocol (DAP) and communicates with Vibe runtime via WebSocket
 */

import {
  LoggingDebugSession,
  InitializedEvent,
  StoppedEvent,
  TerminatedEvent,
  OutputEvent,
  Thread,
  StackFrame as DAPStackFrame,
  Scope,
  Source,
  Variable as DAPVariable,
  Breakpoint as DAPBreakpoint,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import type {
  AdapterToRuntimeMessage,
  RuntimeToAdapterMessage,
  RuntimeEvent,
  RuntimeResponse,
  StackFrame,
  Variable,
  Breakpoint,
} from '@vibe-lang/debug-core';

// Launch configuration
interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  program: string;
  stopOnEntry?: boolean;
  cwd?: string;
}

// Single thread ID (Vibe is single-threaded)
const THREAD_ID = 1;

export class VibeDebugSession extends LoggingDebugSession {
  private ws: WebSocket | null = null;
  private vibeProcess: ChildProcess | null = null;
  private pendingRequests: Map<number, (response: RuntimeResponse) => void> = new Map();
  private messageSeq = 1;
  private debugPort = 9229;
  private programPath = '';

  constructor() {
    super();

    // Set up line/column handling (Vibe uses 1-based)
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }

  /**
   * Initialize request - first request from VSCode
   */
  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    args: DebugProtocol.InitializeRequestArguments
  ): void {
    // Report capabilities
    response.body = response.body || {};
    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsFunctionBreakpoints = false;
    response.body.supportsConditionalBreakpoints = true;
    response.body.supportsEvaluateForHovers = false;
    response.body.supportsStepBack = false;
    response.body.supportsSetVariable = false;
    response.body.supportsRestartRequest = false;
    response.body.supportsModulesRequest = false;

    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  /**
   * Launch request - start the Vibe program
   */
  protected async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: LaunchRequestArguments
  ): Promise<void> {
    this.programPath = args.program;
    const stopOnEntry = args.stopOnEntry ?? false;
    const cwd = args.cwd ?? process.cwd();

    try {
      // Find an available port
      this.debugPort = await this.findAvailablePort();

      // Start Vibe with --inspect flag
      const inspectFlag = stopOnEntry ? '--inspect-brk' : '--inspect';

      // Use bun to run vibe with debug flags
      this.vibeProcess = spawn('bun', ['run', 'vibe', inspectFlag, `--inspect-port=${this.debugPort}`, args.program], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Handle stdout/stderr
      if (this.vibeProcess.stdout) {
        this.vibeProcess.stdout.on('data', (data: Buffer) => {
          this.sendEvent(new OutputEvent(data.toString(), 'stdout'));
        });
      }
      if (this.vibeProcess.stderr) {
        this.vibeProcess.stderr.on('data', (data: Buffer) => {
          this.sendEvent(new OutputEvent(data.toString(), 'stderr'));
        });
      }

      this.vibeProcess.on('exit', (code) => {
        this.sendEvent(new TerminatedEvent());
      });

      // Wait for process to start and connect
      await this.connectToRuntime();

      // Initialize the debug session
      await this.sendRuntimeMessage({ type: 'initialize', seq: this.messageSeq++ });

      this.sendResponse(response);
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to launch: ${err}`);
    }
  }

  /**
   * Configuration done request
   */
  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    this.sendResponse(response);
  }

  /**
   * Set breakpoints request
   */
  protected async setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): Promise<void> {
    const source = args.source;
    const breakpoints = args.breakpoints || [];
    const path = source.path || '';

    try {
      // Send to runtime
      const result = await this.sendRuntimeMessage({
        type: 'setBreakpoints',
        seq: this.messageSeq++,
        file: path,
        lines: breakpoints.map(bp => bp.line),
        conditions: breakpoints.map(bp => bp.condition),
      });

      if (result.command === 'setBreakpoints' && result.success) {
        response.body = {
          breakpoints: result.body.breakpoints.map((bp: Breakpoint) => ({
            id: bp.id,
            verified: bp.verified,
            line: bp.line,
            source: { path: bp.file },
          })),
        };
      } else {
        response.body = { breakpoints: [] };
      }

      this.sendResponse(response);
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to set breakpoints: ${err}`);
    }
  }

  /**
   * Threads request - return single thread
   */
  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [new Thread(THREAD_ID, 'Main Thread')],
    };
    this.sendResponse(response);
  }

  /**
   * Stack trace request
   */
  protected async stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments
  ): Promise<void> {
    try {
      const result = await this.sendRuntimeMessage({
        type: 'getStackTrace',
        seq: this.messageSeq++,
      });

      if (result.command === 'getStackTrace' && result.success) {
        response.body = {
          stackFrames: result.body.stackFrames.map((frame: StackFrame) =>
            new DAPStackFrame(
              frame.id,
              frame.name,
              new Source(frame.source.file.split('/').pop() || 'unknown', frame.source.file),
              frame.source.line,
              frame.source.column
            )
          ),
          totalFrames: result.body.totalFrames,
        };
      } else {
        response.body = { stackFrames: [], totalFrames: 0 };
      }

      this.sendResponse(response);
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to get stack trace: ${err}`);
    }
  }

  /**
   * Scopes request
   */
  protected async scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments
  ): Promise<void> {
    try {
      const result = await this.sendRuntimeMessage({
        type: 'getScopes',
        seq: this.messageSeq++,
        frameId: args.frameId,
      });

      if (result.command === 'getScopes' && result.success) {
        response.body = {
          scopes: result.body.scopes.map((scope: any) =>
            new Scope(scope.name, scope.variablesReference, scope.expensive)
          ),
        };
      } else {
        response.body = { scopes: [] };
      }

      this.sendResponse(response);
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to get scopes: ${err}`);
    }
  }

  /**
   * Variables request
   */
  protected async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): Promise<void> {
    try {
      const result = await this.sendRuntimeMessage({
        type: 'getVariables',
        seq: this.messageSeq++,
        variablesReference: args.variablesReference,
      });

      if (result.command === 'getVariables' && result.success) {
        response.body = {
          variables: result.body.variables.map((v: Variable) =>
            this.formatVariable(v)
          ),
        };
      } else {
        response.body = { variables: [] };
      }

      this.sendResponse(response);
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to get variables: ${err}`);
    }
  }

  /**
   * Format a variable for display in VSCode
   * Adds visual indicators for .err and .toolCalls
   */
  private formatVariable(v: Variable): DAPVariable {
    let displayValue = v.value;
    const decorations: string[] = [];

    // Add error indicator
    if (v.hasError && v.errorMessage) {
      decorations.push(`[err: ${v.errorMessage}]`);
    }

    // Add tool calls indicator
    if (v.hasToolCalls && v.toolCallCount && v.toolCallCount > 0) {
      decorations.push(`[${v.toolCallCount} tool call${v.toolCallCount > 1 ? 's' : ''}]`);
    }

    // Append decorations to value
    if (decorations.length > 0) {
      displayValue = `${v.value} ${decorations.join(' ')}`;
    }

    return {
      name: v.name,
      value: displayValue,
      type: v.type,
      variablesReference: v.variablesReference,
      // Use presentation hint to indicate special states
      presentationHint: v.hasError
        ? { kind: 'data', attributes: ['hasError'] }
        : undefined,
    };
  }

  /**
   * Continue request
   */
  protected async continueRequest(
    response: DebugProtocol.ContinueResponse,
    args: DebugProtocol.ContinueArguments
  ): Promise<void> {
    try {
      await this.sendRuntimeMessage({
        type: 'continue',
        seq: this.messageSeq++,
      });

      response.body = { allThreadsContinued: true };
      this.sendResponse(response);
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to continue: ${err}`);
    }
  }

  /**
   * Pause request
   */
  protected async pauseRequest(
    response: DebugProtocol.PauseResponse,
    args: DebugProtocol.PauseArguments
  ): Promise<void> {
    try {
      await this.sendRuntimeMessage({
        type: 'pause',
        seq: this.messageSeq++,
      });

      this.sendResponse(response);
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to pause: ${err}`);
    }
  }

  /**
   * Step in request
   */
  protected async stepInRequest(
    response: DebugProtocol.StepInResponse,
    args: DebugProtocol.StepInArguments
  ): Promise<void> {
    try {
      await this.sendRuntimeMessage({
        type: 'stepIn',
        seq: this.messageSeq++,
      });

      this.sendResponse(response);
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to step in: ${err}`);
    }
  }

  /**
   * Step over (next) request
   */
  protected async nextRequest(
    response: DebugProtocol.NextResponse,
    args: DebugProtocol.NextArguments
  ): Promise<void> {
    try {
      await this.sendRuntimeMessage({
        type: 'stepOver',
        seq: this.messageSeq++,
      });

      this.sendResponse(response);
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to step over: ${err}`);
    }
  }

  /**
   * Step out request
   */
  protected async stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    args: DebugProtocol.StepOutArguments
  ): Promise<void> {
    try {
      await this.sendRuntimeMessage({
        type: 'stepOut',
        seq: this.messageSeq++,
      });

      this.sendResponse(response);
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to step out: ${err}`);
    }
  }

  /**
   * Disconnect request
   */
  protected async disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments
  ): Promise<void> {
    try {
      if (this.ws) {
        await this.sendRuntimeMessage({
          type: 'disconnect',
          seq: this.messageSeq++,
        });
        this.ws.close();
        this.ws = null;
      }

      if (this.vibeProcess) {
        this.vibeProcess.kill();
        this.vibeProcess = null;
      }

      this.sendResponse(response);
    } catch (err) {
      // Ignore errors during disconnect
      this.sendResponse(response);
    }
  }

  // Helper methods

  private async findAvailablePort(): Promise<number> {
    // Simple approach: start from 9229 and try a few ports
    // In production, we'd use a proper port finder
    return 9229 + Math.floor(Math.random() * 100);
  }

  private async connectToRuntime(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout connecting to runtime'));
      }, 10000);

      const tryConnect = () => {
        const ws = new WebSocket(`ws://127.0.0.1:${this.debugPort}`);

        ws.on('open', () => {
          clearTimeout(timeout);
          this.ws = ws;
          this.setupWebSocketHandlers();
          resolve();
        });

        ws.on('error', () => {
          // Retry after a short delay
          setTimeout(tryConnect, 100);
        });
      };

      tryConnect();
    });
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as RuntimeToAdapterMessage;
        this.handleRuntimeMessage(message);
      } catch (err) {
        this.sendEvent(new OutputEvent(`Failed to parse message: ${err}\n`, 'stderr'));
      }
    });

    this.ws.on('close', () => {
      this.sendEvent(new TerminatedEvent());
    });

    this.ws.on('error', (err) => {
      this.sendEvent(new OutputEvent(`WebSocket error: ${err}\n`, 'stderr'));
    });
  }

  private handleRuntimeMessage(message: RuntimeToAdapterMessage): void {
    if (message.type === 'response') {
      // Handle response to a request
      const handler = this.pendingRequests.get(message.requestSeq);
      if (handler) {
        this.pendingRequests.delete(message.requestSeq);
        handler(message);
      }
    } else if (message.type === 'event') {
      // Handle event
      this.handleRuntimeEvent(message);
    }
  }

  private handleRuntimeEvent(event: RuntimeEvent): void {
    switch (event.event) {
      case 'stopped':
        this.sendEvent(new StoppedEvent(event.body.reason, THREAD_ID));
        break;

      case 'continued':
        // VSCode handles this automatically
        break;

      case 'output':
        this.sendEvent(new OutputEvent(event.body.output, event.body.category));
        break;

      case 'terminated':
        this.sendEvent(new TerminatedEvent());
        break;

      case 'breakpoint':
        // Breakpoint verification update
        break;
    }
  }

  private sendRuntimeMessage(message: AdapterToRuntimeMessage): Promise<RuntimeResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to runtime'));
        return;
      }

      this.pendingRequests.set(message.seq, resolve);
      this.ws.send(JSON.stringify(message));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(message.seq)) {
          this.pendingRequests.delete(message.seq);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

}

// Start the debug adapter
VibeDebugSession.run(VibeDebugSession);
