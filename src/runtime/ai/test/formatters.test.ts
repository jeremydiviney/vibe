// Formatter tests

import { describe, test, expect } from 'bun:test';
import {
  buildSystemMessage,
  buildContextMessage,
  buildPromptMessage,
  buildMessages,
  buildToolSystemMessage,
  extractTextContent,
  extractUsage,
} from '../formatters';
import type { ToolSchema } from '../../tools/types';

describe('buildSystemMessage', () => {
  test('returns a system message string', () => {
    const message = buildSystemMessage();
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain('Vibe');
  });
});

describe('buildContextMessage', () => {
  test('returns null for empty context', () => {
    expect(buildContextMessage('')).toBeNull();
    expect(buildContextMessage('   ')).toBeNull();
  });

  test('wraps context with header', () => {
    const message = buildContextMessage('Variable x = 5');
    expect(message).toContain('context');
    expect(message).toContain('Variable x = 5');
  });
});

describe('buildPromptMessage', () => {
  test('returns prompt as-is when no type instruction needed', () => {
    // Text type doesn't need instruction
    expect(buildPromptMessage('Hello', 'text', false)).toBe('Hello');
    // Structured output handles type
    expect(buildPromptMessage('Hello', 'number', true)).toBe('Hello');
  });

  test('appends type instruction for non-structured output', () => {
    const message = buildPromptMessage('Hello', 'number', false);
    expect(message).toContain('Hello');
    expect(message).toContain('number');
  });

  test('returns prompt as-is when null target type', () => {
    expect(buildPromptMessage('Hello', null, false)).toBe('Hello');
    expect(buildPromptMessage('Hello', null, true)).toBe('Hello');
  });
});

