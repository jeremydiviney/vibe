/**
 * Debug Server - WebSocket server for debug adapter communication
 * Functional approach - manages state and handles protocol messages
 */

import type {
  AdapterToRuntimeMessage,
  RuntimeToAdapterMessage,
  RuntimeEvent,
  RuntimeResponse,
} from '@vibe-lang/debug-core';

import type { RuntimeState } from '../runtime/types';
import type { AIProvider } from '../runtime';
import {
  type VibeDebugState,
  createDebugState,
  setBreakpoints,
  getStackTrace,
  getScopes,
  getVariables,
  getToolCalls,
  getContextEntries,
  resumeExecution,
  setStepMode,
} from './state';
import {
  debugContinue,
  debugStepIn,
  debugStepOver,
  debugStepOut,
  runWithDebug,
} from './runner';

// Server state (module-level for simplicity)
let server: ReturnType<typeof Bun.serve> | null = null;
let activeConnection: { send: (data: string) => void } | null = null;
let messageSeq = 1;

// Runtime state managed by the server
let runtimeState: RuntimeState | null = null;
let debugState: VibeDebugState | null = null;
let aiProvider: AIProvider | null = null;

// Callbacks for async operations
let onInitialized: (() => void) | null = null;

/**
 * Start debug server and wait for connection
 */
export async function startDebugServer(
  port: number,
  initialRuntimeState: RuntimeState,
  initialDebugState: VibeDebugState,
  provider: AIProvider
): Promise<void> {
  runtimeState = initialRuntimeState;
  debugState = initialDebugState;
  aiProvider = provider;

  return new Promise((resolve, reject) => {
    try {
      server = Bun.serve({
        port,
        fetch(req, server) {
          const success = server.upgrade(req);
          if (!success) {
            return new Response('WebSocket upgrade failed', { status: 400 });
          }
          return undefined;
        },
        websocket: {
          open(ws) {
            console.error(`[Debug] Adapter connected on port ${port}`);
            activeConnection = ws;
            resolve();
          },
          message(ws, message) {
            const text = typeof message === 'string' ? message : message.toString();
            handleMessage(text);
          },
          close(ws) {
            console.error('[Debug] Adapter disconnected');
            activeConnection = null;
          },
          error(ws, error) {
            console.error('[Debug] WebSocket error:', error);
          },
        },
      });

      console.error(`[Debug] Listening on ws://127.0.0.1:${port}`);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Stop the debug server
 */
export function stopDebugServer(): void {
  if (server) {
    server.stop();
    server = null;
  }
  activeConnection = null;
  runtimeState = null;
  debugState = null;
  aiProvider = null;
}

/**
 * Send event to debug adapter
 */
export function sendEvent(event: RuntimeEvent): void {
  if (activeConnection) {
    activeConnection.send(JSON.stringify(event));
  }
}

/**
 * Handle incoming message from debug adapter
 */
async function handleMessage(text: string): Promise<void> {
  try {
    const message = JSON.parse(text) as AdapterToRuntimeMessage;

    switch (message.type) {
      case 'initialize':
        handleInitialize(message.seq);
        break;

      case 'setBreakpoints':
        handleSetBreakpoints(message.seq, message.file, message.lines, message.conditions);
        break;

      case 'continue':
        await handleContinue(message.seq);
        break;

      case 'pause':
        handlePause(message.seq);
        break;

      case 'stepIn':
        await handleStepIn(message.seq);
        break;

      case 'stepOver':
        await handleStepOver(message.seq);
        break;

      case 'stepOut':
        await handleStepOut(message.seq);
        break;

      case 'getStackTrace':
        handleGetStackTrace(message.seq);
        break;

      case 'getScopes':
        handleGetScopes(message.seq, message.frameId);
        break;

      case 'getVariables':
        handleGetVariables(message.seq, message.variablesReference);
        break;

      case 'getToolCalls':
        handleGetToolCalls(message.seq, message.variablesReference);
        break;

      case 'getContext':
        handleGetContext(message.seq, message.contextType);
        break;

      case 'evaluate':
        handleEvaluate(message.seq, message.expression, message.frameId);
        break;

      case 'disconnect':
        handleDisconnect(message.seq);
        break;

      default:
        console.error('[Debug] Unknown message type:', (message as any).type);
    }
  } catch (err) {
    console.error('[Debug] Failed to handle message:', err);
  }
}

function sendResponse(response: RuntimeResponse): void {
  if (activeConnection) {
    activeConnection.send(JSON.stringify(response));
  }
}

// Message handlers

function handleInitialize(seq: number): void {
  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'initialize',
    body: {
      supportsConditionalBreakpoints: true,
      supportsEvaluateForHovers: false,
      supportsStepBack: false,
      supportsSetVariable: false,
      supportsRestartRequest: false,
    },
  });

  if (onInitialized) {
    onInitialized();
    onInitialized = null;
  }
}

function handleSetBreakpoints(
  seq: number,
  file: string,
  lines: number[],
  conditions?: (string | undefined)[]
): void {
  if (!debugState) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'setBreakpoints',
      body: { breakpoints: [] },
    });
    return;
  }

  const result = setBreakpoints(debugState, file, lines, conditions);
  debugState = result.debugState;

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'setBreakpoints',
    body: { breakpoints: result.breakpoints },
  });
}

