import * as AST from '../ast';
import type { RuntimeState, Instruction, Variable, ExecutionEntry, StackFrame } from './types';
import { currentFrame, createFrame } from './state';
import { buildLocalContext, buildGlobalContext } from './context';
import {
  getImportedValue,
  isImportedTsFunction,
  isImportedVibeFunction,
  getImportedVibeFunction,
  getImportedTsFunction,
} from './modules';

// Helper: Look up a variable by walking the scope chain
function lookupVariable(state: RuntimeState, name: string): { variable: Variable; frameIndex: number } | null {
  let frameIndex: number | null = state.callStack.length - 1;
  while (frameIndex !== null && frameIndex >= 0) {
    const frame: StackFrame = state.callStack[frameIndex];
    if (frame.locals[name]) {
      return { variable: frame.locals[name], frameIndex };
    }
    frameIndex = frame.parentFrameIndex;
  }
  return null;
}

// Get the next instruction that will be executed (or null if done/paused)
export function getNextInstruction(state: RuntimeState): Instruction | null {
  if (state.status !== 'running' || state.instructionStack.length === 0) {
    return null;
  }
  return state.instructionStack[0];
}

// Step N instructions (or until pause/complete)
export function stepN(state: RuntimeState, n: number): RuntimeState {
  let current = state;
  for (let i = 0; i < n && current.status === 'running'; i++) {
    current = step(current);
  }
  return current;
}

// Step until a condition is met (returns state where condition is true BEFORE executing)
// The predicate receives the state and can inspect getNextInstruction() to see what's coming
export function stepUntilCondition(
  state: RuntimeState,
  predicate: (state: RuntimeState, nextInstruction: Instruction | null) => boolean
): RuntimeState {
  let current = state;

  while (current.status === 'running') {
    const next = getNextInstruction(current);

    // Check if we should stop BEFORE executing this instruction
    if (predicate(current, next)) {
      return current;
    }

    // No more instructions
    if (!next) {
      return current;
    }

    current = step(current);
  }

  return current;
}

// Step until we're about to execute a specific statement type
export function stepUntilStatement(
  state: RuntimeState,
  statementType: AST.Statement['type']
): RuntimeState {
  return stepUntilCondition(state, (_state, next) => {
    if (next?.op === 'exec_statement') {
      return next.stmt.type === statementType;
    }
    return false;
  });
}

// Step until we're about to execute a specific instruction operation
export function stepUntilOp(
  state: RuntimeState,
  op: Instruction['op']
): RuntimeState {
  return stepUntilCondition(state, (_state, next) => next?.op === op);
}

