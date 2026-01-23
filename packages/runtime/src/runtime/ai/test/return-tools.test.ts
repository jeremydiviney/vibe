import { describe, it, expect } from 'bun:test';
import {
  getReturnTools,
  isReturnToolCall,
  shouldUseReturnTool,
  collectAndValidateFieldResults,
  buildReturnInstruction,
  isFieldReturnResult,
  RETURN_TOOL_PREFIX,
  getReturnToolName,
} from '../return-tools';
import { executeWithTools } from '../tool-loop';
import type { AIRequest, AIResponse } from '../types';

const TEST_ROOT_DIR = process.cwd();

describe('return-tools', () => {
  describe('isReturnToolCall', () => {
    it('should return true for type-specific return tools', () => {
      expect(isReturnToolCall('__vibe_return_text')).toBe(true);
      expect(isReturnToolCall('__vibe_return_number')).toBe(true);
      expect(isReturnToolCall('__vibe_return_boolean')).toBe(true);
      expect(isReturnToolCall('__vibe_return_json')).toBe(true);
      expect(isReturnToolCall('__vibe_return_text_array')).toBe(true);
      expect(isReturnToolCall('__vibe_return_number_array')).toBe(true);
      expect(isReturnToolCall('__vibe_return_boolean_array')).toBe(true);
      expect(isReturnToolCall('__vibe_return_json_array')).toBe(true);
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

    it('should return true for text type', () => {
      expect(shouldUseReturnTool('text')).toBe(true);
    });

    it('should return false for null type', () => {
      expect(shouldUseReturnTool(null)).toBe(false);
    });
  });

  describe('getReturnTools', () => {
    it('should return array with 8 type-specific return tools', () => {
      const tools = getReturnTools();
      expect(tools).toHaveLength(8);
      expect(tools.map(t => t.name)).toEqual([
        '__vibe_return_text',
        '__vibe_return_number',
        '__vibe_return_boolean',
        '__vibe_return_json',
        '__vibe_return_text_array',
        '__vibe_return_number_array',
        '__vibe_return_boolean_array',
        '__vibe_return_json_array',
      ]);
    });

    it('should return tools with valid schemas', () => {
      const tools = getReturnTools();

      for (const tool of tools) {
        expect(tool.__vibeTool).toBe(true);
        expect(tool.schema.name).toBe(tool.name);
        expect(tool.schema.parameters).toHaveLength(2);
        expect(tool.schema.parameters[0].name).toBe('field');
        expect(tool.schema.parameters[0].required).toBe(true);
        expect(tool.schema.parameters[1].name).toBe('value');
        expect(tool.schema.parameters[1].required).toBe(true);
      }
    });

    it('should have correct value types per tool', () => {
      const tools = getReturnTools();
      const typeMap = new Map(tools.map(t => [t.name, t.schema.parameters[1].type]));

      expect(typeMap.get('__vibe_return_text')).toEqual({ type: 'string' });
      expect(typeMap.get('__vibe_return_number')).toEqual({ type: 'number' });
      expect(typeMap.get('__vibe_return_boolean')).toEqual({ type: 'boolean' });
      expect(typeMap.get('__vibe_return_json')).toEqual({ type: 'object' });
      expect(typeMap.get('__vibe_return_text_array')).toEqual({ type: 'array', items: { type: 'string' } });
      expect(typeMap.get('__vibe_return_number_array')).toEqual({ type: 'array', items: { type: 'number' } });
      expect(typeMap.get('__vibe_return_boolean_array')).toEqual({ type: 'array', items: { type: 'boolean' } });
      expect(typeMap.get('__vibe_return_json_array')).toEqual({ type: 'array', items: { type: 'object' } });
    });
  });

  describe('return tool executors', () => {
    it('should return field return result from each typed tool', async () => {
      const tools = getReturnTools();
      const toolMap = new Map(tools.map(t => [t.name, t]));

      // Text tool
      const textResult = await toolMap.get('__vibe_return_text')!.executor({ field: 's', value: 'hello' });
      expect(textResult).toEqual({ __fieldReturn: true, field: 's', value: 'hello' });

      // Number tool
      const numResult = await toolMap.get('__vibe_return_number')!.executor({ field: 'n', value: 123 });
      expect(numResult).toEqual({ __fieldReturn: true, field: 'n', value: 123 });

      // Boolean tool
      const boolResult = await toolMap.get('__vibe_return_boolean')!.executor({ field: 'b', value: true });
      expect(boolResult).toEqual({ __fieldReturn: true, field: 'b', value: true });

      // JSON tool
      const objResult = await toolMap.get('__vibe_return_json')!.executor({ field: 'o', value: { name: 'Alice' } });
      expect(objResult).toEqual({ __fieldReturn: true, field: 'o', value: { name: 'Alice' } });

      // Typed array tools
      const textArr = await toolMap.get('__vibe_return_text_array')!.executor({ field: 'a', value: ['a', 'b'] });
      expect(textArr).toEqual({ __fieldReturn: true, field: 'a', value: ['a', 'b'] });

      const numArr = await toolMap.get('__vibe_return_number_array')!.executor({ field: 'a', value: [1, 2, 3] });
      expect(numArr).toEqual({ __fieldReturn: true, field: 'a', value: [1, 2, 3] });

      const boolArr = await toolMap.get('__vibe_return_boolean_array')!.executor({ field: 'a', value: [true, false] });
      expect(boolArr).toEqual({ __fieldReturn: true, field: 'a', value: [true, false] });

      const jsonArr = await toolMap.get('__vibe_return_json_array')!.executor({ field: 'a', value: [{ x: 1 }] });
      expect(jsonArr).toEqual({ __fieldReturn: true, field: 'a', value: [{ x: 1 }] });
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

    describe('structural type return value extraction', () => {
      it('structural type with multiple fields returns full object (not validated["value"])', () => {
        // This tests the case: const result: AnswererResult = do "..." model
        // where AnswererResult { response: boolean, correct: boolean }
        const results = [
          { __fieldReturn: true as const, field: 'response', value: true },
          { __fieldReturn: true as const, field: 'correct', value: false },
        ];
        const expectedFields = [
          { name: 'response', type: 'boolean' },
          { name: 'correct', type: 'boolean' },
        ];

        const validated = collectAndValidateFieldResults(results, expectedFields);

        // The full object should be the final value (not validated['value'] which would be undefined)
        expect(validated).toEqual({ response: true, correct: false });
        expect(validated['response']).toBe(true);
        expect(validated['correct']).toBe(false);
        // 'value' key should NOT exist (this was the bug - code was doing validated['value'])
        expect(validated['value']).toBeUndefined();

        // Verify the isSingleValueReturn logic:
        // This is NOT a single-value return (multiple fields, none named 'value')
        const isSingleValueReturn = expectedFields.length === 1 && expectedFields[0].name === 'value';
        expect(isSingleValueReturn).toBe(false);
        // So the final value should be the full validated object
        const finalValue = isSingleValueReturn ? validated['value'] : validated;
        expect(finalValue).toEqual({ response: true, correct: false });
      });

      it('single-value typed return extracts the value field', () => {
        // This tests the case: const x: number = do "..." model
        // expectedFields = [{name: 'value', type: 'number'}]
        const results = [
          { __fieldReturn: true as const, field: 'value', value: 42 },
        ];
        const expectedFields = [
          { name: 'value', type: 'number' },
        ];

        const validated = collectAndValidateFieldResults(results, expectedFields);
        expect(validated).toEqual({ value: 42 });

        // This IS a single-value return
        const isSingleValueReturn = expectedFields.length === 1 && expectedFields[0].name === 'value';
        expect(isSingleValueReturn).toBe(true);
        // So the final value should be extracted
        const finalValue = isSingleValueReturn ? validated['value'] : validated;
        expect(finalValue).toBe(42);
      });

      it('structural type with nested fields returns full object', () => {
        // Tests a more complex structural type with nested objects
        const results = [
          { __fieldReturn: true as const, field: 'name', value: 'Alice' },
          { __fieldReturn: true as const, field: 'score', value: 95 },
          { __fieldReturn: true as const, field: 'passed', value: true },
        ];
        const expectedFields = [
          { name: 'name', type: 'text' },
          { name: 'score', type: 'number' },
          { name: 'passed', type: 'boolean' },
        ];

        const validated = collectAndValidateFieldResults(results, expectedFields);
        expect(validated).toEqual({ name: 'Alice', score: 95, passed: true });

        // Multi-field: full object is the final value
        const isSingleValueReturn = expectedFields.length === 1 && expectedFields[0].name === 'value';
        expect(isSingleValueReturn).toBe(false);
        const finalValue = isSingleValueReturn ? validated['value'] : validated;
        expect(finalValue).toEqual({ name: 'Alice', score: 95, passed: true });
      });

      it('single field NOT named value returns full object (structural type with one field)', () => {
        // Edge case: type Result { success: boolean } - one field but not named 'value'
        const results = [
          { __fieldReturn: true as const, field: 'success', value: true },
        ];
        const expectedFields = [
          { name: 'success', type: 'boolean' },
        ];

        const validated = collectAndValidateFieldResults(results, expectedFields);
        expect(validated).toEqual({ success: true });

        // Single field but NOT named 'value' - still a structural type
        const isSingleValueReturn = expectedFields.length === 1 && expectedFields[0].name === 'value';
        expect(isSingleValueReturn).toBe(false);
        const finalValue = isSingleValueReturn ? validated['value'] : validated;
        expect(finalValue).toEqual({ success: true });
      });
    });
  });

  describe('buildReturnInstruction', () => {
    it('should return empty string for no fields', () => {
      expect(buildReturnInstruction([])).toBe('');
    });

    it('should build instruction for single number field', () => {
      const instruction = buildReturnInstruction([{ name: 'value', type: 'number' }]);
      expect(instruction).toContain('__vibe_return_number');
      expect(instruction).toContain('"value"');
    });

    it('should build instruction for multiple fields with correct tool names', () => {
      const instruction = buildReturnInstruction([
        { name: 'name', type: 'text' },
        { name: 'age', type: 'number' },
        { name: 'active', type: 'boolean' },
      ]);
      expect(instruction).toContain('__vibe_return_text');
      expect(instruction).toContain('"name"');
      expect(instruction).toContain('__vibe_return_number');
      expect(instruction).toContain('"age"');
      expect(instruction).toContain('__vibe_return_boolean');
      expect(instruction).toContain('"active"');
    });

    it('should use typed array tools for array types', () => {
      const numArr = buildReturnInstruction([{ name: 'nums', type: 'number[]' }]);
      expect(numArr).toContain('__vibe_return_number_array');
      expect(numArr).toContain('"nums"');

      const textArr = buildReturnInstruction([{ name: 'names', type: 'text[]' }]);
      expect(textArr).toContain('__vibe_return_text_array');

      const boolArr = buildReturnInstruction([{ name: 'flags', type: 'boolean[]' }]);
      expect(boolArr).toContain('__vibe_return_boolean_array');

      const jsonArr = buildReturnInstruction([{ name: 'items', type: 'json[]' }]);
      expect(jsonArr).toContain('__vibe_return_json_array');
    });

    it('should use json tool for json type', () => {
      const instruction = buildReturnInstruction([{ name: 'data', type: 'json' }]);
      expect(instruction).toContain('__vibe_return_json');
      expect(instruction).toContain('"data"');
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

    // AI calls the number return tool with correct value
    const executeProvider = async (): Promise<AIResponse> => ({
      content: '',
      parsedValue: '',
      toolCalls: [{ id: 'call_1', toolName: '__vibe_return_number', args: { field: 'value', value: 42 } }],
      stopReason: 'tool_use',
    });

    const { returnFieldResults, completedViaReturnTool, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { expectedReturnTool: RETURN_TOOL_PREFIX }
    );

    expect(completedViaReturnTool).toBe(true);
    expect(returnFieldResults).toHaveLength(1);
    expect(returnFieldResults![0]).toEqual({ __fieldReturn: true, field: 'value', value: 42 });
    expect(rounds).toHaveLength(1);
  });

  it('should collect multiple field results with different typed tools', async () => {
    const tools = getReturnTools();

    const request: AIRequest = {
      operationType: 'do',
      prompt: 'Return name and age',
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    // AI calls text tool for name and number tool for age
    const executeProvider = async (): Promise<AIResponse> => ({
      content: '',
      parsedValue: '',
      toolCalls: [
        { id: 'call_1', toolName: '__vibe_return_text', args: { field: 'name', value: 'Alice' } },
        { id: 'call_2', toolName: '__vibe_return_number', args: { field: 'age', value: 30 } },
      ],
      stopReason: 'tool_use',
    });

    const { returnFieldResults, completedViaReturnTool } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { expectedReturnTool: RETURN_TOOL_PREFIX }
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
    let receivedFollowUp: string | undefined;
    const executeProvider = async (req: AIRequest): Promise<AIResponse> => {
      callCount++;
      if (callCount === 1) {
        // First call: AI responds with text (wrong)
        return {
          content: 'The answer is 42',
          parsedValue: 'The answer is 42',
          stopReason: 'end',
        };
      }
      // Second call: should have followUpMessage asking to use tool
      receivedFollowUp = req.followUpMessage;
      // AI calls return tool correctly
      return {
        content: '',
        parsedValue: '',
        toolCalls: [{ id: 'call_1', toolName: '__vibe_return_number', args: { field: 'value', value: 42 } }],
        stopReason: 'tool_use',
      };
    };

    const { returnFieldResults, completedViaReturnTool, rounds } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { expectedReturnTool: RETURN_TOOL_PREFIX, maxRounds: 3 }
    );

    expect(callCount).toBe(2);
    expect(completedViaReturnTool).toBe(true);
    expect(returnFieldResults).toHaveLength(1);
    // Retry sent followUpMessage to AI
    expect(receivedFollowUp).toContain('must use');
    // Only the successful tool call round is recorded
    expect(rounds).toHaveLength(1);
  });

  it('should retry when AI only returns some of the expected fields', async () => {
    const tools = getReturnTools();

    const request: AIRequest = {
      operationType: 'do',
      prompt: 'Return response and correct',
      contextText: '',
      targetType: null,
      model: { name: 'test', apiKey: 'key', url: null },
    };

    let callCount = 0;
    let receivedFollowUp: string | undefined;
    const executeProvider = async (req: AIRequest): Promise<AIResponse> => {
      callCount++;
      if (callCount === 1) {
        // First call: AI only returns 'response' field, missing 'correct'
        return {
          content: '',
          parsedValue: '',
          toolCalls: [{ id: 'call_1', toolName: '__vibe_return_boolean', args: { field: 'response', value: true } }],
          stopReason: 'tool_use',
        };
      }
      // Second call: should have followUpMessage about missing 'correct'
      receivedFollowUp = req.followUpMessage;
      return {
        content: '',
        parsedValue: '',
        toolCalls: [{ id: 'call_2', toolName: '__vibe_return_boolean', args: { field: 'correct', value: false } }],
        stopReason: 'tool_use',
      };
    };

    const { returnFieldResults, completedViaReturnTool } = await executeWithTools(
      request,
      tools,
      TEST_ROOT_DIR,
      executeProvider,
      { expectedReturnTool: RETURN_TOOL_PREFIX, expectedFieldNames: ['response', 'correct'], maxRounds: 3 }
    );

    expect(callCount).toBe(2);
    expect(completedViaReturnTool).toBe(true);
    expect(returnFieldResults).toHaveLength(2);
    // Retry asked for the missing 'correct' field
    expect(receivedFollowUp).toContain('"correct"');
    expect(receivedFollowUp).toContain('missing required fields');
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