async function handleContinue(seq: number): Promise<void> {
  if (!runtimeState || !debugState || !aiProvider) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'continue',
    });
    return;
  }

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'continue',
  });

  // Run until next breakpoint or completion
  const result = await runWithDebug(
    runtimeState,
    resumeExecution(debugState),
    aiProvider,
    sendEvent
  );

  runtimeState = result.runtimeState;
  debugState = result.debugState;
}

function handlePause(seq: number): void {
  if (!debugState) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'pause',
    });
    return;
  }

  // Set step mode to trigger pause on next instruction
  debugState = setStepMode(debugState, 'into');

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'pause',
  });
}

async function handleStepIn(seq: number): Promise<void> {
  if (!runtimeState || !debugState || !aiProvider) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'stepIn',
    });
    return;
  }

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'stepIn',
  });

  const result = await runWithDebug(
    runtimeState,
    setStepMode(debugState, 'into'),
    aiProvider,
    sendEvent
  );

  runtimeState = result.runtimeState;
  debugState = result.debugState;
}

async function handleStepOver(seq: number): Promise<void> {
  if (!runtimeState || !debugState || !aiProvider) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'stepOver',
    });
    return;
  }

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'stepOver',
  });

  const result = await runWithDebug(
    runtimeState,
    setStepMode(debugState, 'over'),
    aiProvider,
    sendEvent
  );

  runtimeState = result.runtimeState;
  debugState = result.debugState;
}

async function handleStepOut(seq: number): Promise<void> {
  if (!runtimeState || !debugState || !aiProvider) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'stepOut',
    });
    return;
  }

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'stepOut',
  });

  const result = await runWithDebug(
    runtimeState,
    setStepMode(debugState, 'out'),
    aiProvider,
    sendEvent
  );

  runtimeState = result.runtimeState;
  debugState = result.debugState;
}

function handleGetStackTrace(seq: number): void {
  if (!runtimeState) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'getStackTrace',
      body: { stackFrames: [], totalFrames: 0 },
    });
    return;
  }

  const { stackFrames, totalFrames } = getStackTrace(runtimeState);

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'getStackTrace',
    body: { stackFrames, totalFrames },
  });
}

function handleGetScopes(seq: number, frameId: number): void {
  if (!runtimeState || !debugState) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'getScopes',
      body: { scopes: [] },
    });
    return;
  }

  const result = getScopes(debugState, runtimeState, frameId);
  debugState = result.debugState;

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'getScopes',
    body: { scopes: result.scopes },
  });
}

function handleGetVariables(seq: number, variablesReference: number): void {
  if (!runtimeState || !debugState) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'getVariables',
      body: { variables: [] },
    });
    return;
  }

  const result = getVariables(debugState, runtimeState, variablesReference);
  debugState = result.debugState;

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'getVariables',
    body: { variables: result.variables },
  });
}

function handleGetToolCalls(seq: number, variablesReference: number): void {
  if (!debugState) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'getToolCalls',
      body: { toolCalls: [] },
    });
    return;
  }

  const toolCalls = getToolCalls(debugState, variablesReference);

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'getToolCalls',
    body: { toolCalls },
  });
}

function handleGetContext(seq: number, contextType: 'default' | 'local'): void {
  if (!runtimeState) {
    sendResponse({
      type: 'response',
      seq: messageSeq++,
      requestSeq: seq,
      success: false,
      message: 'Debug session not initialized',
      command: 'getContext',
      body: { entries: [] },
    });
    return;
  }

  const entries = getContextEntries(runtimeState, contextType);

  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'getContext',
    body: { entries },
  });
}

function handleEvaluate(seq: number, expression: string, frameId: number): void {
  // TODO: Implement expression evaluation
  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: false,
    message: 'Expression evaluation not yet implemented',
    command: 'evaluate',
    body: { result: '', type: '', variablesReference: 0 },
  });
}

function handleDisconnect(seq: number): void {
  sendResponse({
    type: 'response',
    seq: messageSeq++,
    requestSeq: seq,
    success: true,
    command: 'disconnect',
  });

  stopDebugServer();
}