// Execute a single instruction and return new state
export function step(state: RuntimeState): RuntimeState {
  // Don't step if not running
  if (state.status !== 'running') {
    return state;
  }

  // If no more instructions, we're done - rebuild context with final state
  if (state.instructionStack.length === 0) {
    return {
      ...state,
      status: 'completed',
      localContext: buildLocalContext(state),
      globalContext: buildGlobalContext(state),
    };
  }

  // Rebuild context BEFORE executing the instruction
  const stateWithContext: RuntimeState = {
    ...state,
    localContext: buildLocalContext(state),
    globalContext: buildGlobalContext(state),
  };

  // Pop next instruction
  const [instruction, ...restInstructions] = stateWithContext.instructionStack;
  const newState: RuntimeState = { ...stateWithContext, instructionStack: restInstructions };

  try {
    return executeInstruction(newState, instruction);
  } catch (error) {
    return {
      ...newState,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Run until we hit a pause point or complete
export function runUntilPause(state: RuntimeState): RuntimeState {
  let current = state;
  while (current.status === 'running' && current.instructionStack.length > 0) {
    current = step(current);
  }
  // Mark as completed if we ran out of instructions while running
  if (current.status === 'running' && current.instructionStack.length === 0) {
    return {
      ...current,
      status: 'completed',
      localContext: buildLocalContext(current),
      globalContext: buildGlobalContext(current),
    };
  }
  return current;
}

// Execute a single instruction
function executeInstruction(state: RuntimeState, instruction: Instruction): RuntimeState {
  switch (instruction.op) {
    case 'exec_statement':
      return execStatement(state, instruction.stmt);

    case 'exec_expression':
      return execExpression(state, instruction.expr);

    case 'exec_statements':
      return execStatements(state, instruction.stmts, instruction.index);

    case 'declare_var':
      return execDeclareVar(state, instruction.name, instruction.isConst, instruction.type);

    case 'assign_var':
      return execAssignVar(state, instruction.name);

    case 'call_function':
      return execCallFunction(state, instruction.funcName, instruction.argCount);

    case 'push_frame':
      return execPushFrame(state, instruction.name);

    case 'pop_frame':
      return execPopFrame(state);

    case 'return_value':
      return execReturnValue(state);

    case 'enter_block':
      return execEnterBlock(state, instruction.savedKeys);

    case 'exit_block':
      return execExitBlock(state, instruction.savedKeys);

    case 'ai_do':
      return execAIDo(state, instruction.model, instruction.context);

    case 'ai_ask':
      return execAIAsk(state, instruction.model, instruction.context);

    case 'ai_vibe':
      return execAIVibe(state, instruction.model, instruction.context);

    case 'ts_eval':
      return execTsEval(state, instruction.params, instruction.body);

    case 'call_imported_ts':
      // This is handled inline in execCallFunction for now
      // but keeping the instruction type for potential future use
      throw new Error('call_imported_ts should be handled in execCallFunction');

    case 'if_branch':
      return execIfBranch(state, instruction.consequent, instruction.alternate);

    case 'push_value':
      return execPushValue(state);

    case 'build_object':
      return execBuildObject(state, instruction.keys);

    case 'build_array':
      return execBuildArray(state, instruction.count);

    case 'collect_args':
      return execCollectArgs(state, instruction.count);

    case 'literal':
      return { ...state, lastResult: instruction.value };

    case 'interpolate_string':
      return execInterpolateString(state, instruction.template);

    case 'interpolate_template':
      return execInterpolateTemplate(state, instruction.template);

    default:
      throw new Error(`Unknown instruction: ${(instruction as Instruction).op}`);
  }
}

// Statement execution
function execStatement(state: RuntimeState, stmt: AST.Statement): RuntimeState {
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
      // Models are declarative config, store in locals
      return execModelDeclaration(state, stmt);

    case 'ReturnStatement':
      return execReturnStatement(state, stmt);

    case 'IfStatement':
      return execIfStatement(state, stmt);

    case 'BreakStatement':
      // TODO: implement loop break
      return state;

    case 'ContinueStatement':
      // TODO: implement loop continue
      return state;

    case 'BlockStatement':
      return execBlockStatement(state, stmt);

    case 'ExpressionStatement':
      // Push expression to be evaluated
      return {
        ...state,
        instructionStack: [
          { op: 'exec_expression', expr: stmt.expression },
          ...state.instructionStack,
        ],
      };

    default:
      throw new Error(`Unknown statement type: ${(stmt as AST.Statement).type}`);
  }
}

// Expression execution
function execExpression(state: RuntimeState, expr: AST.Expression): RuntimeState {
  switch (expr.type) {
    case 'StringLiteral':
      return {
        ...state,
        instructionStack: [
          { op: 'interpolate_string', template: expr.value },
          ...state.instructionStack,
        ],
      };

    case 'TemplateLiteral':
      return {
        ...state,
        instructionStack: [
          { op: 'interpolate_template', template: expr.value },
          ...state.instructionStack,
        ],
      };

    case 'BooleanLiteral':
      return { ...state, lastResult: expr.value };

    case 'ObjectLiteral':
      return execObjectLiteral(state, expr);

    case 'ArrayLiteral':
      return execArrayLiteral(state, expr);

    case 'Identifier':
      return execIdentifier(state, expr);

    case 'AssignmentExpression':
      return execAssignmentExpression(state, expr);

    case 'CallExpression':
      return execCallExpression(state, expr);

    case 'DoExpression':
      return execDoExpression(state, expr);

    case 'VibeExpression':
      return execVibeExpression(state, expr);

    case 'AskExpression':
      return execAskExpression(state, expr);

    case 'TsBlock':
      return execTsBlock(state, expr);

    default:
      throw new Error(`Unknown expression type: ${(expr as AST.Expression).type}`);
  }
}

// Let declaration
function execLetDeclaration(state: RuntimeState, stmt: AST.LetDeclaration): RuntimeState {
  if (stmt.initializer) {
    return {
      ...state,
      instructionStack: [
        { op: 'exec_expression', expr: stmt.initializer },
        { op: 'declare_var', name: stmt.name, isConst: false, type: stmt.typeAnnotation },
        ...state.instructionStack,
      ],
    };
  }

  // No initializer, declare with null
  return execDeclareVar(state, stmt.name, false, stmt.typeAnnotation, null);
}

// Const declaration
function execConstDeclaration(state: RuntimeState, stmt: AST.ConstDeclaration): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: stmt.initializer },
      { op: 'declare_var', name: stmt.name, isConst: true, type: stmt.typeAnnotation },
      ...state.instructionStack,
    ],
  };
}

