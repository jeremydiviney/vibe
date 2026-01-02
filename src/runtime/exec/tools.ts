// Tool execution handlers

import * as AST from '../../ast';
import type { RuntimeState } from '../types';
import type { RegisteredTool, ToolSchema, ToolParameterSchema } from '../tools/types';
import { vibeTypeToJsonSchema } from '../tools/ts-schema';

/**
 * Execute a tool declaration - registers the tool in the registry.
 */
export function execToolDeclaration(
  state: RuntimeState,
  decl: AST.ToolDeclaration
): RuntimeState {
  // Build tool schema from declaration
  const schema = buildToolSchema(state, decl);

  // Create executor that wraps the tool body
  // For now, tools execute their body as inline TS code
  const executor = createToolExecutor(state, decl);

  const tool: RegisteredTool = {
    name: decl.name,
    kind: 'user',
    schema,
    executor,
    declaration: decl,
    location: decl.location,
  };

  // Register the tool (mutates registry, but registry is part of state)
  state.toolRegistry.register(tool);

  return {
    ...state,
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'tool_declaration',
        details: { toolName: decl.name },
      },
    ],
  };
}

/**
 * Build a tool schema from the AST declaration.
 * Converts Vibe types to JSON Schema, merging in @param descriptions.
 */
function buildToolSchema(
  state: RuntimeState,
  decl: AST.ToolDeclaration
): ToolSchema {
  // Build map of imported types for resolving TS type references
  const importedTypes = new Map<string, string>();
  for (const [name, info] of Object.entries(state.importedNames)) {
    if (info.sourceType === 'ts') {
      importedTypes.set(name, info.source);
    }
  }

  const parameters: ToolParameterSchema[] = decl.params.map((param) => ({
    name: param.name,
    type: vibeTypeToJsonSchema(param.typeAnnotation, importedTypes),
    description: param.description,
    required: true, // All tool parameters are required for now
  }));

  return {
    name: decl.name,
    description: decl.description,
    parameters,
    returns: decl.returnType
      ? vibeTypeToJsonSchema(decl.returnType, importedTypes)
      : undefined,
  };
}

/**
 * Create an executor function for a user-defined tool.
 * The executor extracts the TS block from the tool body and runs it.
 */
function createToolExecutor(
  _state: RuntimeState,
  decl: AST.ToolDeclaration
): (args: Record<string, unknown>) => Promise<unknown> {
  // Find the TsBlock in the tool body
  const tsBlock = findTsBlock(decl.body);

  if (!tsBlock) {
    throw new Error(`Tool '${decl.name}' must have a ts block as its body`);
  }

  // Return an executor that runs the TS code with the provided args
  return async (args: Record<string, unknown>): Promise<unknown> => {
    // Build parameter values in the order they appear in the ts block params
    const paramValues = tsBlock.params.map((paramName) => args[paramName]);

    // Create async function from the TS body
    const asyncFn = new Function(
      ...tsBlock.params,
      `return (async () => { ${tsBlock.body} })()`
    );

    return await asyncFn(...paramValues);
  };
}

/**
 * Find the first TsBlock expression in a block statement.
 */
function findTsBlock(block: AST.BlockStatement): AST.TsBlock | null {
  for (const stmt of block.body) {
    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'TsBlock') {
      return stmt.expression;
    }
  }
  return null;
}

/**
 * Execute a tool call - pauses execution and sets up pending tool call.
 */
export function execCallTool(
  state: RuntimeState,
  toolName: string,
  argCount: number
): RuntimeState {
  const args = state.valueStack.slice(-argCount);
  const newValueStack = state.valueStack.slice(0, -argCount);

  // Look up the tool in the registry
  const tool = state.toolRegistry.get(toolName);
  if (!tool) {
    throw new Error(`Tool '${toolName}' is not defined`);
  }

  // Build args object from positional arguments
  const argsObj: Record<string, unknown> = {};
  tool.schema.parameters.forEach((param, i) => {
    argsObj[param.name] = args[i];
  });

  return {
    ...state,
    valueStack: newValueStack,
    status: 'awaiting_tool',
    pendingToolCall: {
      toolName,
      toolCallId: `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      args: argsObj,
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'tool_call_request',
        details: { toolName, args: argsObj },
      },
    ],
  };
}

/**
 * Check if an identifier is a registered tool.
 */
export function isRegisteredTool(state: RuntimeState, name: string): boolean {
  return state.toolRegistry.has(name);
}
