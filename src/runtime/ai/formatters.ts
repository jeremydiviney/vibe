// Message formatting utilities for AI providers

import type { TargetType } from './types';
import type { ToolSchema } from '../tools/types';
import { getTypeInstruction } from './schema';

/** Message structure for AI providers */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Build system message with Vibe processing instructions.
 */
export function buildSystemMessage(): string {
  return `You are an AI assistant integrated into the Vibe programming language runtime.
Your responses will be used programmatically in the execution flow.
Be concise and precise. Follow any type constraints exactly.
When context is provided, use it to inform your response.`;
}

/**
 * Build context message from formatted context text.
 * Returns null if context is empty.
 */
export function buildContextMessage(contextText: string): string | null {
  const trimmed = contextText.trim();
  if (!trimmed) return null;

  return `Here is the current program context:\n\n${trimmed}`;
}

/**
 * Format a JsonSchema as a readable type string.
 * Examples: "string", "number", "{name: string, age: number}", "string[]"
 */
function formatJsonSchemaType(schema: ToolSchema['parameters'][0]['type']): string {
  if (schema.type === 'array') {
    const itemType = schema.items ? formatJsonSchemaType(schema.items) : 'any';
    return `${itemType}[]`;
  }

  if (schema.type === 'object' && schema.properties) {
    const props = Object.entries(schema.properties)
      .map(([name, propSchema]) => `${name}: ${formatJsonSchemaType(propSchema)}`)
      .join(', ');
    return `{${props}}`;
  }

  return schema.type;
}

/**
 * Build system message describing available tools.
 * Returns null if no tools are provided.
 */
export function buildToolSystemMessage(tools: ToolSchema[]): string | null {
  if (!tools.length) return null;

  const toolList = tools
    .map((t) => {
      // Format: name(param: type, param: type)
      const signature = t.parameters
        .map((p) => `${p.name}: ${formatJsonSchemaType(p.type)}`)
        .join(', ');

      const lines: string[] = [`- ${t.name}(${signature})`];

      // Add tool description
      if (t.description) {
        lines.push(`    ${t.description}`);
      }

      // Add parameter descriptions if any exist
      const paramDescs = t.parameters.filter((p) => p.description);
      if (paramDescs.length > 0) {
        lines.push('    Parameters:');
        for (const p of paramDescs) {
          lines.push(`      ${p.name}: ${p.description}`);
        }
      }

      return lines.join('\n');
    })
    .join('\n');

  return `You have access to the following tools:\n${toolList}\n\nCall tools when needed to complete the task.`;
}

/**
 * Build the prompt message with optional type instruction.
 * For providers without structured output support, appends type instruction.
 * For json/json[] types, always adds instruction since structured output can't enforce unknown schemas.
 */
export function buildPromptMessage(
  prompt: string,
  targetType: TargetType,
  supportsStructuredOutput: boolean
): string {
  if (!targetType) {
    return prompt;
  }

  // json/json[] types always need instruction - structured output can't handle unknown schemas
  const isJsonType = targetType === 'json' || targetType === 'json[]';

  // Skip type instruction if provider uses structured output (except for json types)
  if (supportsStructuredOutput && !isJsonType) {
    return prompt;
  }

  // Append type instruction
  const typeInstruction = getTypeInstruction(targetType);
  if (!typeInstruction) {
    return prompt;
  }

  return `${prompt}\n\n${typeInstruction}`;
}

/**
 * Build messages array for chat-style APIs (OpenAI, Anthropic).
 * Returns: [system, tools?, context?, prompt]
 */
export function buildMessages(
  prompt: string,
  contextText: string,
  targetType: TargetType,
  supportsStructuredOutput: boolean,
  tools?: ToolSchema[]
): Message[] {
  const messages: Message[] = [
    { role: 'system', content: buildSystemMessage() },
  ];

  // Add tool descriptions as second system message
  if (tools?.length) {
    const toolMessage = buildToolSystemMessage(tools);
    if (toolMessage) {
      messages.push({ role: 'system', content: toolMessage });
    }
  }

  const contextMessage = buildContextMessage(contextText);
  if (contextMessage) {
    messages.push({ role: 'user', content: contextMessage });
  }

  const promptMessage = buildPromptMessage(prompt, targetType, supportsStructuredOutput);
  messages.push({ role: 'user', content: promptMessage });

  return messages;
}

/**
 * Extract text content from various API response formats.
 */