// Helper: Extract string value from an expression (for model config)
function extractStringValue(expr: AST.Expression | null): string | null {
  if (!expr) return null;
  if (expr.type === 'StringLiteral') return expr.value;
  if (expr.type === 'Identifier') return expr.name;
  return null;
}

// Model declaration - store model config in locals
function execModelDeclaration(state: RuntimeState, stmt: AST.ModelDeclaration): RuntimeState {
  const modelValue = {
    __vibeModel: true,
    name: extractStringValue(stmt.config.modelName),
    apiKey: extractStringValue(stmt.config.apiKey),
    url: extractStringValue(stmt.config.url),
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

// Declare variable with value from lastResult
function execDeclareVar(
  state: RuntimeState,
  name: string,
  isConst: boolean,
  type: string | null,
  initialValue?: unknown
): RuntimeState {
  const frame = currentFrame(state);

  if (frame.locals[name]) {
    throw new Error(`Variable '${name}' is already declared`);
  }

  const value = initialValue !== undefined ? initialValue : state.lastResult;
  const { value: validatedValue, inferredType } = validateAndCoerce(value, type, name);

  // Use explicit type if provided, otherwise use inferred type
  const finalType = type ?? inferredType;

  const newLocals = {
    ...frame.locals,
    [name]: { value: validatedValue, isConst, typeAnnotation: finalType },
  };

  // Add variable to ordered entries for context tracking
  const newOrderedEntries = [...frame.orderedEntries, { kind: 'variable' as const, name }];

  const newState: RuntimeState = {
    ...state,
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, locals: newLocals, orderedEntries: newOrderedEntries },
    ],
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: isConst ? 'const_declaration' : 'let_declaration',
        details: { name, type, isConst },
        result: validatedValue,
      },
    ],
  };

  return newState;
}

// Assign variable with value from lastResult
function execAssignVar(state: RuntimeState, name: string): RuntimeState {
  // Walk scope chain to find the variable
  const found = lookupVariable(state, name);

  if (!found) {
    throw new Error(`ReferenceError: '${name}' is not defined`);
  }

  const { variable, frameIndex } = found;

  if (variable.isConst) {
    throw new Error(`TypeError: Cannot assign to constant '${name}'`);
  }

  const { value: validatedValue } = validateAndCoerce(state.lastResult, variable.typeAnnotation, name);

  const frame = state.callStack[frameIndex];
  const newLocals = {
    ...frame.locals,
    [name]: { ...variable, value: validatedValue },
  };

  // Update the correct frame in the call stack
  return {
    ...state,
    callStack: [
      ...state.callStack.slice(0, frameIndex),
      { ...frame, locals: newLocals },
      ...state.callStack.slice(frameIndex + 1),
    ],
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'assignment',
        details: { name },
        result: validatedValue,
      },
    ],
  };
}

