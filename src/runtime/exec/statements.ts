// Statement execution helpers: declarations, control flow

import * as AST from '../../ast';
import type { SourceLocation } from '../../errors';
import type { RuntimeState, Variable } from '../types';
import { currentFrame } from '../state';
import { requireBoolean, validateAndCoerce } from '../validation';
import { execDeclareVar } from './variables';
import { getImportedVibeFunction } from '../modules';

/**
 * Let declaration - push instructions for initializer.
 */
export function execLetDeclaration(state: RuntimeState, stmt: AST.LetDeclaration): RuntimeState {
  if (stmt.initializer) {
    return {
      ...state,
      instructionStack: [
        { op: 'exec_expression', expr: stmt.initializer, location: stmt.initializer.location },
        { op: 'declare_var', name: stmt.name, isConst: false, type: stmt.typeAnnotation, location: stmt.location },
        ...state.instructionStack,
      ],
    };
  }

  // No initializer, declare with null
  return execDeclareVar(state, stmt.name, false, stmt.typeAnnotation, null);
}

/**
 * Const declaration - push instructions for initializer.
 */
export function execConstDeclaration(state: RuntimeState, stmt: AST.ConstDeclaration): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: stmt.initializer, location: stmt.initializer.location },
      { op: 'declare_var', name: stmt.name, isConst: true, type: stmt.typeAnnotation, location: stmt.location },
      ...state.instructionStack,
    ],
  };
}

/**
 * Extract string value from an expression (for model config).
 */
export function extractStringValue(expr: AST.Expression | null): string | null {
  if (!expr) return null;
  if (expr.type === 'StringLiteral') return expr.value;
  if (expr.type === 'Identifier') return expr.name;
  return null;
}

/**
 * Extract number value from an expression (for model config).
 */
export function extractNumberValue(expr: AST.Expression | null): number | null {
  if (!expr) return null;
  if (expr.type === 'NumberLiteral') return expr.value;
  return null;
}

/**
 * Model declaration - store model config in locals.
 */
export function execModelDeclaration(state: RuntimeState, stmt: AST.ModelDeclaration): RuntimeState {
  const modelValue = {
    __vibeModel: true,
    name: extractStringValue(stmt.config.modelName),
    apiKey: extractStringValue(stmt.config.apiKey),
    url: extractStringValue(stmt.config.url),
    provider: extractStringValue(stmt.config.provider),
    maxRetriesOnError: extractNumberValue(stmt.config.maxRetriesOnError),
    thinkingLevel: extractStringValue(stmt.config.thinkingLevel),
  };

  const frame = currentFrame(state);
  const newLocals = {
    ...frame.locals,
    [stmt.name]: { value: modelValue, isConst: true, typeAnnotation: 'model' },
  };

  return {
    ...state,
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
 */
export function execExitBlock(state: RuntimeState, savedKeys: string[]): RuntimeState {
  const frame = currentFrame(state);
  const savedKeySet = new Set(savedKeys);

  const newLocals: Record<string, Variable> = {};
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

    case 'FunctionDeclaration':
      // Functions are already collected at init, nothing to do
      return state;

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

    default:
      throw new Error(`Unknown statement type: ${(stmt as AST.Statement).type}`);
  }
}
