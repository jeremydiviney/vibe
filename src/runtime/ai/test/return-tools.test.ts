import { describe, it, expect } from 'bun:test';
import {
  getReturnTools,
  isReturnToolCall,
  shouldUseReturnTool,
  collectAndValidateFieldResults,
  buildReturnInstruction,
  isFieldReturnResult,
  RETURN_FIELD_TOOL,
} from '../return-tools';
import { executeWithTools } from '../tool-loop';
import type { AIRequest, AIResponse } from '../types';

const TEST_ROOT_DIR = process.cwd();

describe('return-tools', () => {
  describe('isReturnToolCall', () => {
    it('should return true for return field tool', () => {
      expect(isReturnToolCall(RETURN_FIELD_TOOL)).toBe(true);
    });

    it('should return false for other tools', () => {
      expect(isReturnToolCall('getWeather')).toBe(false);
      expect(isReturnToolCall('calculator')).toBe(false);
    });
  });

  describe('shouldUseReturnTool', () => {
    it('should return true for number type', () => {
      expect(shouldUseReturnTool('number')).toBe(true);
    });

    it('should return true for boolean type', () => {
      expect(shouldUseReturnTool('boolean')).toBe(true);
    });

    it('should return true for number[] type', () => {
      expect(shouldUseReturnTool('number[]')).toBe(true);
    });

    it('should return true for boolean[] type', () => {
      expect(shouldUseReturnTool('boolean[]')).toBe(true);
    });

    it('should return true for text[] type', () => {
      expect(shouldUseReturnTool('text[]')).toBe(true);
    });

    it('should return true for json type', () => {
      expect(shouldUseReturnTool('json')).toBe(true);
    });

    it('should return true for json[] type', () => {
      expect(shouldUseReturnTool('json[]')).toBe(true);
    });

    it('should return false for text type', () => {
      expect(shouldUseReturnTool('text')).toBe(false);
    });

    it('should return false for null type', () => {
      expect(shouldUseReturnTool(null)).toBe(false);
    });
  });

  describe('getReturnTools', () => {
    it('should return array with single return field tool', () => {
      const tools = getReturnTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe(RETURN_FIELD_TOOL);
    });

    it('should return tool with valid schema', () => {
      const tools = getReturnTools();
      const tool = tools[0];

      expect(tool.__vibeTool).toBe(true);
      expect(tool.schema.name).toBe(RETURN_FIELD_TOOL);
      expect(tool.schema.parameters).toHaveLength(2);
      expect(tool.schema.parameters[0].name).toBe('field');
      expect(tool.schema.parameters[0].required).toBe(true);
      expect(tool.schema.parameters[1].name).toBe('value');
      expect(tool.schema.parameters[1].required).toBe(true);
    });
  });

  describe('return field tool executor', () => {
    it('should return field return result object', async () => {
      const tools = getReturnTools();
      const fieldTool = tools[0];

      const result = await fieldTool.executor({ field: 'value', value: 42 });
      expect(result).toEqual({ __fieldReturn: true, field: 'value', value: 42 });
    });

    it('should pass through any value type', async () => {
      const tools = getReturnTools();
      const fieldTool = tools[0];

      // Numbers
      const num = await fieldTool.executor({ field: 'n', value: 123 });
      expect(num).toEqual({ __fieldReturn: true, field: 'n', value: 123 });

      // Strings
      const str = await fieldTool.executor({ field: 's', value: 'hello' });
      expect(str).toEqual({ __fieldReturn: true, field: 's', value: 'hello' });

      // Booleans
      const bool = await fieldTool.executor({ field: 'b', value: true });
      expect(bool).toEqual({ __fieldReturn: true, field: 'b', value: true });

      // Arrays
      const arr = await fieldTool.executor({ field: 'a', value: [1, 2, 3] });
      expect(arr).toEqual({ __fieldReturn: true, field: 'a', value: [1, 2, 3] });

      // Objects
      const obj = await fieldTool.executor({ field: 'o', value: { name: 'Alice' } });
      expect(obj).toEqual({ __fieldReturn: true, field: 'o', value: { name: 'Alice' } });
    });
  });

  describe('isFieldReturnResult', () => {
    it('should return true for valid field return result', () => {
      expect(isFieldReturnResult({ __fieldReturn: true, field: 'value', value: 42 })).toBe(true);
    });

    it('should return false for non-objects', () => {
      expect(isFieldReturnResult(null)).toBe(false);
      expect(isFieldReturnResult(undefined)).toBe(false);
      expect(isFieldReturnResult(42)).toBe(false);
      expect(isFieldReturnResult('string')).toBe(false);
    });

    it('should return false for objects without __fieldReturn', () => {
      expect(isFieldReturnResult({ field: 'value', value: 42 })).toBe(false);
      expect(isFieldReturnResult({ __fieldReturn: false, field: 'value', value: 42 })).toBe(false);
    });
  });

  describe('collectAndValidateFieldResults', () => {
    describe('single field validation', () => {
      it('should validate number field', () => {
        const results = [{ __fieldReturn: true as const, field: 'value', value: 42 }];
        const expected = [{ name: 'value', type: 'number' }];

        const collected = collectAndValidateFieldResults(results, expected);
        expect(collected).toEqual({ value: 42 });
      });

      it('should validate boolean field', () => {
        const results = [{ __fieldReturn: true as const, field: 'value', value: true }];
        const expected = [{ name: 'value', type: 'boolean' }];

        const collected = collectAndValidateFieldResults(results, expected);
        expect(collected).toEqual({ value: true });
      });

      it('should validate text field', () => {
        const results = [{ __fieldReturn: true as const, field: 'value', value: 'hello' }];
        const expected = [{ name: 'value', type: 'text' }];

        const collected = collectAndValidateFieldResults(results, expected);
        expect(collected).toEqual({ value: 'hello' });
      });

      it('should validate json field', () => {
        const results = [{ __fieldReturn: true as const, field: 'value', value: { name: 'Alice' } }];
        const expected = [{ name: 'value', type: 'json' }];

        const collected = collectAndValidateFieldResults(results, expected);
        expect(collected).toEqual({ value: { name: 'Alice' } });
      });

      it('should throw for wrong number type', () => {
        const results = [{ __fieldReturn: true as const, field: 'value', value: 'not a number' }];
        const expected = [{ name: 'value', type: 'number' }];

        expect(() => collectAndValidateFieldResults(results, expected)).toThrow(/expected number/);
      });

      it('should throw for wrong boolean type', () => {
        const results = [{ __fieldReturn: true as const, field: 'value', value: 'yes' }];
        const expected = [{ name: 'value', type: 'boolean' }];

        expect(() => collectAndValidateFieldResults(results, expected)).toThrow(/expected boolean/);
      });

      it('should throw for NaN as number', () => {
        const results = [{ __fieldReturn: true as const, field: 'value', value: NaN }];
        const expected = [{ name: 'value', type: 'number' }];

        expect(() => collectAndValidateFieldResults(results, expected)).toThrow(/expected number/);
      });
    });

    describe('array type validation', () => {
      it('should validate number[] field', () => {
        const results = [{ __fieldReturn: true as const, field: 'nums', value: [1, 2, 3] }];
        const expected = [{ name: 'nums', type: 'number[]' }];

        const collected = collectAndValidateFieldResults(results, expected);
        expect(collected).toEqual({ nums: [1, 2, 3] });
      });

      it('should validate text[] field', () => {
        const results = [{ __fieldReturn: true as const, field: 'items', value: ['a', 'b', 'c'] }];
        const expected = [{ name: 'items', type: 'text[]' }];

        const collected = collectAndValidateFieldResults(results, expected);
        expect(collected).toEqual({ items: ['a', 'b', 'c'] });
      });

      it('should validate boolean[] field', () => {
        const results = [{ __fieldReturn: true as const, field: 'flags', value: [true, false, true] }];
        const expected = [{ name: 'flags', type: 'boolean[]' }];

        const collected = collectAndValidateFieldResults(results, expected);
        expect(collected).toEqual({ flags: [true, false, true] });
      });

      it('should validate json[] field', () => {
        const results = [{ __fieldReturn: true as const, field: 'objects', value: [{ a: 1 }, { b: 2 }] }];
        const expected = [{ name: 'objects', type: 'json[]' }];

        const collected = collectAndValidateFieldResults(results, expected);
        expect(collected).toEqual({ objects: [{ a: 1 }, { b: 2 }] });
      });

      it('should throw for non-array when expecting array', () => {
        const results = [{ __fieldReturn: true as const, field: 'nums', value: 42 }];
        const expected = [{ name: 'nums', type: 'number[]' }];

        expect(() => collectAndValidateFieldResults(results, expected)).toThrow(/expected number\[\]/);
      });

      it('should throw for array with wrong element types', () => {
        const results = [{ __fieldReturn: true as const, field: 'nums', value: [1, 'two', 3] }];
        const expected = [{ name: 'nums', type: 'number[]' }];

        expect(() => collectAndValidateFieldResults(results, expected)).toThrow(/element 1/);
      });
    });

    describe('multi-field validation', () => {
      it('should validate multiple fields', () => {
        const results = [
          { __fieldReturn: true as const, field: 'name', value: 'Alice' },
          { __fieldReturn: true as const, field: 'age', value: 30 },
        ];
        const expected = [
          { name: 'name', type: 'text' },
          { name: 'age', type: 'number' },
        ];

        const collected = collectAndValidateFieldResults(results, expected);
        expect(collected).toEqual({ name: 'Alice', age: 30 });
      });

      it('should throw for missing field', () => {
        const results = [{ __fieldReturn: true as const, field: 'name', value: 'Alice' }];
        const expected = [
          { name: 'name', type: 'text' },
          { name: 'age', type: 'number' },
        ];

        expect(() => collectAndValidateFieldResults(results, expected)).toThrow(/Missing field 'age'/);
      });

      it('should throw for unexpected field', () => {
        const results = [
          { __fieldReturn: true as const, field: 'name', value: 'Alice' },
          { __fieldReturn: true as const, field: 'extra', value: 'unexpected' },
        ];
        const expected = [{ name: 'name', type: 'text' }];

        expect(() => collectAndValidateFieldResults(results, expected)).toThrow(/Unexpected field 'extra'/);
      });
    });
  });

  describe('buildReturnInstruction', () => {
    it('should return empty string for no fields', () => {
      expect(buildReturnInstruction([])).toBe('');
    });

    it('should build instruction for single field', () => {
      const instruction = buildReturnInstruction([{ name: 'value', type: 'number' }]);
      expect(instruction).toContain('__vibe_return_field');
      expect(instruction).toContain('"value" (number)');
    });

    it('should build instruction for multiple fields', () => {
      const instruction = buildReturnInstruction([
        { name: 'name', type: 'text' },
        { name: 'age', type: 'number' },
      ]);
      expect(instruction).toContain('"name" (text)');
      expect(instruction).toContain('"age" (number)');
    });
  });
});

