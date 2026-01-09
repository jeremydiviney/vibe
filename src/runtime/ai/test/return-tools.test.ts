import { describe, it, expect } from 'bun:test';
import {
  getReturnTools,
  getReturnToolName,
  isReturnToolCall,
  shouldUseReturnTool,
  RETURN_NUMBER_TOOL,
  RETURN_BOOLEAN_TOOL,
  RETURN_NUMBER_ARRAY_TOOL,
  RETURN_BOOLEAN_ARRAY_TOOL,
  RETURN_TEXT_ARRAY_TOOL,
  RETURN_JSON_TOOL,
  RETURN_JSON_ARRAY_TOOL,
} from '../return-tools';
import { executeWithTools } from '../tool-loop';
import type { AIRequest, AIResponse } from '../types';
import type { VibeToolValue } from '../../tools/types';

const TEST_ROOT_DIR = process.cwd();

describe('return-tools', () => {
  describe('getReturnToolName', () => {
    it('should return number tool name for number type', () => {
      expect(getReturnToolName('number')).toBe(RETURN_NUMBER_TOOL);
    });

    it('should return boolean tool name for boolean type', () => {
      expect(getReturnToolName('boolean')).toBe(RETURN_BOOLEAN_TOOL);
    });

    it('should return null for text type', () => {
      expect(getReturnToolName('text')).toBeNull();
    });

    it('should return number array tool name for number[] type', () => {
      expect(getReturnToolName('number[]')).toBe(RETURN_NUMBER_ARRAY_TOOL);
    });

    it('should return boolean array tool name for boolean[] type', () => {
      expect(getReturnToolName('boolean[]')).toBe(RETURN_BOOLEAN_ARRAY_TOOL);
    });

    it('should return text array tool name for text[] type', () => {
      expect(getReturnToolName('text[]')).toBe(RETURN_TEXT_ARRAY_TOOL);
    });

    it('should return json tool name for json type', () => {
      expect(getReturnToolName('json')).toBe(RETURN_JSON_TOOL);
    });

    it('should return json array tool name for json[] type', () => {
      expect(getReturnToolName('json[]')).toBe(RETURN_JSON_ARRAY_TOOL);
    });

    it('should return null for null type', () => {
      expect(getReturnToolName(null)).toBeNull();
    });
  });

  describe('isReturnToolCall', () => {
    it('should return true for number return tool', () => {
      expect(isReturnToolCall(RETURN_NUMBER_TOOL)).toBe(true);
    });

    it('should return true for boolean return tool', () => {
      expect(isReturnToolCall(RETURN_BOOLEAN_TOOL)).toBe(true);
    });

    it('should return true for number array return tool', () => {
      expect(isReturnToolCall(RETURN_NUMBER_ARRAY_TOOL)).toBe(true);
    });

    it('should return true for boolean array return tool', () => {
      expect(isReturnToolCall(RETURN_BOOLEAN_ARRAY_TOOL)).toBe(true);
    });

    it('should return true for text array return tool', () => {
      expect(isReturnToolCall(RETURN_TEXT_ARRAY_TOOL)).toBe(true);
    });

    it('should return true for json return tool', () => {
      expect(isReturnToolCall(RETURN_JSON_TOOL)).toBe(true);
    });

    it('should return true for json array return tool', () => {
      expect(isReturnToolCall(RETURN_JSON_ARRAY_TOOL)).toBe(true);
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
    it('should return array with all return tools', () => {
      const tools = getReturnTools();
      expect(tools).toHaveLength(7);

      const names = tools.map((t) => t.name);
      expect(names).toContain(RETURN_NUMBER_TOOL);
      expect(names).toContain(RETURN_BOOLEAN_TOOL);
      expect(names).toContain(RETURN_NUMBER_ARRAY_TOOL);
      expect(names).toContain(RETURN_BOOLEAN_ARRAY_TOOL);
      expect(names).toContain(RETURN_TEXT_ARRAY_TOOL);
      expect(names).toContain(RETURN_JSON_TOOL);
      expect(names).toContain(RETURN_JSON_ARRAY_TOOL);
    });

    it('should return tools with valid schemas', () => {
      const tools = getReturnTools();

      for (const tool of tools) {
        expect(tool.__vibeTool).toBe(true);
        expect(tool.schema.name).toBe(tool.name);
        expect(tool.schema.parameters).toHaveLength(1);
        expect(tool.schema.parameters[0].name).toBe('value');
        expect(tool.schema.parameters[0].required).toBe(true);
      }
    });
  });

  describe('return number tool executor', () => {
    it('should return valid number', async () => {
      const tools = getReturnTools();
      const numberTool = tools.find((t) => t.name === RETURN_NUMBER_TOOL)!;

      const result = await numberTool.executor({ value: 42 });
      expect(result).toBe(42);
    });

    it('should return zero', async () => {
      const tools = getReturnTools();
      const numberTool = tools.find((t) => t.name === RETURN_NUMBER_TOOL)!;

      const result = await numberTool.executor({ value: 0 });
      expect(result).toBe(0);
    });

    it('should return negative number', async () => {
      const tools = getReturnTools();
      const numberTool = tools.find((t) => t.name === RETURN_NUMBER_TOOL)!;

      const result = await numberTool.executor({ value: -123.45 });
      expect(result).toBe(-123.45);
    });

    it('should throw for string value', async () => {
      const tools = getReturnTools();
      const numberTool = tools.find((t) => t.name === RETURN_NUMBER_TOOL)!;

      await expect(numberTool.executor({ value: 'not a number' })).rejects.toThrow(
        /Expected a number/
      );
    });

    it('should throw for boolean value', async () => {
      const tools = getReturnTools();
      const numberTool = tools.find((t) => t.name === RETURN_NUMBER_TOOL)!;

      await expect(numberTool.executor({ value: true })).rejects.toThrow(/Expected a number/);
    });

    it('should throw for NaN', async () => {
      const tools = getReturnTools();
      const numberTool = tools.find((t) => t.name === RETURN_NUMBER_TOOL)!;

      await expect(numberTool.executor({ value: NaN })).rejects.toThrow(/Expected a number/);
    });

    it('should throw for Infinity', async () => {
      const tools = getReturnTools();
      const numberTool = tools.find((t) => t.name === RETURN_NUMBER_TOOL)!;

      await expect(numberTool.executor({ value: Infinity })).rejects.toThrow(/Expected a number/);
    });
  });

  describe('return boolean tool executor', () => {
    it('should return true', async () => {
      const tools = getReturnTools();
      const boolTool = tools.find((t) => t.name === RETURN_BOOLEAN_TOOL)!;

      const result = await boolTool.executor({ value: true });
      expect(result).toBe(true);
    });

    it('should return false', async () => {
      const tools = getReturnTools();
      const boolTool = tools.find((t) => t.name === RETURN_BOOLEAN_TOOL)!;

      const result = await boolTool.executor({ value: false });
      expect(result).toBe(false);
    });

    it('should throw for string value', async () => {
      const tools = getReturnTools();
      const boolTool = tools.find((t) => t.name === RETURN_BOOLEAN_TOOL)!;

      await expect(boolTool.executor({ value: 'true' })).rejects.toThrow(/Expected a boolean/);
    });

    it('should throw for number value', async () => {
      const tools = getReturnTools();
      const boolTool = tools.find((t) => t.name === RETURN_BOOLEAN_TOOL)!;

      await expect(boolTool.executor({ value: 1 })).rejects.toThrow(/Expected a boolean/);
    });

    it('should throw for null value', async () => {
      const tools = getReturnTools();
      const boolTool = tools.find((t) => t.name === RETURN_BOOLEAN_TOOL)!;

      await expect(boolTool.executor({ value: null })).rejects.toThrow(/Expected a boolean/);
    });
  });

  describe('return number array tool executor', () => {
    it('should return valid number array', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_NUMBER_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [1, 2, 3] });
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return empty array', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_NUMBER_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [] });
      expect(result).toEqual([]);
    });

    it('should return array with negative and decimal numbers', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_NUMBER_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [-1, 0, 3.14, -2.5] });
      expect(result).toEqual([-1, 0, 3.14, -2.5]);
    });

    it('should throw for non-array value', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_NUMBER_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: 42 })).rejects.toThrow(/Expected an array/);
    });

    it('should throw for string value', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_NUMBER_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: '[1,2,3]' })).rejects.toThrow(/Expected an array/);
    });

    it('should throw for array with non-number element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_NUMBER_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: [1, 'two', 3] })).rejects.toThrow(
        /Expected number at index 1/
      );
    });

    it('should throw for array with NaN', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_NUMBER_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: [1, NaN, 3] })).rejects.toThrow(
        /Expected number at index 1/
      );
    });

    it('should throw for array with Infinity', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_NUMBER_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: [1, Infinity, 3] })).rejects.toThrow(
        /Expected number at index 1/
      );
    });
  });

  describe('return boolean array tool executor', () => {
    it('should return valid boolean array', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_BOOLEAN_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [true, false, true] });
      expect(result).toEqual([true, false, true]);
    });

    it('should return empty array', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_BOOLEAN_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [] });
      expect(result).toEqual([]);
    });

    it('should return array with all true', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_BOOLEAN_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [true, true, true] });
      expect(result).toEqual([true, true, true]);
    });

    it('should return array with all false', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_BOOLEAN_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [false, false, false] });
      expect(result).toEqual([false, false, false]);
    });

    it('should throw for non-array value', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_BOOLEAN_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: true })).rejects.toThrow(/Expected an array/);
    });

    it('should throw for string value', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_BOOLEAN_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: '[true,false]' })).rejects.toThrow(
        /Expected an array/
      );
    });

    it('should throw for array with non-boolean element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_BOOLEAN_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: [true, 'yes', false] })).rejects.toThrow(
        /Expected boolean at index 1/
      );
    });

    it('should throw for array with number element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_BOOLEAN_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: [true, 1, false] })).rejects.toThrow(
        /Expected boolean at index 1/
      );
    });

    it('should throw for array with null element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_BOOLEAN_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: [true, null, false] })).rejects.toThrow(
        /Expected boolean at index 1/
      );
    });
  });

  describe('return text array tool executor', () => {
    it('should return valid text array', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_TEXT_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: ['hello', 'world', 'test'] });
      expect(result).toEqual(['hello', 'world', 'test']);
    });

    it('should return empty array', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_TEXT_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [] });
      expect(result).toEqual([]);
    });

    it('should return array with empty strings', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_TEXT_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: ['', 'a', ''] });
      expect(result).toEqual(['', 'a', '']);
    });

    it('should return array with unicode strings', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_TEXT_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: ['hello', 'мир', '世界'] });
      expect(result).toEqual(['hello', 'мир', '世界']);
    });

    it('should throw for non-array value', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_TEXT_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: 'hello' })).rejects.toThrow(/Expected an array/);
    });

    it('should throw for number value', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_TEXT_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: 123 })).rejects.toThrow(/Expected an array/);
    });

    it('should throw for array with non-string element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_TEXT_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: ['hello', 123, 'world'] })).rejects.toThrow(
        /Expected string at index 1/
      );
    });

    it('should throw for array with boolean element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_TEXT_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: ['hello', true, 'world'] })).rejects.toThrow(
        /Expected string at index 1/
      );
    });

    it('should throw for array with null element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_TEXT_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: ['hello', null, 'world'] })).rejects.toThrow(
        /Expected string at index 1/
      );
    });

    it('should throw for array with object element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_TEXT_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: ['hello', { text: 'hi' }, 'world'] })).rejects.toThrow(
        /Expected string at index 1/
      );
    });
  });

  describe('return json tool executor', () => {
    it('should return valid object', async () => {
      const tools = getReturnTools();
      const jsonTool = tools.find((t) => t.name === RETURN_JSON_TOOL)!;

      const result = await jsonTool.executor({ value: { name: 'Alice', age: 30 } });
      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('should return valid array', async () => {
      const tools = getReturnTools();
      const jsonTool = tools.find((t) => t.name === RETURN_JSON_TOOL)!;

      const result = await jsonTool.executor({ value: [1, 2, 3] });
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return empty object', async () => {
      const tools = getReturnTools();
      const jsonTool = tools.find((t) => t.name === RETURN_JSON_TOOL)!;

      const result = await jsonTool.executor({ value: {} });
      expect(result).toEqual({});
    });

    it('should return empty array', async () => {
      const tools = getReturnTools();
      const jsonTool = tools.find((t) => t.name === RETURN_JSON_TOOL)!;

      const result = await jsonTool.executor({ value: [] });
      expect(result).toEqual([]);
    });

    it('should return nested object', async () => {
      const tools = getReturnTools();
      const jsonTool = tools.find((t) => t.name === RETURN_JSON_TOOL)!;

      const nested = { user: { name: 'Bob', tags: ['a', 'b'] }, active: true };
      const result = await jsonTool.executor({ value: nested });
      expect(result).toEqual(nested);
    });

    it('should throw for null value', async () => {
      const tools = getReturnTools();
      const jsonTool = tools.find((t) => t.name === RETURN_JSON_TOOL)!;

      await expect(jsonTool.executor({ value: null })).rejects.toThrow(/Expected a JSON object or array/);
    });

    it('should throw for string value', async () => {
      const tools = getReturnTools();
      const jsonTool = tools.find((t) => t.name === RETURN_JSON_TOOL)!;

      await expect(jsonTool.executor({ value: 'hello' })).rejects.toThrow(/Expected a JSON object or array/);
    });

    it('should throw for number value', async () => {
      const tools = getReturnTools();
      const jsonTool = tools.find((t) => t.name === RETURN_JSON_TOOL)!;

      await expect(jsonTool.executor({ value: 42 })).rejects.toThrow(/Expected a JSON object or array/);
    });

    it('should throw for boolean value', async () => {
      const tools = getReturnTools();
      const jsonTool = tools.find((t) => t.name === RETURN_JSON_TOOL)!;

      await expect(jsonTool.executor({ value: true })).rejects.toThrow(/Expected a JSON object or array/);
    });

    it('should throw for undefined value', async () => {
      const tools = getReturnTools();
      const jsonTool = tools.find((t) => t.name === RETURN_JSON_TOOL)!;

      await expect(jsonTool.executor({ value: undefined })).rejects.toThrow(/Expected a JSON value, got undefined/);
    });
  });

  describe('return json array tool executor', () => {
    it('should return valid array of objects', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_JSON_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [{ name: 'Alice' }, { name: 'Bob' }] });
      expect(result).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
    });

    it('should return empty array', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_JSON_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [] });
      expect(result).toEqual([]);
    });

    it('should return array with nested objects', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_JSON_ARRAY_TOOL)!;

      const nested = [{ user: { name: 'Alice', tags: ['a'] } }, { user: { name: 'Bob', tags: ['b'] } }];
      const result = await arrayTool.executor({ value: nested });
      expect(result).toEqual(nested);
    });

    it('should return array with empty objects', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_JSON_ARRAY_TOOL)!;

      const result = await arrayTool.executor({ value: [{}, {}, {}] });
      expect(result).toEqual([{}, {}, {}]);
    });

    it('should throw for non-array value', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_JSON_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: { name: 'Alice' } })).rejects.toThrow(
        /Expected an array of JSON objects/
      );
    });

    it('should throw for string value', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_JSON_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: 'hello' })).rejects.toThrow(
        /Expected an array of JSON objects/
      );
    });

    it('should throw for array with null element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_JSON_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: [{ name: 'Alice' }, null, { name: 'Bob' }] })).rejects.toThrow(
        /Expected object at index 1/
      );
    });

    it('should throw for array with string element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_JSON_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: [{ name: 'Alice' }, 'not an object', { name: 'Bob' }] })).rejects.toThrow(
        /Expected object at index 1/
      );
    });

    it('should throw for array with number element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_JSON_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: [{ name: 'Alice' }, 42, { name: 'Bob' }] })).rejects.toThrow(
        /Expected object at index 1/
      );
    });

    it('should throw for array with boolean element', async () => {
      const tools = getReturnTools();
      const arrayTool = tools.find((t) => t.name === RETURN_JSON_ARRAY_TOOL)!;

      await expect(arrayTool.executor({ value: [{ name: 'Alice' }, true, { name: 'Bob' }] })).rejects.toThrow(
        /Expected object at index 1/
      );
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
      toolCalls: [{ id: 'call_1', toolName: RETURN_NUMBER_TOOL, args: { value: 42 } }],
      stopReason: 'tool_use',
    });

    const { returnValue, completedViaReturnTool, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { expectedReturnTool: RETURN_NUMBER_TOOL }
    );

    expect(completedViaReturnTool).toBe(true);
    expect(returnValue).toBe(42);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].results[0].result).toBe(42);
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
        toolCalls: [{ id: 'call_1', toolName: RETURN_NUMBER_TOOL, args: { value: 42 } }],
        stopReason: 'tool_use',
      };
    };

    const { returnValue, completedViaReturnTool, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { expectedReturnTool: RETURN_NUMBER_TOOL, maxRounds: 3 }
    );

    expect(callCount).toBe(2);
    expect(completedViaReturnTool).toBe(true);
    expect(returnValue).toBe(42);
    // First round has synthesized error, second round has successful tool call
    expect(rounds).toHaveLength(2);
    expect(rounds[0].results[0].error).toContain('must call');
  });

  it('should retry when return tool validation fails', async () => {
    const tools = getReturnTools();

    const request: AIRequest = {
      operationType: 'do',
      prompt: 'Return a number',
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    let callCount = 0;
    const executeProvider = async (): Promise<AIResponse> => {
      callCount++;
      if (callCount === 1) {
        // First call: AI passes string instead of number
        return {
          content: '',
          parsedValue: '',
          toolCalls: [{ id: 'call_1', toolName: RETURN_NUMBER_TOOL, args: { value: 'forty-two' } }],
          stopReason: 'tool_use',
        };
      }
      // Second call: AI corrects and passes number
      return {
        content: '',
        parsedValue: '',
        toolCalls: [{ id: 'call_2', toolName: RETURN_NUMBER_TOOL, args: { value: 42 } }],
        stopReason: 'tool_use',
      };
    };

    const { returnValue, completedViaReturnTool, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { expectedReturnTool: RETURN_NUMBER_TOOL, maxRounds: 3 }
    );

    expect(callCount).toBe(2);
    expect(completedViaReturnTool).toBe(true);
    expect(returnValue).toBe(42);
    // First round has validation error, second round succeeds
    expect(rounds).toHaveLength(2);
    expect(rounds[0].results[0].error).toContain('Expected a number');
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

    const { returnValue, completedViaReturnTool, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider
      // No expectedReturnTool
    );

    expect(completedViaReturnTool).toBe(false);
    expect(returnValue).toBeUndefined();
    expect(rounds).toHaveLength(0);
  });
});
