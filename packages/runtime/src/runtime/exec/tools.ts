// Tool execution handlers

import * as AST from '../../ast';
import type { RuntimeState } from '../types';
import { createVibeValue } from '../types';
import type { ToolSchema, ToolParameterSchema, VibeToolValue } from '../tools/types';
import { vibeTypeToJsonSchema } from '../tools/ts-schema';
import { currentFrame } from '../state';

/**
 * Execute a tool declaration - stores the tool as a variable in frame locals.
 */
export function execToolDeclaration(
  state: RuntimeState,
  decl: AST.ToolDeclaration
): RuntimeState {
  // Build tool schema from declaration
  const schema = buildToolSchema(state, decl);

  // Create executor that wraps the tool body
  const executor = createToolExecutor(state, decl);

  // Create the tool value (like a model value)
  const toolValue: VibeToolValue = {
    __vibeTool: true,
    name: decl.name,
    schema,
    executor,
  };

  // Store as a variable in frame locals (like model declarations)
  const frame = currentFrame(state);
  const newLocals = {
    ...frame.locals,
    [decl.name]: createVibeValue(toolValue, { isConst: true, vibeType: null }),
  };

  return {
    ...state,
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, locals: newLocals },
    ],
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
    type: vibeTypeToJsonSchema(param.vibeType, importedTypes),
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