export function extractTextContent(response: unknown): string {
  // Anthropic format: { content: [{ type: "text", text: "..." }] }
  if (hasProperty(response, 'content') && Array.isArray(response.content)) {
    const textBlock = response.content.find(
      (block: unknown) => hasProperty(block, 'type') && block.type === 'text'
    );
    if (textBlock && hasProperty(textBlock, 'text')) {
      return String(textBlock.text);
    }
  }

  // OpenAI format: { choices: [{ message: { content: "..." } }] }
  if (hasProperty(response, 'choices') && Array.isArray(response.choices)) {
    const first = response.choices[0];
    if (hasProperty(first, 'message') && hasProperty(first.message, 'content')) {
      return String(first.message.content);
    }
  }

  // Google format: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  if (hasProperty(response, 'candidates') && Array.isArray(response.candidates)) {
    const first = response.candidates[0];
    if (hasProperty(first, 'content') && hasProperty(first.content, 'parts')) {
      const parts = first.content.parts as unknown[];
      const textPart = parts.find((p: unknown) => hasProperty(p, 'text'));
      if (textPart && hasProperty(textPart, 'text')) {
        return String(textPart.text);
      }
    }
  }

  throw new Error('Unable to extract text content from response');
}

/**
 * Type guard for checking if an object has a property.
 */
function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj;
}

/**
 * Extract usage information from various API response formats.
 */
export function extractUsage(
  response: unknown
): { inputTokens: number; outputTokens: number } | undefined {
  // Anthropic format: { usage: { input_tokens, output_tokens } }
  if (hasProperty(response, 'usage') && hasProperty(response.usage, 'input_tokens')) {
    return {
      inputTokens: Number(response.usage.input_tokens),
      outputTokens: Number(response.usage.output_tokens ?? 0),
    };
  }

  // OpenAI format: { usage: { prompt_tokens, completion_tokens } }
  if (hasProperty(response, 'usage') && hasProperty(response.usage, 'prompt_tokens')) {
    return {
      inputTokens: Number(response.usage.prompt_tokens),
      outputTokens: Number(response.usage.completion_tokens ?? 0),
    };
  }

  // Google format: { usageMetadata: { promptTokenCount, candidatesTokenCount } }
  if (hasProperty(response, 'usageMetadata')) {
    const meta = response.usageMetadata as Record<string, unknown>;
    return {
      inputTokens: Number(meta.promptTokenCount ?? 0),
      outputTokens: Number(meta.candidatesTokenCount ?? 0),
    };
  }

  return undefined;
}

/**
 * Scope parameter for vibe code generation.
 */
export interface VibeScopeParam {
  name: string;
  type: string;
  value: unknown;
}

/**
 * Build system message for vibe code generation.
 * Instructs the AI to generate a valid Vibe function.
 */
export function buildVibeSystemMessage(scopeParams: VibeScopeParam[]): string {
  const paramList = scopeParams
    .map(p => `  - ${p.name}: ${p.type}`)
    .join('\n');

  return `You are generating a Vibe programming language function.

REQUIREMENTS:
1. Generate EXACTLY ONE function declaration
2. No markdown, no explanations, no code fences - ONLY the function code
3. The function will receive these parameters from the calling scope:
${paramList || '  (none)'}

4. Use ONLY these parameters - no other variables are accessible
5. The function must have a return statement

VIBE SYNTAX REFERENCE:
- Types: text, number, boolean, json, arrays (text[], number[])
- Variables: let x = value, const x = value
- Control flow: if/else, for x in array, while (condition)
- AI calls: do "prompt" model default (use the model parameter)
- TS blocks: ts(params) { return jsCode; }
- Return: return value

IMPORTANT - FUNCTION SIGNATURE:
- The FIRST parameter must always be 'model' (the AI model to use)
- Additional parameters are the scope variables listed above
- Example: function myFunc(model, x, y): text { ... }

RESTRICTIONS:
- You can ONLY use function parameters and locally-created variables
- No access to external functions or global variables
- For AI calls, use the 'model' parameter: do "prompt" model default

EXAMPLE:
function processData(model, items: text[], count: number): text {
  let result = ""
  for item in items {
    result = result + item
  }
  return result
}

Generate ONLY the function code.`;
}

/**
 * Build user prompt for vibe code generation.
 */
export function buildVibePromptMessage(userPrompt: string, scopeParams: VibeScopeParam[]): string {
  const paramContext = scopeParams
    .map(p => `${p.name} (${p.type}) = ${formatVibeValue(p.value)}`)
    .join('\n');

  const contextSection = paramContext
    ? `\nAvailable parameters and their current values:\n${paramContext}\n`
    : '';

  return `Task: ${userPrompt}${contextSection}
Generate a function that accomplishes this task using only the available parameters.`;
}

/**
 * Format a value for display in vibe context.
 */
function formatVibeValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    if (value.length > 50) return `"${value.substring(0, 50)}..."`;
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length > 3) return `[${formatVibeValue(value[0])}, ... (${value.length} items)]`;
    return `[${value.map(formatVibeValue).join(', ')}]`;
  }
  return JSON.stringify(value).substring(0, 50);
}

/**
 * Build messages array for vibe code generation.
 * Returns: [system, prompt]
 */
export function buildVibeMessages(
  userPrompt: string,
  scopeParams: VibeScopeParam[]
): Message[] {
  return [
    { role: 'system', content: buildVibeSystemMessage(scopeParams) },
    { role: 'user', content: buildVibePromptMessage(userPrompt, scopeParams) },
  ];
}
