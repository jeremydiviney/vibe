// Statement execution helpers: declarations, control flow

import * as AST from '../../ast';
import type { SourceLocation } from '../../errors';
import type { RuntimeState, VibeValue } from '../types';
import { createVibeValue, resolveValue, isVibeValue } from '../types';
import { currentFrame } from '../state';
import { requireBoolean, validateAndCoerce } from '../validation';
import { execDeclareVar } from './variables';
import { getImportedVibeFunction } from '../modules';

/**
 * Let declaration - push instructions for initializer.
 * For async declarations, sets context flag so AI/TS handlers use non-blocking mode.
 */
export function execLetDeclaration(state: RuntimeState, stmt: AST.LetDeclaration): RuntimeState {
  if (stmt.initializer) {
    // For async declarations, set context flag before evaluating
    const baseState = stmt.isAsync ? {
      ...state,
      currentAsyncVarName: stmt.name,
      currentAsyncIsConst: false,
      currentAsyncType: stmt.typeAnnotation,
      currentAsyncIsPrivate: stmt.isPrivate ?? false,
    } : state;

    return {
      ...baseState,
      instructionStack: [
        { op: 'exec_expression', expr: stmt.initializer, location: stmt.initializer.location },
        { op: 'declare_var', name: stmt.name, isConst: false, type: stmt.typeAnnotation, isPrivate: stmt.isPrivate, location: stmt.location },
        ...state.instructionStack,
      ],
    };
  }

  // No initializer, declare with null
  return execDeclareVar(state, stmt.name, false, stmt.typeAnnotation, null, stmt.isPrivate);
}

/**
 * Const declaration - push instructions for initializer.
 * For async declarations, sets context flag so AI/TS handlers use non-blocking mode.
 */