// Return statement
function execReturnStatement(state: RuntimeState, stmt: AST.ReturnStatement): RuntimeState {
  if (stmt.value) {
    return {
      ...state,
      instructionStack: [
        { op: 'exec_expression', expr: stmt.value },
        { op: 'return_value' },
        ...state.instructionStack,
      ],
    };
  }

  return execReturnValue({ ...state, lastResult: null });
}

// Return value - pop frame and skip to after pop_frame instruction
function execReturnValue(state: RuntimeState): RuntimeState {
  // Get current frame to check return type
  const currentFrame = state.callStack[state.callStack.length - 1];
  const funcName = currentFrame?.name;

  // Validate return type if function has one
  let returnValue = state.lastResult;
  if (funcName && funcName !== 'main') {
    // Check local functions first, then imported vibe functions
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
    // Returning from main - program complete
    return { ...state, status: 'completed', callStack: newCallStack, lastResult: returnValue };
  }

  // Find and skip past the pop_frame instruction
  // This handles the case where return is used before function body ends
  let newInstructionStack = state.instructionStack;
  const popFrameIndex = newInstructionStack.findIndex((i) => i.op === 'pop_frame');
  if (popFrameIndex !== -1) {
    newInstructionStack = newInstructionStack.slice(popFrameIndex + 1);
  }

  return { ...state, callStack: newCallStack, instructionStack: newInstructionStack, lastResult: returnValue };
}

// If statement
function execIfStatement(state: RuntimeState, stmt: AST.IfStatement): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: stmt.condition },
      { op: 'if_branch', consequent: stmt.consequent, alternate: stmt.alternate },
      ...state.instructionStack,
    ],
  };
}

// If branch - decide based on lastResult
function execIfBranch(
  state: RuntimeState,
  consequent: AST.BlockStatement,
  alternate?: AST.Statement | null
): RuntimeState {
  const condition = state.lastResult;

  if (isTruthy(condition)) {
    return {
      ...state,
      instructionStack: [
        { op: 'exec_statement', stmt: consequent },
        ...state.instructionStack,
      ],
    };
  } else if (alternate) {
    return {
      ...state,
      instructionStack: [
        { op: 'exec_statement', stmt: alternate },
        ...state.instructionStack,
      ],
    };
  }

  return state;
}

// Block statement
function execBlockStatement(state: RuntimeState, stmt: AST.BlockStatement): RuntimeState {
  const frame = currentFrame(state);
  const savedKeys = Object.keys(frame.locals);

  // Push statements in order (we pop from front, so first statement first)
  const stmtInstructions = stmt.body
    .map((s) => ({ op: 'exec_statement' as const, stmt: s }));

  return {
    ...state,
    instructionStack: [
      ...stmtInstructions,
      { op: 'exit_block', savedKeys },
      ...state.instructionStack,
    ],
  };
}

// Enter block scope (not really needed if we use exit_block)
function execEnterBlock(state: RuntimeState, savedKeys: string[]): RuntimeState {
  return state;
}

// Exit block scope - remove variables declared in block
function execExitBlock(state: RuntimeState, savedKeys: string[]): RuntimeState {
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

// Identifier - get variable value
function execIdentifier(state: RuntimeState, expr: AST.Identifier): RuntimeState {
  // Walk the scope chain to find the variable
  const found = lookupVariable(state, expr.name);
  if (found) {
    return { ...state, lastResult: found.variable.value };
  }

  // Check if it's a local function
  if (state.functions[expr.name]) {
    return { ...state, lastResult: { __vibeFunction: true, name: expr.name } };
  }

  // Check if it's an imported TS function
  if (isImportedTsFunction(state, expr.name)) {
    return { ...state, lastResult: { __vibeImportedTsFunction: true, name: expr.name } };
  }

  // Check if it's an imported Vibe function
  if (isImportedVibeFunction(state, expr.name)) {
    return { ...state, lastResult: { __vibeImportedVibeFunction: true, name: expr.name } };
  }

  // Check if it's any other imported value
  const importedValue = getImportedValue(state, expr.name);
  if (importedValue !== undefined) {
    return { ...state, lastResult: importedValue };
  }

  throw new Error(`ReferenceError: '${expr.name}' is not defined`);
}

// Assignment expression
function execAssignmentExpression(state: RuntimeState, expr: AST.AssignmentExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.value },
      { op: 'assign_var', name: expr.target.name },
      ...state.instructionStack,
    ],
  };
}

