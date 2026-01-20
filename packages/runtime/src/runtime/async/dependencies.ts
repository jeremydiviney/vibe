/**
 * Dependency detection for async operations.
 * Scans expressions for variable references and builds execution waves.
 */

import type * as AST from '../../ast';
import type { AsyncOperation, AsyncWave, ContextEntry } from '../types';

/**
 * Extracts all variable names referenced in an expression.
 * Used to detect dependencies between async operations.
 */
export function getReferencedVariables(expr: AST.Expression): string[] {
  const variables: string[] = [];

  function visit(node: AST.Expression): void {
    switch (node.type) {
      case 'Identifier':
        variables.push(node.name);
        break;

      case 'BinaryExpression':
        visit(node.left);
        visit(node.right);
        break;

      case 'UnaryExpression':
        visit(node.operand);
        break;

      case 'CallExpression':
        visit(node.callee);
        node.arguments.forEach(visit);
        break;

      case 'MemberExpression':
        visit(node.object);
        break;

      case 'IndexExpression':
        visit(node.object);
        visit(node.index);
        break;

      case 'SliceExpression':
        visit(node.object);
        if (node.start) visit(node.start);
        if (node.end) visit(node.end);
        break;

      case 'ArrayLiteral':
        node.elements.forEach(visit);
        break;

      case 'ObjectLiteral':
        node.properties.forEach((prop) => visit(prop.value));
        break;

      case 'RangeExpression':
        visit(node.start);
        visit(node.end);
        break;

      case 'AssignmentExpression':
        visit(node.value);
        break;

      case 'VibeExpression':
        visit(node.prompt);
        if (node.model) visit(node.model);
        break;

      case 'TsBlock':
        // TsBlock params are variable references
        variables.push(...node.params);
        break;

      case 'TemplateLiteral':
        // Extract variables from template interpolations like {varName}
        const matches = node.value.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g);
        for (const match of matches) {
          variables.push(match[1]);
        }
        break;

      case 'StringLiteral':
        // Extract variables from {varName} and !{varName} interpolation in strings
        const stringMatches = node.value.matchAll(/!?\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g);
        for (const match of stringMatches) {
          variables.push(match[1]);
        }
        break;

      // These literals don't reference variables
      case 'NumberLiteral':
      case 'BooleanLiteral':
      case 'NullLiteral':
        break;
    }
  }

  visit(expr);
  return [...new Set(variables)]; // Remove duplicates
}

/**
 * Detects which async operations the given expression depends on.
 * Returns the IDs of async operations that must complete before this expression can be evaluated.
 */
export function detectAsyncDependencies(
  expr: AST.Expression,
  asyncVarToOpId: Map<string, string>,
  pendingAsyncIds: Set<string>
): string[] {
  const referencedVars = getReferencedVariables(expr);
  const dependencies: string[] = [];

  for (const varName of referencedVars) {
    const opId = asyncVarToOpId.get(varName);
    if (opId && pendingAsyncIds.has(opId)) {
      dependencies.push(opId);
    }
  }

  return dependencies;
}

/**
 * Builds execution waves from a list of async operations.
 * Operations with no pending dependencies go in the same wave.
 * Uses topological sort to determine execution order.
 */
