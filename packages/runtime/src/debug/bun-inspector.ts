/**
 * Bun Inspector Client
 * Connects to Bun's debugger using Chrome DevTools Protocol over WebSocket
 */

import type { SourceLocation } from '../errors';
import type { StackFrame } from '@vibe-lang/debug-core';
import { findMappingByScriptId, mapTsLocationToVibe, type TsBlockMapping } from './ts-source-map';

// Chrome DevTools Protocol message types
interface CDPRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface CDPResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface CDPEvent {
  method: string;
  params?: Record<string, unknown>;
}

type CDPMessage = CDPResponse | CDPEvent;

// Debugger paused event params
interface DebuggerPausedParams {
  callFrames: CDPCallFrame[];
  reason: string;
  hitBreakpoints?: string[];
}

// CDP Call Frame
interface CDPCallFrame {
  callFrameId: string;
  functionName: string;
  location: {
    scriptId: string;
    lineNumber: number;
    columnNumber: number;
  };
  url: string;
  scopeChain: CDPScope[];
}

// CDP Scope
interface CDPScope {
  type: string;
  object: { objectId: string };
  name?: string;
}

// Event handlers
type EventHandler = (params: Record<string, unknown>) => void;

/**
 * Bun Inspector Client
 */
export class BunInspectorClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (result: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  }>();
  private eventHandlers = new Map<string, EventHandler[]>();
  private connected = false;
  private scriptIdToUrl = new Map<string, string>();

  constructor(private port: number = 9229) {}

  /**
   * Connect to Bun inspector
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      try {
        // Bun's inspector uses WebSocket
        this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);

        this.ws.onopen = () => {
          this.connected = true;
          // Enable debugger domain
          this.send('Debugger.enable').then(() => {
            resolve();
          }).catch(reject);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.ws.onerror = (error) => {
          reject(new Error(`WebSocket error: ${error}`));
        };

        this.ws.onclose = () => {
          this.connected = false;
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from Bun inspector
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.pendingRequests.clear();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Send a CDP request
   */
  async send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected to Bun inspector');
    }

    const id = ++this.messageId;
    const request: CDPRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(request));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  /**
   * Handle incoming CDP message
   */
  private handleMessage(message: CDPMessage): void {
    if ('id' in message) {
      // Response to a request
      const handler = this.pendingRequests.get(message.id);
      if (handler) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          handler.reject(new Error(message.error.message));
        } else {
          handler.resolve(message.result ?? {});
        }
      }
    } else if ('method' in message) {
      // Event
      this.emitEvent(message.method, message.params ?? {});

      // Track script IDs
      if (message.method === 'Debugger.scriptParsed') {
        const params = message.params as { scriptId: string; url: string };
        this.scriptIdToUrl.set(params.scriptId, params.url);
      }
    }
  }

  /**
   * Register an event handler
   */
  on(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  /**
   * Remove an event handler
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   */
  private emitEvent(event: string, params: Record<string, unknown>): void {
    const handlers = this.eventHandlers.get(event) ?? [];
    for (const handler of handlers) {
      handler(params);
    }
  }

  // Debug commands

  /**
   * Continue execution
   */
  async continue(): Promise<void> {
    await this.send('Debugger.resume');
  }

  /**
   * Step into
   */
  async stepInto(): Promise<void> {
    await this.send('Debugger.stepInto');
  }

  /**
   * Step over
   */
  async stepOver(): Promise<void> {
    await this.send('Debugger.stepOver');
  }

  /**
   * Step out
   */
  async stepOut(): Promise<void> {
    await this.send('Debugger.stepOut');
  }

  /**
   * Pause execution
   */
  async pause(): Promise<void> {
    await this.send('Debugger.pause');
  }

  /**
   * Set breakpoint
   */
  async setBreakpoint(
    scriptId: string,
    lineNumber: number,
    columnNumber?: number,
    condition?: string
  ): Promise<{ breakpointId: string; actualLocation: { lineNumber: number; columnNumber: number } }> {
    const result = await this.send('Debugger.setBreakpoint', {
      location: { scriptId, lineNumber, columnNumber },
      condition,
    });
    return result as any;
  }

  /**
   * Set breakpoint by URL
   */
  async setBreakpointByUrl(
    url: string,
    lineNumber: number,
    columnNumber?: number,
    condition?: string
  ): Promise<{ breakpointId: string; locations: Array<{ scriptId: string; lineNumber: number; columnNumber: number }> }> {
    const result = await this.send('Debugger.setBreakpointByUrl', {
      url,
      lineNumber,
      columnNumber,
      condition,
    });
    return result as any;
  }

  /**
   * Remove breakpoint
   */
  async removeBreakpoint(breakpointId: string): Promise<void> {
    await this.send('Debugger.removeBreakpoint', { breakpointId });
  }

  /**
   * Get stack frames from a paused event
   */
  getStackFrames(pausedParams: DebuggerPausedParams): StackFrame[] {
    return pausedParams.callFrames.map((frame, index) => {
      const url = this.scriptIdToUrl.get(frame.location.scriptId) ?? frame.url;

      // Check if this is a TS block and map location
      const mapping = findMappingByScriptId(frame.location.scriptId);
      let source: SourceLocation;

      if (mapping) {
        source = mapTsLocationToVibe(
          mapping,
          frame.location.lineNumber,
          frame.location.columnNumber
        );
      } else {
        source = {
          file: url,
          line: frame.location.lineNumber + 1, // CDP uses 0-based lines
          column: frame.location.columnNumber + 1,
        };
      }

      return {
        id: index,
        name: frame.functionName || '<anonymous>',
        source,
        isVibeCode: !!mapping, // True if this is a mapped TS block
      };
    });
  }

  /**
   * Get variables from a scope
   */
  async getVariables(objectId: string): Promise<Array<{ name: string; value: string; type: string }>> {
    const result = await this.send('Runtime.getProperties', {
      objectId,
      ownProperties: true,
      generatePreview: true,
    });

    const properties = (result as any).result ?? [];
    return properties.map((prop: any) => ({
      name: prop.name,
      value: this.formatValue(prop.value),
      type: prop.value?.type ?? 'undefined',
    }));
  }

  /**
   * Evaluate expression
   */
  async evaluate(
    expression: string,
    callFrameId?: string
  ): Promise<{ result: string; type: string }> {
    let result;
    if (callFrameId) {
      result = await this.send('Debugger.evaluateOnCallFrame', {
        callFrameId,
        expression,
        generatePreview: true,
      });
    } else {
      result = await this.send('Runtime.evaluate', {
        expression,
        generatePreview: true,
      });
    }

    const value = (result as any).result;
    return {
      result: this.formatValue(value),
      type: value?.type ?? 'undefined',
    };
  }

  /**
   * Format a CDP value for display
   */
  private formatValue(value: any): string {
    if (!value) return 'undefined';

    switch (value.type) {
      case 'undefined':
        return 'undefined';
      case 'null':
        return 'null';
      case 'boolean':
      case 'number':
        return String(value.value);
      case 'string':
        return `"${value.value}"`;
      case 'object':
        if (value.subtype === 'null') return 'null';
        if (value.subtype === 'array') {
          return value.description ?? 'Array';
        }
        return value.description ?? value.className ?? 'Object';
      case 'function':
        return value.description ?? 'function';
      default:
        return String(value.value ?? value.description ?? 'unknown');
    }
  }
}

// Singleton instance
let bunInspector: BunInspectorClient | null = null;

/**
 * Get or create the Bun inspector client
 */
export function getBunInspector(port?: number): BunInspectorClient {
  if (!bunInspector || (port && bunInspector['port'] !== port)) {
    bunInspector = new BunInspectorClient(port);
  }
  return bunInspector;
}

/**
 * Close the Bun inspector client
 */
export function closeBunInspector(): void {
  if (bunInspector) {
    bunInspector.disconnect();
    bunInspector = null;
  }
}