// Object literal
function execObjectLiteral(state: RuntimeState, expr: AST.ObjectLiteral): RuntimeState {
  if (expr.properties.length === 0) {
    return { ...state, lastResult: {} };
  }

  // Evaluate properties in order, push to value stack, then build
  const keys = expr.properties.map((p) => p.key);
  const propInstructions = expr.properties.flatMap((p) => [
    { op: 'exec_expression' as const, expr: p.value },
    { op: 'push_value' as const },
  ]);

  return {
    ...state,
    instructionStack: [
      ...propInstructions,
      { op: 'build_object', keys },
      ...state.instructionStack,
    ],
  };
}

// Array literal
function execArrayLiteral(state: RuntimeState, expr: AST.ArrayLiteral): RuntimeState {
  if (expr.elements.length === 0) {
    return { ...state, lastResult: [] };
  }

  const elemInstructions = expr.elements.flatMap((e) => [
    { op: 'exec_expression' as const, expr: e },
    { op: 'push_value' as const },
  ]);

  return {
    ...state,
    instructionStack: [
      ...elemInstructions,
      { op: 'build_array', count: expr.elements.length },
      ...state.instructionStack,
    ],
  };
}

// Push lastResult to value stack
function execPushValue(state: RuntimeState): RuntimeState {
  return {
    ...state,
    valueStack: [...state.valueStack, state.lastResult],
  };
}

// Build object from value stack
function execBuildObject(state: RuntimeState, keys: string[]): RuntimeState {
  const values = state.valueStack.slice(-keys.length);
  const obj: Record<string, unknown> = {};

  for (let i = 0; i < keys.length; i++) {
    obj[keys[i]] = values[i];
  }

  return {
    ...state,
    valueStack: state.valueStack.slice(0, -keys.length),
    lastResult: obj,
  };
}

// Build array from value stack
function execBuildArray(state: RuntimeState, count: number): RuntimeState {
  const elements = state.valueStack.slice(-count);

  return {
    ...state,
    valueStack: state.valueStack.slice(0, -count),
    lastResult: elements,
  };
}

// Collect args from value stack for function call
function execCollectArgs(state: RuntimeState, count: number): RuntimeState {
  const args = state.valueStack.slice(-count);

  return {
    ...state,
    valueStack: state.valueStack.slice(0, -count),
    lastResult: args,
  };
}

// Call expression
function execCallExpression(state: RuntimeState, expr: AST.CallExpression): RuntimeState {
  // Evaluate callee and all arguments, then call
  const argInstructions = expr.arguments.flatMap((arg) => [
    { op: 'exec_expression' as const, expr: arg },
    { op: 'push_value' as const },
  ]);

  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.callee },
      { op: 'push_value' },  // Save callee to value stack
      ...argInstructions,
      { op: 'call_function', funcName: '', argCount: expr.arguments.length },
      ...state.instructionStack,
    ],
  };
}

