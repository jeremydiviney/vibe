/**
 * Verbose Logger - JSONL logging for AI interactions, TS executions, and tool calls
 *
 * Outputs:
 * - Main log: JSONL events to console and .vibe-logs/run-{timestamp}.jsonl
 * - Context files: .vibe-logs/run-{timestamp}/do-000001.txt, etc.
 */

import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import type {
  LogEvent,
  RunStartEvent,
  RunCompleteEvent,
  AIStartEvent,
  AICompleteEvent,
  ToolStartEvent,
  ToolCompleteEvent,
  TSStartEvent,
  TSCompleteEvent,
  AILogMessage,
  TokenUsage,
} from './types';

export interface VerboseLoggerOptions {
  logDir?: string;           // Base directory for logs (default: .vibe-logs)
  printToConsole?: boolean;  // Print events to console (default: true)
  writeToFile?: boolean;     // Write events to file (default: true)
}

interface AICallContext {
  model: string;
  modelDetails?: { name: string; provider: string; url?: string };
  type: 'do' | 'vibe';
  targetType: string | null;
  contextMode?: 'default' | 'local';
  messages: AILogMessage[];
  // For complete context files (populated after AI call)
  response?: string;
  toolRounds?: Array<{
    toolCalls: Array<{ id: string; toolName: string; args: Record<string, unknown> }>;
    results: Array<{ toolCallId: string; result?: unknown; error?: string }>;
  }>;
}

/**
 * VerboseLogger - Manages structured logging for Vibe runtime
 */
export class VerboseLogger {
  private logDir: string;
  private runTimestamp: string;
  private mainLogPath: string;
  private contextDir: string;
  private printToConsole: boolean;
  private writeToFile: boolean;

  private seq = 0;
  private counters = { do: 0, vibe: 0, ts: 0, tsf: 0 };
  private events: LogEvent[] = [];
  private startTime: number = 0;

  constructor(options: VerboseLoggerOptions = {}) {
    this.logDir = options.logDir ?? '.vibe-logs';
    this.printToConsole = options.printToConsole ?? true;
    this.writeToFile = options.writeToFile ?? true;

    // Generate timestamp for this run
    this.runTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.contextDir = join(this.logDir, `run-${this.runTimestamp}`);
    this.mainLogPath = join(this.contextDir, 'run.jsonl');
  }

  /**
   * Initialize the logger (create directories)
   */
  private ensureDirectories(): void {
    if (this.writeToFile) {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      if (!existsSync(this.contextDir)) {
        mkdirSync(this.contextDir, { recursive: true });
      }
    }
  }

  /**
   * Generate next ID for a given type
   */
  private nextId(type: 'do' | 'vibe' | 'ts' | 'tsf'): string {
    this.counters[type]++;
    return `${type}-${String(this.counters[type]).padStart(6, '0')}`;
  }

  /**
   * Log an event (console + file + in-memory)
   */
  private logEvent(event: LogEvent): void {
    this.events.push(event);

    const jsonLine = JSON.stringify(event);

    if (this.printToConsole) {
      console.log(jsonLine);
    }

    if (this.writeToFile) {
      this.ensureDirectories();
      appendFileSync(this.mainLogPath, jsonLine + '\n');
    }
  }

  /**
   * Write context file for an AI call
   */
  private writeContextFile(id: string, context: AICallContext): void {
    if (!this.writeToFile) return;

    this.ensureDirectories();

    const lines: string[] = [
      `=== AI Call: ${id} ===`,
      `Model: ${context.modelDetails?.name ?? context.model} (${context.modelDetails?.provider ?? 'unknown'})`,
      `Type: ${context.type}`,
      `Target: ${context.targetType ?? 'text'}`,
      `Context: ${context.contextMode ?? 'default'}`,
      `Timestamp: ${new Date().toISOString()}`,
      '',
      '=== REQUEST MESSAGES ===',
      '',
    ];

    for (const msg of context.messages) {
      lines.push(`[${msg.role}]`);
      lines.push(msg.content);

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        lines.push('');
        lines.push('Tool calls:');
        for (const tc of msg.toolCalls) {
          lines.push(`  - ${tc.toolName}(${JSON.stringify(tc.args)})`);
        }
      }

      if (msg.toolResults && msg.toolResults.length > 0) {
        lines.push('');
        lines.push('Tool results:');
        for (const tr of msg.toolResults) {
          if (tr.error) {
            lines.push(`  - Error: ${tr.error}`);
          } else {
            lines.push(`  - Result: ${JSON.stringify(tr.result)}`);
          }
        }
      }

      lines.push('');
    }