describe('buildToolSystemMessage', () => {
  test('returns null for empty tools array', () => {
    expect(buildToolSystemMessage([])).toBeNull();
  });

  test('formats single tool with description', () => {
    const tools: ToolSchema[] = [
      {
        name: 'getWeather',
        description: 'Get weather for a city',
        parameters: [
          { name: 'city', type: { type: 'string' }, required: true },
        ],
      },
    ];

    const message = buildToolSystemMessage(tools);

    expect(message).toBe(
`You have access to the following tools:
- getWeather(city: string)
    Get weather for a city

Call tools when needed to complete the task.`
    );
  });

  test('full system message with multiple user-defined tools', () => {
    // This represents what tools defined in Vibe would look like:
    // tool add(a: number, b: number): number @description "Add two numbers" @param a "First number" @param b "Second number"
    // tool multiply(x: number, y: number): number @description "Multiply two numbers"
    // tool fetchData(url: text): json @description "Fetch JSON from URL" @param url "The URL to fetch"
    const tools: ToolSchema[] = [
      {
        name: 'add',
        description: 'Add two numbers',
        parameters: [
          { name: 'a', type: { type: 'number' }, description: 'First number', required: true },
          { name: 'b', type: { type: 'number' }, description: 'Second number', required: true },
        ],
        returns: { type: 'number' },
      },
      {
        name: 'multiply',
        description: 'Multiply two numbers',
        parameters: [
          { name: 'x', type: { type: 'number' }, required: true },
          { name: 'y', type: { type: 'number' }, required: true },
        ],
        returns: { type: 'number' },
      },
      {
        name: 'fetchData',
        description: 'Fetch JSON from URL',
        parameters: [
          { name: 'url', type: { type: 'string' }, description: 'The URL to fetch', required: true },
        ],
        returns: { type: 'object' },
      },
    ];

    const message = buildToolSystemMessage(tools);

    expect(message).toBe(
`You have access to the following tools:
- add(a: number, b: number)
    Add two numbers
    Parameters:
      a: First number
      b: Second number
- multiply(x: number, y: number)
    Multiply two numbers
- fetchData(url: string)
    Fetch JSON from URL
    Parameters:
      url: The URL to fetch

Call tools when needed to complete the task.`
    );
  });

  test('full message array with tools, context, and prompt', () => {
    const tools: ToolSchema[] = [
      {
        name: 'calculate',
        description: 'Perform arithmetic',
        parameters: [
          { name: 'expression', type: { type: 'string' }, description: 'Math expression', required: true },
        ],
      },
      {
        name: 'storeResult',
        description: 'Store a calculation result',
        parameters: [
          { name: 'key', type: { type: 'string' }, required: true },
          { name: 'value', type: { type: 'number' }, required: true },
        ],
      },
    ];

    const contextText = `<entry> (current scope)
  - x (number): 10
  - y (number): 20`;

    const messages = buildMessages(
      'Calculate x + y and store it',
      contextText,
      'number',
      true,
      tools
    );

    // Verify complete message structure
    expect(messages).toHaveLength(4);

    // Message 0: Base system message
    expect(messages[0]).toEqual({
      role: 'system',
      content: `You are an AI assistant integrated into the Vibe programming language runtime.
Your responses will be used programmatically in the execution flow.
Be concise and precise. Follow any type constraints exactly.
When context is provided, use it to inform your response.`,
    });

    // Message 1: Tool system message
    expect(messages[1]).toEqual({
      role: 'system',
      content: `You have access to the following tools:
- calculate(expression: string)
    Perform arithmetic
    Parameters:
      expression: Math expression
- storeResult(key: string, value: number)
    Store a calculation result

Call tools when needed to complete the task.`,
    });

    // Message 2: Context message
    expect(messages[2]).toEqual({
      role: 'user',
      content: `Here is the current program context:

<entry> (current scope)
  - x (number): 10
  - y (number): 20`,
    });

    // Message 3: Prompt
    expect(messages[3]).toEqual({
      role: 'user',
      content: 'Calculate x + y and store it',
    });
  });

  test('formats tool without description', () => {
    const tools: ToolSchema[] = [
      {
        name: 'now',
        parameters: [],
      },
    ];

    const message = buildToolSystemMessage(tools);

    expect(message).toBe(
`You have access to the following tools:
- now()

Call tools when needed to complete the task.`
    );
  });

  test('formats multiple tools with various parameters', () => {
    const tools: ToolSchema[] = [
      {
        name: 'add',
        description: 'Add two numbers',
        parameters: [
          { name: 'a', type: { type: 'number' }, required: true },
          { name: 'b', type: { type: 'number' }, required: true },
        ],
      },
      {
        name: 'greet',
        description: 'Greet someone',
        parameters: [
          { name: 'name', type: { type: 'string' }, required: true },
        ],
      },
      {
        name: 'now',
        description: 'Get current timestamp',
        parameters: [],
      },
    ];

    const message = buildToolSystemMessage(tools);

    expect(message).toBe(
`You have access to the following tools:
- add(a: number, b: number)
    Add two numbers
- greet(name: string)
    Greet someone
- now()
    Get current timestamp

Call tools when needed to complete the task.`
    );
  });

  test('formats tool with many parameters', () => {
    const tools: ToolSchema[] = [
      {
        name: 'sendEmail',
        description: 'Send an email',
        parameters: [
          { name: 'to', type: { type: 'string' }, required: true },
          { name: 'subject', type: { type: 'string' }, required: true },
          { name: 'body', type: { type: 'string' }, required: true },
          { name: 'cc', type: { type: 'string' }, required: false },
        ],
      },
    ];

    const message = buildToolSystemMessage(tools);

    expect(message).toBe(
`You have access to the following tools:
- sendEmail(to: string, subject: string, body: string, cc: string)
    Send an email

Call tools when needed to complete the task.`
    );
  });

  test('formats tool with complex nested object parameter', () => {
    const tools: ToolSchema[] = [
      {
        name: 'createOrder',
        description: 'Create a new order',
        parameters: [
          {
            name: 'customer',
            type: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
                address: {
                  type: 'object',
                  properties: {
                    street: { type: 'string' },
                    city: { type: 'string' },
                    zip: { type: 'string' },
                  },
                },
              },
            },
            description: 'Customer information',
            required: true,
          },
          {
            name: 'items',
            type: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: { type: 'string' },
                  quantity: { type: 'number' },
                  price: { type: 'number' },
                },
              },
            },
            description: 'Order items',
            required: true,
          },
        ],
      },
    ];

    const message = buildToolSystemMessage(tools);

    expect(message).toBe(
`You have access to the following tools:
- createOrder(customer: {name: string, email: string, address: {street: string, city: string, zip: string}}, items: {productId: string, quantity: number, price: number}[])
    Create a new order
    Parameters:
      customer: Customer information
      items: Order items

Call tools when needed to complete the task.`
    );
  });
});