// Execute function call
function execCallFunction(state: RuntimeState, _funcName: string, argCount: number): RuntimeState {
  // Pop args and callee from value stack
  const args = state.valueStack.slice(-(argCount));
  const callee = state.valueStack[state.valueStack.length - argCount - 1];
  const newValueStack = state.valueStack.slice(0, -(argCount + 1));

  // Handle local Vibe function
  if (typeof callee === 'object' && callee !== null && '__vibeFunction' in callee) {
    const funcName = (callee as { __vibeFunction: boolean; name: string }).name;
    const func = state.functions[funcName];

    if (!func) {
      throw new Error(`ReferenceError: '${funcName}' is not defined`);
    }

    // Create new frame with parameters
    // Parent frame is 0 (global scope) for top-level functions
    // This enables lexical scoping - function can access global variables
    const newFrame = createFrame(funcName, 0);
    for (let i = 0; i < func.params.length; i++) {
      const param = func.params[i];
      const argValue = args[i] ?? null;

      // Validate argument against parameter type (type is REQUIRED)
      const { value: validatedValue } = validateAndCoerce(
        argValue,
        param.typeAnnotation,
        param.name
      );

      newFrame.locals[param.name] = {
        value: validatedValue,
        isConst: false,
        typeAnnotation: param.typeAnnotation,
      };
      // Add parameter to ordered entries for context tracking
      newFrame.orderedEntries.push({ kind: 'variable' as const, name: param.name });
    }

    // Push function body statements (in order, we pop from front)
    const bodyInstructions = func.body.body
      .map((s) => ({ op: 'exec_statement' as const, stmt: s }));

    return {
      ...state,
      valueStack: newValueStack,
      callStack: [...state.callStack, newFrame],
      instructionStack: [
        ...bodyInstructions,
        { op: 'pop_frame' },
        ...state.instructionStack,
      ],
      lastResult: null,
    };
  }

  // Handle imported TS function
  if (typeof callee === 'object' && callee !== null && '__vibeImportedTsFunction' in callee) {
    const funcName = (callee as { __vibeImportedTsFunction: boolean; name: string }).name;

    return {
      ...state,
      valueStack: newValueStack,
      status: 'awaiting_ts',
      pendingImportedTsCall: {
        funcName,
        args,
      },
      executionLog: [
        ...state.executionLog,
        {
          timestamp: Date.now(),
          instructionType: 'imported_ts_call_request',
          details: { funcName, argCount },
        },
      ],
    };
  }

  // Handle imported Vibe function
  if (typeof callee === 'object' && callee !== null && '__vibeImportedVibeFunction' in callee) {
    const funcName = (callee as { __vibeImportedVibeFunction: boolean; name: string }).name;
    const func = getImportedVibeFunction(state, funcName);

    if (!func) {
      throw new Error(`ReferenceError: '${funcName}' is not defined`);
    }

    // Create new frame with parameters - same as local Vibe function
    const newFrame = createFrame(funcName, 0);
    for (let i = 0; i < func.params.length; i++) {
      const param = func.params[i];
      const argValue = args[i] ?? null;

      // Validate argument against parameter type (type is REQUIRED)
      const { value: validatedValue } = validateAndCoerce(
        argValue,
        param.typeAnnotation,
        param.name
      );

      newFrame.locals[param.name] = {
        value: validatedValue,
        isConst: false,
        typeAnnotation: param.typeAnnotation,
      };
      newFrame.orderedEntries.push({ kind: 'variable' as const, name: param.name });
    }

    // Push function body statements
    const bodyInstructions = func.body.body
      .map((s) => ({ op: 'exec_statement' as const, stmt: s }));

    return {
      ...state,
      valueStack: newValueStack,
      callStack: [...state.callStack, newFrame],
      instructionStack: [
        ...bodyInstructions,
        { op: 'pop_frame' },
        ...state.instructionStack,
      ],
      lastResult: null,
    };
  }

  throw new Error('TypeError: Cannot call non-function');
}

// Push frame
function execPushFrame(state: RuntimeState, name: string): RuntimeState {
  return {
    ...state,
    callStack: [...state.callStack, createFrame(name)],
  };
}

// Pop frame
function execPopFrame(state: RuntimeState): RuntimeState {
  return {
    ...state,
    callStack: state.callStack.slice(0, -1),
  };
}