export function buildExecutionWaves(
  operations: AsyncOperation[],
  contextSnapshot: ContextEntry[]
): AsyncWave[] {
  const waves: AsyncWave[] = [];
  const remaining = new Set(operations.map((op) => op.id));
  const completed = new Set<string>();

  // Map from operation ID to operation
  const opById = new Map(operations.map((op) => [op.id, op]));

  // Map from variable name to operation ID
  const varToOp = new Map<string, string>();
  for (const op of operations) {
    if (op.variableName) {
      varToOp.set(op.variableName, op.id);
    }
  }

  let waveId = 0;
  while (remaining.size > 0) {
    const waveOps: string[] = [];

    for (const opId of remaining) {
      const op = opById.get(opId)!;

      // Check if all dependencies are completed (or not in our operation set)
      const depsReady = op.dependencies.every((depVar) => {
        const depOpId = varToOp.get(depVar);
        return !depOpId || completed.has(depOpId) || !remaining.has(depOpId);
      });

      if (depsReady) {
        waveOps.push(opId);
      }
    }

    if (waveOps.length === 0 && remaining.size > 0) {
      // Circular dependency detected - should be caught at semantic analysis
      throw new Error('Circular dependency detected in async operations');
    }

    // Create the wave
    const wave: AsyncWave = {
      id: waveId,
      operationIds: waveOps,
      contextSnapshot: [...contextSnapshot], // Copy context at wave creation
      startTime: 0, // Will be set when wave executes
    };
    waves.push(wave);

    // Mark operations as completed for next iteration
    for (const opId of waveOps) {
      remaining.delete(opId);
      completed.add(opId);
    }

    waveId++;
  }

  return waves;
}

/**
 * Gets variable names that an instruction references.
 * Used to check if an instruction needs to await pending async operations.
 */
export function getInstructionDependencies(
  instruction: { op: string; [key: string]: unknown },
  asyncVarToOpId: Map<string, string>,
  pendingAsyncIds: Set<string>
): string[] {
  const dependencies: string[] = [];

  // Check expression-based instructions
  if ('expr' in instruction && instruction.expr) {
    const expr = instruction.expr as AST.Expression;
    const deps = detectAsyncDependencies(expr, asyncVarToOpId, pendingAsyncIds);
    dependencies.push(...deps);
  }

  // Check statement-based instructions
  if ('stmt' in instruction && instruction.stmt) {
    const stmt = instruction.stmt as AST.Statement;
    const stmtDeps = getStatementDependencies(stmt, asyncVarToOpId, pendingAsyncIds);
    dependencies.push(...stmtDeps);
  }

  return [...new Set(dependencies)];
}

/**
 * Gets async operation IDs that a statement depends on.
 */
function getStatementDependencies(
  stmt: AST.Statement,
  asyncVarToOpId: Map<string, string>,
  pendingAsyncIds: Set<string>
): string[] {
  const dependencies: string[] = [];

  switch (stmt.type) {
    case 'LetDeclaration':
    case 'ConstDeclaration':
      if (stmt.initializer) {
        dependencies.push(...detectAsyncDependencies(stmt.initializer, asyncVarToOpId, pendingAsyncIds));
      }
      break;

    case 'DestructuringDeclaration':
      dependencies.push(...detectAsyncDependencies(stmt.initializer, asyncVarToOpId, pendingAsyncIds));
      break;

    case 'ExpressionStatement':
      dependencies.push(...detectAsyncDependencies(stmt.expression, asyncVarToOpId, pendingAsyncIds));
      break;

    case 'IfStatement':
      dependencies.push(...detectAsyncDependencies(stmt.condition, asyncVarToOpId, pendingAsyncIds));
      break;

    case 'WhileStatement':
      dependencies.push(...detectAsyncDependencies(stmt.condition, asyncVarToOpId, pendingAsyncIds));
      break;

    case 'ForInStatement':
      dependencies.push(...detectAsyncDependencies(stmt.iterable, asyncVarToOpId, pendingAsyncIds));
      break;

    case 'ReturnStatement':
      if (stmt.value) {
        dependencies.push(...detectAsyncDependencies(stmt.value, asyncVarToOpId, pendingAsyncIds));
      }
      break;

    case 'AsyncStatement':
      dependencies.push(...detectAsyncDependencies(stmt.expression, asyncVarToOpId, pendingAsyncIds));
      break;

    // Declarations that don't have expression dependencies
    case 'ImportDeclaration':
    case 'ExportDeclaration':
    case 'ModelDeclaration':
    case 'FunctionDeclaration':
    case 'ToolDeclaration':
    case 'BlockStatement':
      break;
  }

  return dependencies;
}