export function execConstDeclaration(state: RuntimeState, stmt: AST.ConstDeclaration): RuntimeState {
  // For async declarations, set context flag before evaluating
  const baseState = stmt.isAsync ? {
    ...state,
    currentAsyncVarName: stmt.name,
    currentAsyncIsConst: true,
    currentAsyncType: stmt.typeAnnotation,
    currentAsyncIsPrivate: stmt.isPrivate ?? false,
  } : state;

  return {
    ...baseState,
    instructionStack: [
      { op: 'exec_expression', expr: stmt.initializer, location: stmt.initializer.location },
      { op: 'declare_var', name: stmt.name, isConst: true, type: stmt.typeAnnotation, isPrivate: stmt.isPrivate, location: stmt.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Destructuring declaration - evaluate initializer (AI expression) and assign fields.
 * const {name: text, age: number} = do "..." model default
 * For async declarations, sets context flag so AI/TS handlers use non-blocking mode.
 * For destructuring, currentAsyncIsDestructure=true tells the async system to NOT update
 * any variable on completion - the actual variables are created by destructure_assign.
 */
export function execDestructuringDeclaration(
  state: RuntimeState,
  stmt: AST.DestructuringDeclaration
): RuntimeState {
  // Convert AST fields to ExpectedField format for runtime (including isPrivate)
  const expectedFields = stmt.fields.map((f) => ({
    name: f.name,
    type: f.type,
    ...(f.isPrivate ? { isPrivate: true } : {}),
  }));

  // For async declarations, set isDestructure flag to enable async path
  // variableName stays null - destructure_assign creates the actual variables
  const baseState = stmt.isAsync ? {
    ...state,
    currentAsyncVarName: null,  // No single variable - destructure_assign handles it
    currentAsyncIsConst: stmt.isConst,
    currentAsyncType: null, // Destructuring doesn't have single type
    currentAsyncIsPrivate: false,
    currentAsyncIsDestructure: true,  // Signals async path without variable tracking
  } : state;

  return {
    ...baseState,
    // Set pendingDestructuring so AI provider knows what fields to expect
    pendingDestructuring: expectedFields,
    instructionStack: [
      { op: 'exec_expression', expr: stmt.initializer, location: stmt.initializer.location },
      { op: 'destructure_assign', fields: expectedFields, isConst: stmt.isConst, location: stmt.location },
      ...state.instructionStack,
    ],
  };
}

// Model config fields in evaluation order
const MODEL_CONFIG_FIELDS = ['modelName', 'apiKey', 'url', 'provider', 'maxRetriesOnError', 'thinkingLevel', 'tools'] as const;

/**
 * Model declaration - evaluate all config expressions through instruction stack.
 * This allows CallExpressions (like env(), ts blocks, function calls) to work in model config.
 */
export function execModelDeclaration(state: RuntimeState, stmt: AST.ModelDeclaration): RuntimeState {
  const instructions: typeof state.instructionStack = [];

  // Push evaluation instructions for each config field
  // Fields are evaluated in order and pushed to valueStack
  for (const field of MODEL_CONFIG_FIELDS) {
    const expr = stmt.config[field];
    if (expr) {
      instructions.push({ op: 'exec_expression', expr, location: expr.location });
    } else {
      // Use undefined for missing fields to preserve backward compatibility
      instructions.push({ op: 'literal', value: undefined, location: stmt.location });
    }
    instructions.push({ op: 'push_value', location: stmt.location });
  }

  // Finally, declare the model (will pop values from stack)
  instructions.push({ op: 'declare_model', stmt, location: stmt.location });

  return {
    ...state,
    instructionStack: [...instructions, ...state.instructionStack],
  };
}

/**
 * Finalize model declaration by popping evaluated config values from valueStack.
 */
export function finalizeModelDeclaration(
  state: RuntimeState,
  stmt: AST.ModelDeclaration
): RuntimeState {
  // Pop values from stack in reverse order (LIFO)
  // Fields were pushed in order: modelName, apiKey, url, provider, maxRetriesOnError, thinkingLevel, tools
  const fieldCount = MODEL_CONFIG_FIELDS.length;
  const rawValues = state.valueStack.slice(-fieldCount);
  const newValueStack = state.valueStack.slice(0, -fieldCount);

  // Unwrap VibeValues to get raw values
  const [modelName, apiKey, url, provider, maxRetriesOnError, thinkingLevel, tools] = rawValues.map(
    v => resolveValue(v)
  );

  const modelValue = {
    __vibeModel: true,
    name: modelName as string | null,
    apiKey: apiKey as string | null,
    url: url as string | null,
    provider: provider as string | null,
    maxRetriesOnError: maxRetriesOnError as number | null,
    thinkingLevel: thinkingLevel as string | null,
    tools: tools as unknown[] | undefined,
  };

  const frame = currentFrame(state);
  const newLocals = {
    ...frame.locals,
    [stmt.name]: createVibeValue(modelValue, { isConst: true, typeAnnotation: null }),
  };

  return {
    ...state,
    valueStack: newValueStack,
    // Set lastUsedModel if not already set (first model declaration)
    lastUsedModel: state.lastUsedModel ?? stmt.name,
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, locals: newLocals },
    ],
  };
}

/**
 * If statement - push condition and branch instruction.
 */
export function execIfStatement(state: RuntimeState, stmt: AST.IfStatement): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: stmt.condition, location: stmt.condition.location },
      { op: 'if_branch', consequent: stmt.consequent, alternate: stmt.alternate, location: stmt.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * For-in statement - push iterable evaluation and for_in_init.
 */
export function execForInStatement(state: RuntimeState, stmt: AST.ForInStatement): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: stmt.iterable, location: stmt.iterable.location },
      { op: 'for_in_init', stmt, location: stmt.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * While statement - evaluate condition and loop.
 */
export function execWhileStatement(state: RuntimeState, stmt: AST.WhileStatement): RuntimeState {
  const frame = currentFrame(state);
  const savedKeys = Object.keys(frame.locals);

  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: stmt.condition, location: stmt.condition.location },
      { op: 'while_init', stmt, savedKeys, location: stmt.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * If branch - decide based on lastResult.
 */
export function execIfBranch(
  state: RuntimeState,
  consequent: AST.BlockStatement,
  alternate?: AST.Statement | null
): RuntimeState {
  const condition = state.lastResult;

  if (requireBoolean(condition, 'if condition')) {
    return {
      ...state,
      instructionStack: [
        { op: 'exec_statement', stmt: consequent, location: consequent.location },
        ...state.instructionStack,
      ],
    };
  } else if (alternate) {
    return {
      ...state,
      instructionStack: [
        { op: 'exec_statement', stmt: alternate, location: alternate.location },
        ...state.instructionStack,
      ],
    };
  }

  return state;
}

/**
 * Block statement - push statements with exit_block cleanup.
 */
export function execBlockStatement(state: RuntimeState, stmt: AST.BlockStatement): RuntimeState {
  const frame = currentFrame(state);
  const savedKeys = Object.keys(frame.locals);

  // Push statements in order (we pop from front, so first statement first)
  const stmtInstructions = stmt.body
    .map((s) => ({ op: 'exec_statement' as const, stmt: s, location: s.location }));

  return {
    ...state,
    instructionStack: [
      ...stmtInstructions,
      { op: 'exit_block', savedKeys, location: stmt.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Enter block scope (placeholder for symmetry).
 */
export function execEnterBlock(state: RuntimeState, _savedKeys: string[]): RuntimeState {
  return state;
}

/**
 * Exit block scope - remove variables declared in block.
 * Before removing, await any pending async operations for those variables.
 */
export function execExitBlock(state: RuntimeState, savedKeys: string[], location?: SourceLocation): RuntimeState {
  const frame = currentFrame(state);
  const savedKeySet = new Set(savedKeys);

  // Find variables that will be removed (declared in this block)
  const pendingAsyncIds: string[] = [];
  for (const key of Object.keys(frame.locals)) {
    if (!savedKeySet.has(key)) {
      const variable = frame.locals[key];
      // Check if this variable has a pending async operation
      if (isVibeValue(variable) && variable.asyncOperationId) {
        const opId = variable.asyncOperationId;
        const operation = state.asyncOperations.get(opId);
        if (operation && (operation.status === 'pending' || operation.status === 'running')) {
          pendingAsyncIds.push(opId);
        }
      }
    }
  }

  // If there are pending async operations, await them before cleaning up
  if (pendingAsyncIds.length > 0) {
    return {
      ...state,
      status: 'awaiting_async',
      awaitingAsyncIds: pendingAsyncIds,
      instructionStack: [
        { op: 'exit_block', savedKeys, location: location ?? { line: 0, column: 0 } },
        ...state.instructionStack,
      ],
    };
  }

  // No pending async - proceed with cleanup
  const newLocals: Record<string, VibeValue> = {};
  for (const key of Object.keys(frame.locals)) {
    if (savedKeySet.has(key)) {
      newLocals[key] = frame.locals[key];
    }
  }

  return {
    ...state,
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, locals: newLocals },
    ],
  };
}

/**
 * Return statement - evaluate value and return.
 */
export function execReturnStatement(state: RuntimeState, stmt: AST.ReturnStatement): RuntimeState {
  if (stmt.value) {
    return {
      ...state,
      instructionStack: [
        { op: 'exec_expression', expr: stmt.value, location: stmt.value.location },
        { op: 'return_value', location: stmt.location },
        ...state.instructionStack,
      ],
    };
  }

  return execReturnValue({ ...state, lastResult: null });
}

/**
 * Return value - pop frame and skip to after pop_frame instruction.
 */
export function execReturnValue(state: RuntimeState): RuntimeState {
  const currentFrameRef = state.callStack[state.callStack.length - 1];
  const funcName = currentFrameRef?.name;

  // Validate return type if function has one
  let returnValue = state.lastResult;
  if (funcName && funcName !== 'main') {
    const func = state.functions[funcName] ?? getImportedVibeFunction(state, funcName);
    if (func?.returnType) {
      const { value: validatedValue } = validateAndCoerce(
        returnValue,
        func.returnType,
        `return value of ${funcName}`
      );
      returnValue = validatedValue;
    }
  }

  // Pop frame
  const newCallStack = state.callStack.slice(0, -1);

  if (newCallStack.length === 0) {
    return { ...state, status: 'completed', callStack: newCallStack, lastResult: returnValue };
  }

  // Find and skip past the pop_frame instruction
  let newInstructionStack = state.instructionStack;
  const popFrameIndex = newInstructionStack.findIndex((i) => i.op === 'pop_frame');
  if (popFrameIndex !== -1) {
    newInstructionStack = newInstructionStack.slice(popFrameIndex + 1);
  }

  return { ...state, callStack: newCallStack, instructionStack: newInstructionStack, lastResult: returnValue };
}

/**
 * Execute statements at index - sequential statement execution.
 */
export function execStatements(state: RuntimeState, stmts: AST.Statement[], index: number, location: SourceLocation): RuntimeState {
  if (index >= stmts.length) {
    return state;
  }

  const stmt = stmts[index];
  return {
    ...state,
    instructionStack: [
      { op: 'exec_statement', stmt, location: stmt.location },
      { op: 'exec_statements', stmts, index: index + 1, location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Statement dispatcher - routes to appropriate statement handler.
 */
export function execStatement(state: RuntimeState, stmt: AST.Statement): RuntimeState {
  switch (stmt.type) {
    case 'ImportDeclaration':
      // Imports are processed during module loading, skip at runtime
      return state;

    case 'ExportDeclaration':
      // Execute the underlying declaration
      return execStatement(state, stmt.declaration);

    case 'LetDeclaration':
      return execLetDeclaration(state, stmt);

    case 'ConstDeclaration':
      return execConstDeclaration(state, stmt);

    case 'DestructuringDeclaration':
      return execDestructuringDeclaration(state, stmt);

    case 'FunctionDeclaration':
      // Functions are already collected at init, nothing to do
      return state;

    case 'ToolDeclaration':
      // Register the tool at runtime
      return {
        ...state,
        instructionStack: [
          { op: 'exec_tool_declaration', decl: stmt, location: stmt.location },
          ...state.instructionStack,
        ],
      };

    case 'ModelDeclaration':
      return execModelDeclaration(state, stmt);

    case 'ReturnStatement':
      return execReturnStatement(state, stmt);

    case 'IfStatement':
      return execIfStatement(state, stmt);

    case 'ForInStatement':
      return execForInStatement(state, stmt);

    case 'WhileStatement':
      return execWhileStatement(state, stmt);

    case 'BlockStatement':
      return execBlockStatement(state, stmt);

    case 'ExpressionStatement':
      return {
        ...state,
        instructionStack: [
          { op: 'exec_expression', expr: stmt.expression, location: stmt.expression.location },
          ...state.instructionStack,
        ],
      };

    case 'AsyncStatement':
      // For now, async statements execute like regular expressions
      // True parallel execution is a future enhancement
      return {
        ...state,
        instructionStack: [
          { op: 'exec_expression', expr: stmt.expression, location: stmt.expression.location },
          ...state.instructionStack,
        ],
      };

    default:
      throw new Error(`Unknown statement type: ${(stmt as AST.Statement).type}`);
  }
}