// Execute statements at index
function execStatements(state: RuntimeState, stmts: AST.Statement[], index: number): RuntimeState {
  if (index >= stmts.length) {
    return state;
  }

  return {
    ...state,
    instructionStack: [
      { op: 'exec_statement', stmt: stmts[index] },
      { op: 'exec_statements', stmts, index: index + 1 },
      ...state.instructionStack,
    ],
  };
}

// Helper: Extract model name from expression
function extractModelName(expr: AST.Expression): string {
  if (expr.type === 'Identifier') return expr.name;
  throw new Error('Model must be an identifier');
}

// Do expression - AI call
function execDoExpression(state: RuntimeState, expr: AST.DoExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.prompt },
      { op: 'ai_do', model: extractModelName(expr.model), context: expr.context },
      ...state.instructionStack,
    ],
  };
}

// Ask expression - user input
function execAskExpression(state: RuntimeState, expr: AST.AskExpression): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.prompt },
      { op: 'ai_ask', model: extractModelName(expr.model), context: expr.context },
      ...state.instructionStack,
    ],
  };
}

// Vibe expression - code generation (no model/context - uses defaults)
function execVibeExpression(state: RuntimeState, expr: AST.VibeExpression): RuntimeState {
  const defaultContext: AST.ContextSpecifier = {
    type: 'ContextSpecifier',
    kind: 'default',
    location: expr.location,
  };
  return {
    ...state,
    instructionStack: [
      { op: 'exec_expression', expr: expr.prompt },
      { op: 'ai_vibe', model: 'default', context: defaultContext },
      ...state.instructionStack,
    ],
  };
}

// AI Do - pause for AI response
function execAIDo(state: RuntimeState, model: string, context: AST.ContextSpecifier): RuntimeState {
  const prompt = String(state.lastResult);
  const contextData = getContextForAI(state, context);

  // Add prompt to ordered entries in current frame
  const frame = currentFrame(state);
  const newOrderedEntries = [...frame.orderedEntries, { kind: 'prompt' as const, aiType: 'do' as const, prompt }];

  return {
    ...state,
    status: 'awaiting_ai',
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, orderedEntries: newOrderedEntries },
    ],
    pendingAI: {
      type: 'do',
      prompt,
      model,
      context: contextData,
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ai_do_request',
        details: { prompt, model, contextKind: context.kind },
      },
    ],
  };
}

// AI Ask - pause for user input
function execAIAsk(state: RuntimeState, model: string, context: AST.ContextSpecifier): RuntimeState {
  const prompt = String(state.lastResult);
  const contextData = getContextForAI(state, context);

  // Add prompt to ordered entries in current frame
  const frame = currentFrame(state);
  const newOrderedEntries = [...frame.orderedEntries, { kind: 'prompt' as const, aiType: 'ask' as const, prompt }];

  return {
    ...state,
    status: 'awaiting_user',
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, orderedEntries: newOrderedEntries },
    ],
    pendingAI: {
      type: 'ask',
      prompt,
      model,
      context: contextData,
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ai_ask_request',
        details: { prompt, model, contextKind: context.kind },
      },
    ],
  };
}

// AI Vibe - pause for code generation
function execAIVibe(state: RuntimeState, model: string, context: AST.ContextSpecifier): RuntimeState {
  const prompt = String(state.lastResult);
  const contextData = getContextForAI(state, context);

  // Add prompt to ordered entries in current frame
  const frame = currentFrame(state);
  const newOrderedEntries = [...frame.orderedEntries, { kind: 'prompt' as const, aiType: 'vibe' as const, prompt }];

  return {
    ...state,
    status: 'awaiting_ai',
    callStack: [
      ...state.callStack.slice(0, -1),
      { ...frame, orderedEntries: newOrderedEntries },
    ],
    pendingAI: {
      type: 'vibe',
      prompt,
      model,
      context: contextData,
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ai_vibe_request',
        details: { prompt, model, contextKind: context.kind },
      },
    ],
  };
}