    lines.push('=== END REQUEST ===');

    // Add response if available
    if (context.response !== undefined) {
      lines.push('');
      lines.push('=== RESPONSE ===');
      lines.push('');
      lines.push(context.response);
      lines.push('');
      lines.push('=== END RESPONSE ===');
    }

    // Add tool rounds if any
    if (context.toolRounds && context.toolRounds.length > 0) {
      lines.push('');
      lines.push('=== TOOL EXECUTION ===');
      lines.push('');

      for (let i = 0; i < context.toolRounds.length; i++) {
        const round = context.toolRounds[i];
        lines.push(`--- Round ${i + 1} ---`);

        for (const call of round.toolCalls) {
          lines.push(`Tool: ${call.toolName}`);
          lines.push(`Args: ${JSON.stringify(call.args, null, 2)}`);

          const result = round.results.find(r => r.toolCallId === call.id);
          if (result) {
            if (result.error) {
              lines.push(`Error: ${result.error}`);
            } else {
              lines.push(`Result: ${JSON.stringify(result.result, null, 2)}`);
            }
          }
          lines.push('');
        }
      }

      lines.push('=== END TOOL EXECUTION ===');
    }

    const filePath = join(this.contextDir, `${id}.txt`);
    writeFileSync(filePath, lines.join('\n'));
  }

  /**
   * Write context file for a TS block
   */
  private writeTSContextFile(id: string, params: string[], paramValues: unknown[], body: string, location: { file: string; line: number }): void {
    if (!this.writeToFile) return;

    this.ensureDirectories();

    const lines: string[] = [
      `// TS Block: ${id}`,
      `// Location: ${location.file}:${location.line}`,
    ];

    if (params.length > 0) {
      const paramStr = params.map((p, i) => `${p} = ${JSON.stringify(paramValues[i])}`).join(', ');
      lines.push(`// Params: ${paramStr}`);
    }

    lines.push('');
    lines.push(body);

    const filePath = join(this.contextDir, `${id}.ts`);
    writeFileSync(filePath, lines.join('\n'));
  }

  /**
   * Write context file for an imported TS function call
   */
  private writeTSFunctionContextFile(id: string, funcName: string, args: unknown[], location: { file: string; line: number }): void {
    if (!this.writeToFile) return;

    this.ensureDirectories();

    const lines: string[] = [
      `// TS Function Call: ${id}`,
      `// Function: ${funcName}`,
      `// Location: ${location.file}:${location.line}`,
      '',
      `${funcName}(`,
    ];

    for (let i = 0; i < args.length; i++) {
      const comma = i < args.length - 1 ? ',' : '';
      lines.push(`  ${JSON.stringify(args[i], null, 2).split('\n').join('\n  ')}${comma}`);
    }

    lines.push(')');

    const filePath = join(this.contextDir, `${id}.ts`);
    writeFileSync(filePath, lines.join('\n'));
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Log run start
   */
  start(file: string): void {
    this.startTime = Date.now();

    const event: RunStartEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event: 'run_start',
      file,
    };

    this.logEvent(event);
  }

  /**
   * Log run completion
   */
  complete(status: 'completed' | 'error', error?: string): void {
    const event: RunCompleteEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event: 'run_complete',
      durationMs: Date.now() - this.startTime,
      status,
      ...(error && { error }),
    };

    this.logEvent(event);
  }

  // Store context for each AI call so we can complete it later
  private aiContexts = new Map<string, AICallContext>();

  /**
   * Log AI call start - returns the ID for this call
   * Note: Context file is written in aiComplete, not here, so we have the response and tool calls
   */
  aiStart(
    type: 'do' | 'vibe',
    model: string,
    prompt: string,
    context: AICallContext
  ): string {
    const id = this.nextId(type);

    const event: AIStartEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event: 'ai_start',
      id,
      type,
      model,
      prompt: prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt,
    };

    this.logEvent(event);

    // Store context for later completion (context file written in aiComplete)
    this.aiContexts.set(id, context);

    return id;
  }

  /**
   * Log AI call completion and write context file with full details
   */
  aiComplete(
    id: string,
    durationMs: number,
    usage?: TokenUsage,
    toolCallCount = 0,
    error?: string,
    completionDetails?: {
      messages?: AILogMessage[];
      response?: string;
      toolRounds?: Array<{
        toolCalls: Array<{ id: string; toolName: string; args: Record<string, unknown> }>;
        results: Array<{ toolCallId: string; result?: unknown; error?: string }>;
      }>;
    }
  ): void {
    const event: AICompleteEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event: 'ai_complete',
      id,
      durationMs,
      ...(usage && { tokens: {
        in: usage.inputTokens,
        out: usage.outputTokens,
        ...(usage.thinkingTokens && { thinking: usage.thinkingTokens }),
        ...(usage.cachedInputTokens && { cachedIn: usage.cachedInputTokens }),
      } }),
      toolCalls: toolCallCount,
      ...(error && { error }),
    };

    this.logEvent(event);

    // Write context file with full details
    const context = this.aiContexts.get(id);
    if (context) {
      // Update context with completion details
      if (completionDetails?.messages) {
        context.messages = completionDetails.messages;
      }
      if (completionDetails?.response !== undefined) {
        context.response = completionDetails.response;
      }
      if (completionDetails?.toolRounds) {
        context.toolRounds = completionDetails.toolRounds;
      }

      // Now write the full context file
      this.writeContextFile(id, context);

      // Clean up
      this.aiContexts.delete(id);
    }
  }

  /**
   * Log tool call start
   */
  toolStart(parentId: string, tool: string, args: Record<string, unknown>): void {
    const event: ToolStartEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event: 'tool_start',
      parentId,
      tool,
      args,
    };

    this.logEvent(event);
  }

  /**
   * Log tool call completion
   */
  toolComplete(
    parentId: string,
    tool: string,
    durationMs: number,
    success: boolean,
    error?: string
  ): void {
    const event: ToolCompleteEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event: 'tool_complete',
      parentId,
      tool,
      durationMs,
      success,
      ...(error && { error }),
    };

    this.logEvent(event);
  }

  /**
   * Log TS block start - returns the ID
   */
  tsBlockStart(
    params: string[],
    paramValues: unknown[],
    body: string,
    location: { file: string; line: number }
  ): string {
    const id = this.nextId('ts');

    const event: TSStartEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event: 'ts_start',
      id,
      tsType: 'block',
      params,
      location,
    };

    this.logEvent(event);

    // Write TS code to context file
    this.writeTSContextFile(id, params, paramValues, body, location);

    return id;
  }

  /**
   * Log imported TS function start - returns the ID
   */
  tsFunctionStart(
    funcName: string,
    args: unknown[],
    location: { file: string; line: number }
  ): string {
    const id = this.nextId('tsf');

    const event: TSStartEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event: 'ts_start',
      id,
      tsType: 'function',
      name: funcName,
      params: [],  // We don't have param names for imported functions
      location,
    };

    this.logEvent(event);

    // Note: We don't write context files for TS function calls
    // They're too frequent and not useful for debugging AI interactions

    return id;
  }

  /**
   * Log TS block completion
   */
  tsBlockComplete(id: string, durationMs: number, error?: string): void {
    const event: TSCompleteEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event: 'ts_complete',
      id,
      tsType: 'block',
      durationMs,
      ...(error && { error }),
    };

    this.logEvent(event);
  }

  /**
   * Log imported TS function completion
   */
  tsFunctionComplete(id: string, durationMs: number, error?: string): void {
    const event: TSCompleteEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event: 'ts_complete',
      id,
      tsType: 'function',
      durationMs,
      ...(error && { error }),
    };

    this.logEvent(event);
  }

  /**
   * Get all logged events (for testing/inspection)
   */
  getEvents(): LogEvent[] {
    return [...this.events];
  }

  /**
   * Get the main log file path
   */
  getMainLogPath(): string {
    return this.mainLogPath;
  }

  /**
   * Get the context directory path
   */
  getContextDir(): string {
    return this.contextDir;
  }
}

/**
 * Create a no-op logger (when verbose is disabled)
 * Returns null - callers should check for null before logging
 */
export function createNoOpLogger(): null {
  return null;
}