describe('buildMessages', () => {
  test('builds messages with system and prompt', () => {
    const messages = buildMessages('Hello', '', null, true);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('Hello');
  });

  test('includes context message when provided', () => {
    const messages = buildMessages('Hello', 'x = 5', null, true);

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('x = 5');
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toBe('Hello');
  });

  test('includes tool system message when tools provided', () => {
    const tools: ToolSchema[] = [
      {
        name: 'add',
        description: 'Add two numbers',
        parameters: [
          { name: 'a', type: { type: 'number' }, required: true },
          { name: 'b', type: { type: 'number' }, required: true },
        ],
      },
    ];

    const messages = buildMessages('Calculate 2+3', '', null, true, tools);

    // Should have: system, tool system, prompt
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('system');
    expect(messages[1].content).toContain('You have access to the following tools:');
    expect(messages[1].content).toContain('- add(a: number, b: number)');
    expect(messages[1].content).toContain('Add two numbers');
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toBe('Calculate 2+3');
  });

  test('includes all message types: system, tools, context, prompt', () => {
    const tools: ToolSchema[] = [
      {
        name: 'getWeather',
        description: 'Get weather',
        parameters: [{ name: 'city', type: { type: 'string' }, required: true }],
      },
    ];

    const messages = buildMessages(
      'What is the weather?',
      'location = Seattle',
      null,
      true,
      tools
    );

    // Should have: system, tool system, context, prompt
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Vibe');
    expect(messages[1].role).toBe('system');
    expect(messages[1].content).toContain('getWeather(city: string)');
    expect(messages[1].content).toContain('Get weather');
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toContain('location = Seattle');
    expect(messages[3].role).toBe('user');
    expect(messages[3].content).toBe('What is the weather?');
  });
});

describe('extractTextContent', () => {
  test('extracts from Anthropic format', () => {
    const response = {
      content: [{ type: 'text', text: 'Hello from Claude' }],
    };
    expect(extractTextContent(response)).toBe('Hello from Claude');
  });

  test('extracts from OpenAI format', () => {
    const response = {
      choices: [{ message: { content: 'Hello from GPT' } }],
    };
    expect(extractTextContent(response)).toBe('Hello from GPT');
  });

  test('extracts from Google format', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello from Gemini' }],
          },
        },
      ],
    };
    expect(extractTextContent(response)).toBe('Hello from Gemini');
  });

  test('throws for unknown format', () => {
    expect(() => extractTextContent({})).toThrow();
    expect(() => extractTextContent({ unknown: 'format' })).toThrow();
  });
});

describe('extractUsage', () => {
  test('extracts from Anthropic format', () => {
    const response = {
      usage: { input_tokens: 10, output_tokens: 20 },
    };
    expect(extractUsage(response)).toEqual({
      inputTokens: 10,
      outputTokens: 20,
    });
  });

  test('extracts from OpenAI format', () => {
    const response = {
      usage: { prompt_tokens: 15, completion_tokens: 25 },
    };
    expect(extractUsage(response)).toEqual({
      inputTokens: 15,
      outputTokens: 25,
    });
  });

  test('extracts from Google format', () => {
    const response = {
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 12 },
    };
    expect(extractUsage(response)).toEqual({
      inputTokens: 8,
      outputTokens: 12,
    });
  });

  test('returns undefined for missing usage', () => {
    expect(extractUsage({})).toBeUndefined();
    expect(extractUsage({ content: 'text' })).toBeUndefined();
  });
});
