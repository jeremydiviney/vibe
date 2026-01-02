import { describe, expect, test, beforeEach } from 'bun:test';
import { createToolRegistry, createToolRegistryWithBuiltins } from '../registry';
import { builtinTools } from '../builtin';
import type { RegisteredTool, ToolRegistry } from '../types';

describe('Tool Registry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  // ============================================================================
  // Basic registration and retrieval
  // ============================================================================

  test('registers and retrieves a tool', () => {
    const tool: RegisteredTool = {
      name: 'testTool',
      kind: 'user',
      schema: {
        name: 'testTool',
        description: 'A test tool',
        parameters: [{ name: 'input', type: { type: 'string' }, required: true }],
      },
      executor: async () => 'result',
    };

    registry.register(tool);
    const retrieved = registry.get('testTool');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('testTool');
    expect(retrieved?.kind).toBe('user');
  });

  test('returns undefined for non-existent tool', () => {
    expect(registry.get('nonExistent')).toBeUndefined();
  });

  test('has returns true for registered tool', () => {
    const tool: RegisteredTool = {
      name: 'existingTool',
      kind: 'user',
      schema: {
        name: 'existingTool',
        parameters: [],
      },
      executor: async () => null,
    };

    registry.register(tool);
    expect(registry.has('existingTool')).toBe(true);
    expect(registry.has('missingTool')).toBe(false);
  });

  // ============================================================================
  // Listing tools
  // ============================================================================

  test('lists all registered tools', () => {
    const tool1: RegisteredTool = {
      name: 'tool1',
      kind: 'user',
      schema: { name: 'tool1', parameters: [] },
      executor: async () => null,
    };

    const tool2: RegisteredTool = {
      name: 'tool2',
      kind: 'builtin',
      schema: { name: 'tool2', parameters: [] },
      executor: async () => null,
    };

    registry.register(tool1);
    registry.register(tool2);

    const tools = registry.list();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toContain('tool1');
    expect(tools.map((t) => t.name)).toContain('tool2');
  });

  test('getSchemas returns all tool schemas', () => {
    const tool: RegisteredTool = {
      name: 'schemaTest',
      kind: 'user',
      schema: {
        name: 'schemaTest',
        description: 'Test schema',
        parameters: [
          { name: 'param1', type: { type: 'string' }, required: true },
          { name: 'param2', type: { type: 'number' }, required: false },
        ],
      },
      executor: async () => null,
    };

    registry.register(tool);
    const schemas = registry.getSchemas();

    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('schemaTest');
    expect(schemas[0].parameters).toHaveLength(2);
  });

  // ============================================================================
  // Registry with builtins
  // ============================================================================

  test('createToolRegistryWithBuiltins includes all builtin tools', () => {
    const registryWithBuiltins = createToolRegistryWithBuiltins();
    const tools = registryWithBuiltins.list();

    // Check that we have builtin tools
    expect(tools.length).toBeGreaterThan(0);

    // Verify specific builtin tools are present
    expect(registryWithBuiltins.has('sleep')).toBe(true);
    expect(registryWithBuiltins.has('now')).toBe(true);
    expect(registryWithBuiltins.has('jsonParse')).toBe(true);
    expect(registryWithBuiltins.has('jsonStringify')).toBe(true);
    expect(registryWithBuiltins.has('env')).toBe(true);
  });

  test('builtin tools have kind "builtin"', () => {
    const registryWithBuiltins = createToolRegistryWithBuiltins();
    const sleepTool = registryWithBuiltins.get('sleep');

    expect(sleepTool?.kind).toBe('builtin');
  });

  // ============================================================================
  // Tool overwriting
  // ============================================================================

  test('registering tool with same name overwrites', () => {
    const tool1: RegisteredTool = {
      name: 'duplicateTool',
      kind: 'user',
      schema: { name: 'duplicateTool', description: 'first', parameters: [] },
      executor: async () => 'first',
    };

    const tool2: RegisteredTool = {
      name: 'duplicateTool',
      kind: 'user',
      schema: { name: 'duplicateTool', description: 'second', parameters: [] },
      executor: async () => 'second',
    };

    registry.register(tool1);
    registry.register(tool2);

    const retrieved = registry.get('duplicateTool');
    expect(retrieved?.schema.description).toBe('second');
  });
});

describe('Builtin Tools', () => {
  // ============================================================================
  // Verify builtin tool definitions
  // ============================================================================

  test('all builtin tools have required properties', () => {
    for (const tool of builtinTools) {
      expect(tool.name).toBeDefined();
      expect(tool.kind).toBe('builtin');
      expect(tool.schema).toBeDefined();
      expect(tool.executor).toBeInstanceOf(Function);
    }
  });

  test('builtin tools have proper schemas', () => {
    const fetchTool = builtinTools.find((t) => t.name === 'fetch');
    expect(fetchTool).toBeDefined();
    expect(fetchTool?.schema.name).toBe('fetch');
    expect(fetchTool?.schema.description).toBeDefined();
    expect(fetchTool?.schema.parameters.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // Builtin tool execution
  // ============================================================================

  test('sleep tool waits specified time', async () => {
    const sleepTool = builtinTools.find((t) => t.name === 'sleep');
    expect(sleepTool).toBeDefined();

    const start = Date.now();
    await sleepTool!.executor({ ms: 50 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some tolerance
  });

  test('now tool returns current timestamp', async () => {
    const nowTool = builtinTools.find((t) => t.name === 'now');
    expect(nowTool).toBeDefined();

    const before = Date.now();
    const result = await nowTool!.executor({});
    const after = Date.now();

    expect(typeof result).toBe('number');
    expect(result as number).toBeGreaterThanOrEqual(before);
    expect(result as number).toBeLessThanOrEqual(after);
  });

  test('jsonParse tool parses JSON string', async () => {
    const jsonParseTool = builtinTools.find((t) => t.name === 'jsonParse');
    expect(jsonParseTool).toBeDefined();

    const result = await jsonParseTool!.executor({ text: '{"name":"test","value":42}' });
    expect(result).toEqual({ name: 'test', value: 42 });
  });

  test('jsonStringify tool converts to JSON string', async () => {
    const jsonStringifyTool = builtinTools.find((t) => t.name === 'jsonStringify');
    expect(jsonStringifyTool).toBeDefined();

    const result = await jsonStringifyTool!.executor({ value: { name: 'test', value: 42 } });
    expect(result).toBe('{"name":"test","value":42}');
  });

  test('env tool returns environment variable', async () => {
    const envTool = builtinTools.find((t) => t.name === 'env');
    expect(envTool).toBeDefined();

    // Set a test env var
    process.env.TEST_VAR = 'test_value';
    const result = await envTool!.executor({ name: 'TEST_VAR' });
    expect(result).toBe('test_value');

    // Cleanup
    delete process.env.TEST_VAR;
  });

  test('env tool returns empty string for missing variable without default', async () => {
    const envTool = builtinTools.find((t) => t.name === 'env');
    expect(envTool).toBeDefined();

    const result = await envTool!.executor({ name: 'NONEXISTENT_VAR_12345' });
    expect(result).toBe('');
  });

  test('env tool returns default value for missing variable', async () => {
    const envTool = builtinTools.find((t) => t.name === 'env');
    expect(envTool).toBeDefined();

    const result = await envTool!.executor({ name: 'NONEXISTENT_VAR_12345', defaultValue: 'fallback' });
    expect(result).toBe('fallback');
  });
});