// String interpolation
function execInterpolateString(state: RuntimeState, template: string): RuntimeState {
  const result = template.replace(/\{(\w+)\}/g, (_, name) => {
    // Walk scope chain to find variable
    const found = lookupVariable(state, name);
    if (found) {
      return String(found.variable.value);
    }
    return `{${name}}`;
  });

  return { ...state, lastResult: result };
}

// Template literal interpolation (${varName} syntax)
function execInterpolateTemplate(state: RuntimeState, template: string): RuntimeState {
  const result = template.replace(/\$\{(\w+)\}/g, (_, name) => {
    // Walk scope chain to find variable
    const found = lookupVariable(state, name);
    if (found) {
      return String(found.variable.value);
    }
    return `\${${name}}`;
  });

  return { ...state, lastResult: result };
}

// Get context for AI based on context specifier
function getContextForAI(state: RuntimeState, context: AST.ContextSpecifier): unknown[] {
  switch (context.kind) {
    case 'local':
      // Current frame's execution log only
      return state.executionLog.filter((_, i) => {
        // Filter to just recent entries (simplified - could be smarter)
        return i >= state.executionLog.length - 10;
      });

    case 'default':
      // All execution history
      return state.executionLog;

    case 'variable':
      // Use variable value as context
      if (context.variable) {
        const frame = currentFrame(state);
        const variable = frame.locals[context.variable];
        if (variable && Array.isArray(variable.value)) {
          return variable.value as unknown[];
        }
      }
      return [];

    default:
      return state.executionLog;
  }
}

// Type validation and coercion
// Returns { value, inferredType } where inferredType is set when no explicit type was given
function validateAndCoerce(
  value: unknown,
  type: string | null,
  varName: string
): { value: unknown; inferredType: string | null } {
  // If no type annotation, infer from JavaScript type
  if (!type) {
    if (typeof value === 'string') {
      return { value, inferredType: 'text' };
    }
    if (typeof value === 'object' && value !== null) {
      return { value, inferredType: 'json' };
    }
    // For other types (number, boolean, null, undefined), no type inference
    return { value, inferredType: null };
  }

  // Validate text type - must be a string
  if (type === 'text') {
    if (typeof value !== 'string') {
      throw new Error(`TypeError: Variable '${varName}': expected text (string), got ${typeof value}`);
    }
    return { value, inferredType: 'text' };
  }

  // Validate json type - must be object or array
  if (type === 'json') {
    let result = value;

    // If string, try to parse as JSON
    if (typeof value === 'string') {
      try {
        result = JSON.parse(value);
      } catch {
        throw new Error(`TypeError: Variable '${varName}': invalid JSON string`);
      }
    }

    // Validate the result is an object or array (not a primitive)
    if (typeof result !== 'object' || result === null) {
      throw new Error(`TypeError: Variable '${varName}': expected JSON (object or array), got ${typeof value}`);
    }
    return { value: result, inferredType: 'json' };
  }

  // For other types (prompt, etc.), accept as-is
  return { value, inferredType: type };
}

// TypeScript block - push ts_eval instruction
function execTsBlock(state: RuntimeState, expr: AST.TsBlock): RuntimeState {
  return {
    ...state,
    instructionStack: [
      { op: 'ts_eval', params: expr.params, body: expr.body },
      ...state.instructionStack,
    ],
  };
}

// TypeScript eval - pause for async evaluation
function execTsEval(state: RuntimeState, params: string[], body: string): RuntimeState {
  // Look up parameter values from scope
  const paramValues = params.map((name) => {
    const found = lookupVariable(state, name);
    if (!found) {
      throw new Error(`ReferenceError: '${name}' is not defined`);
    }
    return found.variable.value;
  });

  return {
    ...state,
    status: 'awaiting_ts',
    pendingTS: {
      params,
      body,
      paramValues,
    },
    executionLog: [
      ...state.executionLog,
      {
        timestamp: Date.now(),
        instructionType: 'ts_eval_request',
        details: { params, body: body.slice(0, 100) },  // Truncate body for log
      },
    ],
  };
}

// Truthiness check
function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}