describe('executeWithTools with return tools', () => {
  it('should extract value when return tool called successfully', async () => {
    const tools = getReturnTools();

    const request: AIRequest = {
      operationType: 'do',
      prompt: 'Return 42',
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    // AI calls return tool with correct value
    const executeProvider = async (): Promise<AIResponse> => ({
      content: '',
      parsedValue: '',
      toolCalls: [{ id: 'call_1', toolName: RETURN_FIELD_TOOL, args: { field: 'value', value: 42 } }],
      stopReason: 'tool_use',
    });

    const { returnFieldResults, completedViaReturnTool, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { expectedReturnTool: RETURN_FIELD_TOOL }
    );

    expect(completedViaReturnTool).toBe(true);
    expect(returnFieldResults).toHaveLength(1);
    expect(returnFieldResults![0]).toEqual({ __fieldReturn: true, field: 'value', value: 42 });
    expect(rounds).toHaveLength(1);
  });

  it('should collect multiple field results', async () => {
    const tools = getReturnTools();

    const request: AIRequest = {
      operationType: 'do',
      prompt: 'Return name and age',
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    // AI calls return tool twice in one response
    const executeProvider = async (): Promise<AIResponse> => ({
      content: '',
      parsedValue: '',
      toolCalls: [
        { id: 'call_1', toolName: RETURN_FIELD_TOOL, args: { field: 'name', value: 'Alice' } },
        { id: 'call_2', toolName: RETURN_FIELD_TOOL, args: { field: 'age', value: 30 } },
      ],
      stopReason: 'tool_use',
    });

    const { returnFieldResults, completedViaReturnTool } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { expectedReturnTool: RETURN_FIELD_TOOL }
    );

    expect(completedViaReturnTool).toBe(true);
    expect(returnFieldResults).toHaveLength(2);
    expect(returnFieldResults![0]).toEqual({ __fieldReturn: true, field: 'name', value: 'Alice' });
    expect(returnFieldResults![1]).toEqual({ __fieldReturn: true, field: 'age', value: 30 });
  });

  it('should retry when AI responds with text instead of tool call', async () => {
    const tools = getReturnTools();

    const request: AIRequest = {
      operationType: 'do',
      prompt: 'Return 42',
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    let callCount = 0;
    const executeProvider = async (): Promise<AIResponse> => {
      callCount++;
      if (callCount === 1) {
        // First call: AI responds with text (wrong)
        return {
          content: 'The answer is 42',
          parsedValue: 'The answer is 42',
          stopReason: 'end',
        };
      }
      // Second call: AI calls return tool correctly
      return {
        content: '',
        parsedValue: '',
        toolCalls: [{ id: 'call_1', toolName: RETURN_FIELD_TOOL, args: { field: 'value', value: 42 } }],
        stopReason: 'tool_use',
      };
    };

    const { returnFieldResults, completedViaReturnTool, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { expectedReturnTool: RETURN_FIELD_TOOL, maxRounds: 3 }
    );

    expect(callCount).toBe(2);
    expect(completedViaReturnTool).toBe(true);
    expect(returnFieldResults).toHaveLength(1);
    // First round has synthesized error, second round has successful tool call
    expect(rounds).toHaveLength(2);
    expect(rounds[0].results[0].error).toContain('must call');
  });

  it('should not complete via return tool when not expected', async () => {
    const tools = getReturnTools();

    const request: AIRequest = {
      operationType: 'do',
      prompt: 'Hello',
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    // No expectedReturnTool, so text response is fine
    const executeProvider = async (): Promise<AIResponse> => ({
      content: 'Hello back!',
      parsedValue: 'Hello back!',
      stopReason: 'end',
    });

    const { returnFieldResults, completedViaReturnTool, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider
      // No expectedReturnTool
    );

    expect(completedViaReturnTool).toBe(false);
    expect(returnFieldResults).toBeUndefined();
    expect(rounds).toHaveLength(0);
  });
});
