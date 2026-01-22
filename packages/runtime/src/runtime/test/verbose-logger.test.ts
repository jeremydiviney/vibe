import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { VerboseLogger } from '../verbose-logger';
import { existsSync, rmSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('VerboseLogger', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `vibe-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    test('creates logger with default options', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      expect(logger).toBeDefined();
      expect(logger.getEvents()).toEqual([]);
    });

    test('returns empty events initially', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      expect(logger.getEvents()).toHaveLength(0);
    });
  });

  describe('run lifecycle', () => {
    test('logs run_start event', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      logger.start('/test/file.vibe');

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('run_start');
      expect((events[0] as any).file).toBe('/test/file.vibe');
      expect(events[0].seq).toBe(1);
    });

    test('logs run_complete event on success', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      logger.start('/test/file.vibe');
      logger.complete('completed');

      const events = logger.getEvents();
      expect(events).toHaveLength(2);
      expect(events[1].event).toBe('run_complete');
      expect((events[1] as any).status).toBe('completed');
      expect((events[1] as any).durationMs).toBeGreaterThanOrEqual(0);
    });

    test('logs run_complete event on error', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      logger.start('/test/file.vibe');
      logger.complete('error', 'Something went wrong');

      const events = logger.getEvents();
      expect(events).toHaveLength(2);
      expect(events[1].event).toBe('run_complete');
      expect((events[1] as any).status).toBe('error');
      expect((events[1] as any).error).toBe('Something went wrong');
    });
  });

  describe('AI call logging', () => {
    test('generates sequential IDs for do calls', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      const id1 = logger.aiStart('do', 'gpt-4', 'prompt1', {
        model: 'gpt-4',
        type: 'do',
        targetType: 'text',
        messages: [],
      });

      const id2 = logger.aiStart('do', 'gpt-4', 'prompt2', {
        model: 'gpt-4',
        type: 'do',
        targetType: 'text',
        messages: [],
      });

      expect(id1).toBe('do-000001');
      expect(id2).toBe('do-000002');
    });

    test('generates sequential IDs for vibe calls', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      const id1 = logger.aiStart('vibe', 'claude', 'prompt1', {
        model: 'claude',
        type: 'vibe',
        targetType: 'text',
        messages: [],
      });

      const id2 = logger.aiStart('vibe', 'claude', 'prompt2', {
        model: 'claude',
        type: 'vibe',
        targetType: 'text',
        messages: [],
      });

      expect(id1).toBe('vibe-000001');
      expect(id2).toBe('vibe-000002');
    });

    test('logs ai_start and ai_complete events', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      const id = logger.aiStart('do', 'gpt-4', 'What is 2+2?', {
        model: 'gpt-4',
        type: 'do',
        targetType: 'number',
        messages: [],
      });

      logger.aiComplete(id, 150, { inputTokens: 10, outputTokens: 5 }, 0);

      const events = logger.getEvents();
      expect(events).toHaveLength(2);

      const startEvent = events[0] as any;
      expect(startEvent.event).toBe('ai_start');
      expect(startEvent.id).toBe('do-000001');
      expect(startEvent.type).toBe('do');
      expect(startEvent.model).toBe('gpt-4');

      const completeEvent = events[1] as any;
      expect(completeEvent.event).toBe('ai_complete');
      expect(completeEvent.id).toBe('do-000001');
      expect(completeEvent.durationMs).toBe(150);
      expect(completeEvent.tokens).toEqual({ in: 10, out: 5 });
    });

    test('logs ai_complete with error', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      const id = logger.aiStart('vibe', 'claude', 'Do something', {
        model: 'claude',
        type: 'vibe',
        targetType: null,
        messages: [],
      });

      logger.aiComplete(id, 100, undefined, 0, 'API rate limit exceeded');

      const events = logger.getEvents();
      const completeEvent = events[1] as any;
      expect(completeEvent.error).toBe('API rate limit exceeded');
    });

    test('truncates long prompts in log events', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      const longPrompt = 'A'.repeat(200);
      logger.aiStart('do', 'gpt-4', longPrompt, {
        model: 'gpt-4',
        type: 'do',
        targetType: null,
        messages: [],
      });

      const events = logger.getEvents();
      const startEvent = events[0] as any;
      expect(startEvent.prompt.length).toBeLessThanOrEqual(103); // 100 chars + '...'
      expect(startEvent.prompt.endsWith('...')).toBe(true);
    });
  });

  describe('TS block logging', () => {
    test('generates sequential IDs for ts blocks', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      const id1 = logger.tsBlockStart(['x'], [42], 'return x * 2', { file: 'test.vibe', line: 5 });
      const id2 = logger.tsBlockStart(['y'], [10], 'return y + 1', { file: 'test.vibe', line: 10 });

      expect(id1).toBe('ts-000001');
      expect(id2).toBe('ts-000002');
    });

    test('logs ts_start and ts_complete events for blocks', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      const id = logger.tsBlockStart(['x', 'y'], [1, 2], 'return x + y', { file: 'test.vibe', line: 5 });
      logger.tsBlockComplete(id, 10);

      const events = logger.getEvents();
      expect(events).toHaveLength(2);

      const startEvent = events[0] as any;
      expect(startEvent.event).toBe('ts_start');
      expect(startEvent.id).toBe('ts-000001');
      expect(startEvent.tsType).toBe('block');
      expect(startEvent.params).toEqual(['x', 'y']);
      expect(startEvent.location).toEqual({ file: 'test.vibe', line: 5 });

      const completeEvent = events[1] as any;
      expect(completeEvent.event).toBe('ts_complete');
      expect(completeEvent.id).toBe('ts-000001');
      expect(completeEvent.tsType).toBe('block');
      expect(completeEvent.durationMs).toBe(10);
    });

    test('logs ts_complete with error', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      const id = logger.tsBlockStart([], [], 'throw new Error("test")', { file: 'test.vibe', line: 1 });
      logger.tsBlockComplete(id, 5, 'ReferenceError: x is not defined');

      const events = logger.getEvents();
      const completeEvent = events[1] as any;
      expect(completeEvent.error).toBe('ReferenceError: x is not defined');
    });
  });

  describe('TS function logging', () => {
    test('generates sequential IDs for ts functions', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      const id1 = logger.tsFunctionStart('readFile', ['/path'], { file: 'test.vibe', line: 1 });
      const id2 = logger.tsFunctionStart('writeFile', ['/path', 'data'], { file: 'test.vibe', line: 2 });

      expect(id1).toBe('tsf-000001');
      expect(id2).toBe('tsf-000002');
    });

    test('logs ts_start and ts_complete events for functions', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      const id = logger.tsFunctionStart('myFunc', ['arg1', 42], { file: 'test.vibe', line: 10 });
      logger.tsFunctionComplete(id, 25);

      const events = logger.getEvents();
      expect(events).toHaveLength(2);

      const startEvent = events[0] as any;
      expect(startEvent.event).toBe('ts_start');
      expect(startEvent.id).toBe('tsf-000001');
      expect(startEvent.tsType).toBe('function');
      expect(startEvent.name).toBe('myFunc');

      const completeEvent = events[1] as any;
      expect(completeEvent.event).toBe('ts_complete');
      expect(completeEvent.id).toBe('tsf-000001');
      expect(completeEvent.tsType).toBe('function');
    });
  });

  describe('tool logging', () => {
    test('logs tool_start and tool_complete events', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      logger.toolStart('do-000001', 'readFile', { path: '/test.txt' });
      logger.toolComplete('do-000001', 'readFile', 50, true);

      const events = logger.getEvents();
      expect(events).toHaveLength(2);

      const startEvent = events[0] as any;
      expect(startEvent.event).toBe('tool_start');
      expect(startEvent.parentId).toBe('do-000001');
      expect(startEvent.tool).toBe('readFile');
      expect(startEvent.args).toEqual({ path: '/test.txt' });

      const completeEvent = events[1] as any;
      expect(completeEvent.event).toBe('tool_complete');
      expect(completeEvent.parentId).toBe('do-000001');
      expect(completeEvent.tool).toBe('readFile');
      expect(completeEvent.durationMs).toBe(50);
      expect(completeEvent.success).toBe(true);
    });

    test('logs tool_complete with error', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      logger.toolStart('vibe-000001', 'writeFile', { path: '/readonly.txt', content: 'data' });
      logger.toolComplete('vibe-000001', 'writeFile', 10, false, 'Permission denied');

      const events = logger.getEvents();
      const completeEvent = events[1] as any;
      expect(completeEvent.success).toBe(false);
      expect(completeEvent.error).toBe('Permission denied');
    });
  });

  describe('file writing', () => {
    test('writes JSONL log file', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: true,
      });

      logger.start('/test/file.vibe');
      logger.complete('completed');

      const logPath = logger.getMainLogPath();
      expect(existsSync(logPath)).toBe(true);

      const content = readFileSync(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);

      // Verify each line is valid JSON
      const event1 = JSON.parse(lines[0]);
      const event2 = JSON.parse(lines[1]);
      expect(event1.event).toBe('run_start');
      expect(event2.event).toBe('run_complete');
    });

    test('creates context directory', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: true,
      });

      logger.aiStart('do', 'gpt-4', 'test prompt', {
        model: 'gpt-4',
        type: 'do',
        targetType: 'text',
        messages: [{ role: 'user', content: 'test prompt' }],
      });

      const contextDir = logger.getContextDir();
      expect(existsSync(contextDir)).toBe(true);
    });

    test('writes AI context file on aiComplete', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: true,
      });

      const id = logger.aiStart('do', 'gpt-4', 'What is 2+2?', {
        model: 'gpt-4',
        modelDetails: { name: 'gpt-4', provider: 'openai' },
        type: 'do',
        targetType: 'number',
        messages: [], // Empty at start - will be filled in aiComplete
      });

      // Context file is written in aiComplete, not aiStart
      logger.aiComplete(id, 100, { inputTokens: 10, outputTokens: 20 }, 0, undefined, {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is 2+2?' },
        ],
        response: '4',
      });

      const contextDir = logger.getContextDir();
      const contextFile = join(contextDir, 'do-000001.txt');
      expect(existsSync(contextFile)).toBe(true);

      const content = readFileSync(contextFile, 'utf-8');
      expect(content).toContain('AI Call: do-000001');
      expect(content).toContain('Model: gpt-4');
      expect(content).toContain('[system]');
      expect(content).toContain('You are a helpful assistant.');
      expect(content).toContain('[user]');
      expect(content).toContain('What is 2+2?');
      // Check that response is included
      expect(content).toContain('=== RESPONSE ===');
      expect(content).toContain('4');
    });

    test('writes TS block context file', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: true,
      });

      logger.tsBlockStart(['x', 'y'], [10, 20], 'return x + y;', { file: 'test.vibe', line: 5 });

      const contextDir = logger.getContextDir();
      const contextFile = join(contextDir, 'ts-000001.ts');
      expect(existsSync(contextFile)).toBe(true);

      const content = readFileSync(contextFile, 'utf-8');
      expect(content).toContain('TS Block: ts-000001');
      expect(content).toContain('Location: test.vibe:5');
      expect(content).toContain('x = 10');
      expect(content).toContain('y = 20');
      expect(content).toContain('return x + y;');
    });

    test('writes TS function context file', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: true,
      });

      const id = logger.tsFunctionStart('processData', [{ items: [1, 2, 3] }, 'transform'], { file: 'test.vibe', line: 10 });

      // TS function calls don't write context files (they're too frequent and not useful for debugging)
      // Just verify the ID is returned
      expect(id).toBe('tsf-000001');
    });
  });

  describe('ID counter independence', () => {
    test('do, vibe, ts, and tsf counters are independent', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      // Create one of each type
      const doId = logger.aiStart('do', 'gpt-4', 'prompt', {
        model: 'gpt-4',
        type: 'do',
        targetType: null,
        messages: [],
      });

      const vibeId = logger.aiStart('vibe', 'claude', 'prompt', {
        model: 'claude',
        type: 'vibe',
        targetType: null,
        messages: [],
      });

      const tsId = logger.tsBlockStart([], [], 'return 1', { file: 'test.vibe', line: 1 });
      const tsfId = logger.tsFunctionStart('func', [], { file: 'test.vibe', line: 2 });

      // All should be 000001 since counters are independent
      expect(doId).toBe('do-000001');
      expect(vibeId).toBe('vibe-000001');
      expect(tsId).toBe('ts-000001');
      expect(tsfId).toBe('tsf-000001');

      // Create another of each
      const doId2 = logger.aiStart('do', 'gpt-4', 'prompt', {
        model: 'gpt-4',
        type: 'do',
        targetType: null,
        messages: [],
      });

      const vibeId2 = logger.aiStart('vibe', 'claude', 'prompt', {
        model: 'claude',
        type: 'vibe',
        targetType: null,
        messages: [],
      });

      const tsId2 = logger.tsBlockStart([], [], 'return 2', { file: 'test.vibe', line: 3 });
      const tsfId2 = logger.tsFunctionStart('func2', [], { file: 'test.vibe', line: 4 });

      expect(doId2).toBe('do-000002');
      expect(vibeId2).toBe('vibe-000002');
      expect(tsId2).toBe('ts-000002');
      expect(tsfId2).toBe('tsf-000002');
    });
  });

  describe('sequence numbers', () => {
    test('events have sequential seq numbers', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: false,
      });

      logger.start('/test/file.vibe');
      logger.aiStart('do', 'gpt-4', 'prompt', {
        model: 'gpt-4',
        type: 'do',
        targetType: null,
        messages: [],
      });
      logger.aiComplete('do-000001', 100);
      logger.complete('completed');

      const events = logger.getEvents();
      expect(events.map(e => e.seq)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('getMainLogPath and getContextDir', () => {
    test('returns correct paths', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: true,
      });

      const mainLogPath = logger.getMainLogPath();
      const contextDir = logger.getContextDir();

      expect(mainLogPath).toContain(testDir);
      expect(mainLogPath).toMatch(/run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.jsonl$/);

      expect(contextDir).toContain(testDir);
      expect(contextDir).toMatch(/run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);

      // Both should share the same timestamp
      const logTimestamp = mainLogPath.match(/run-(.+)\.jsonl/)?.[1];
      const dirTimestamp = contextDir.match(/run-(.+)$/)?.[1];
      expect(logTimestamp).toBe(dirTimestamp);
    });
  });

  describe('complete file structure', () => {
    test('creates main log file, context subdirectory, and all context files', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: true,
      });

      // Simulate a complete run with multiple operation types
      logger.start('/project/main.vibe');

      // AI calls
      const doId = logger.aiStart('do', 'gpt-4', 'Do task 1', {
        model: 'gpt-4',
        modelDetails: { name: 'gpt-4', provider: 'openai' },
        type: 'do',
        targetType: 'text',
        messages: [{ role: 'user', content: 'Do task 1' }],
      });
      logger.aiComplete(doId, 100, { inputTokens: 10, outputTokens: 20 }, 0);

      const vibeId = logger.aiStart('vibe', 'claude', 'Vibe task 1', {
        model: 'claude',
        modelDetails: { name: 'claude-3-sonnet', provider: 'anthropic' },
        type: 'vibe',
        targetType: 'json',
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'Vibe task 1' },
        ],
      });
      logger.toolStart(vibeId, 'readFile', { path: '/data.json' });
      logger.toolComplete(vibeId, 'readFile', 50, true);
      logger.aiComplete(vibeId, 200, { inputTokens: 50, outputTokens: 100 }, 1);

      // TS block
      const tsId = logger.tsBlockStart(['x'], [42], 'return x * 2;', { file: '/project/main.vibe', line: 10 });
      logger.tsBlockComplete(tsId, 5);

      // TS function
      const tsfId = logger.tsFunctionStart('processData', ['input'], { file: '/project/main.vibe', line: 15 });
      logger.tsFunctionComplete(tsfId, 10);

      logger.complete('completed');

      // Verify main log directory exists
      expect(existsSync(testDir)).toBe(true);

      // Verify main log file exists and contains all events
      const mainLogPath = logger.getMainLogPath();
      expect(existsSync(mainLogPath)).toBe(true);

      const logContent = readFileSync(mainLogPath, 'utf-8');
      const logLines = logContent.trim().split('\n');
      expect(logLines.length).toBeGreaterThanOrEqual(10); // At least: start, 2 ai_start, 2 ai_complete, tool_start, tool_complete, ts_start, ts_complete, tsf_start, tsf_complete, complete

      // Verify each line is valid JSON
      for (const line of logLines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }

      // Verify context subdirectory exists
      const contextDir = logger.getContextDir();
      expect(existsSync(contextDir)).toBe(true);

      // Verify all context files exist
      const contextFiles = readdirSync(contextDir);

      // Should have: do-000001.txt, vibe-000001.txt, ts-000001.ts
      // Note: tsf (TS function) context files are no longer written (too frequent, not useful)
      expect(contextFiles).toContain('do-000001.txt');
      expect(contextFiles).toContain('vibe-000001.txt');
      expect(contextFiles).toContain('ts-000001.ts');
      expect(contextFiles).toHaveLength(3);

      // Verify context file contents
      const doContent = readFileSync(join(contextDir, 'do-000001.txt'), 'utf-8');
      expect(doContent).toContain('AI Call: do-000001');
      expect(doContent).toContain('Model: gpt-4');
      expect(doContent).toContain('Do task 1');

      const vibeContent = readFileSync(join(contextDir, 'vibe-000001.txt'), 'utf-8');
      expect(vibeContent).toContain('AI Call: vibe-000001');
      expect(vibeContent).toContain('claude-3-sonnet');
      expect(vibeContent).toContain('System prompt');
      expect(vibeContent).toContain('Vibe task 1');

      const tsContent = readFileSync(join(contextDir, 'ts-000001.ts'), 'utf-8');
      expect(tsContent).toContain('TS Block: ts-000001');
      expect(tsContent).toContain('x = 42');
      expect(tsContent).toContain('return x * 2;');
    });

    test('directory names are linked by timestamp', () => {
      const logger = new VerboseLogger({
        logDir: testDir,
        printToConsole: false,
        writeToFile: true,
      });

      logger.start('/test.vibe');
      logger.complete('completed');

      const mainLogPath = logger.getMainLogPath();
      const contextDir = logger.getContextDir();

      // Extract timestamps from paths
      const logFilename = mainLogPath.split(/[/\\]/).pop() ?? '';
      const contextDirname = contextDir.split(/[/\\]/).pop() ?? '';

      // Log file: run-2024-01-11T15-30-00.jsonl
      // Context dir: run-2024-01-11T15-30-00
      const logTimestamp = logFilename.replace('run-', '').replace('.jsonl', '');
      const dirTimestamp = contextDirname.replace('run-', '');

      expect(logTimestamp).toBe(dirTimestamp);
      expect(logTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    });
  });
});
