/**
 * Semantic Analyzer Visitors
 *
 * Statement and expression visitor functions for the semantic analyzer.
 */
import * as AST from '../ast';
import type { SourceLocation } from '../errors';
import type { AnalyzerContext, AnalyzerState } from './analyzer-context';
import { isValidType } from './types';
import { isCoreFunction } from '../runtime/stdlib/core';
import { extractFunctionSignature } from './ts-signatures';
import { resolve, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { parse } from '../parser/parse';
import {
  validateModelConfig,
  validateToolDeclaration,
  validateTypeAnnotation,
  validateLiteralType,
  validateConditionType,
  validateAsyncExpression,
  validateContextMode,
  validateTsBlock,
  checkToolCall,
  checkCallArguments,
  checkPromptType,
  checkModelType,
  checkContextVariable,
  validateStringInterpolation,
  getExpressionType,
} from './analyzer-validators';

/**
 * Visitor interface for recursive visiting.
 */
export interface AnalyzerVisitor {
  visitStatement(node: AST.Statement): void;
  visitExpression(node: AST.Expression): void;
}

/**
 * Creates statement and expression visitors for the analyzer.
 */
export function createVisitors(
  ctx: AnalyzerContext,
  state: AnalyzerState
): AnalyzerVisitor {
  // Helper to get expression type with context
  const getExprType = (expr: AST.Expression) => getExpressionType(ctx, expr);

  // Helper for validateLiteralType with context
  const validateLitType = (expr: AST.Expression, type: string, location: SourceLocation) => {
    validateLiteralType(ctx, expr, type, location, getExprType);
  };

  // Validate that all elements in an array literal have consistent types
  function validateArrayLiteralTypes(node: AST.ArrayLiteral): void {
    if (node.elements.length < 2) {
      return; // Need at least 2 elements to have a mismatch
    }

    const firstType = getExprType(node.elements[0]);
    if (!firstType) {
      return; // Can't determine type of first element
    }

    for (let i = 1; i < node.elements.length; i++) {
      const elemType = getExprType(node.elements[i]);
      if (!elemType) {
        continue; // Skip elements with unknown types
      }
      if (elemType !== firstType) {
        ctx.error(
          `Mixed array types: element ${i} is ${elemType} but expected ${firstType}`,
          node.elements[i].location ?? node.location
        );
        return; // Report first mismatch only
      }
    }
  }

  // Check if an expression is definitely an array (by type or AST structure)
  function isArrayExpression(expr: AST.Expression, exprType: string | null): boolean {
    if (exprType?.endsWith('[]')) {
      return true;
    }
    // Array literals and slices are always arrays
    if (expr.type === 'ArrayLiteral' || expr.type === 'SliceExpression') {
      return true;
    }
    return false;
  }

  // Validate array concatenation types (guard clause style)
  function validateArrayConcatenation(node: AST.BinaryExpression): void {
    if (node.operator !== '+') {
      return;
    }

    const leftType = getExprType(node.left);
    const rightType = getExprType(node.right);
    const leftIsArray = isArrayExpression(node.left, leftType);
    const rightIsArray = isArrayExpression(node.right, rightType);

    // Not an array operation - nothing to check
    if (!leftIsArray && !rightIsArray) {
      return;
    }

    // One is array, one is not - error
    if (!leftIsArray || !rightIsArray) {
      ctx.error('Cannot concatenate array with non-array using +', node.location);
      return;
    }

    // Both arrays but different types - error
    if (leftType && rightType && leftType !== rightType) {
      ctx.error(
        `Cannot concatenate ${leftType} with ${rightType}: array types must match`,
        node.location
      );
    }
  }

  function visitStatement(node: AST.Statement): void {
    switch (node.type) {
      case 'ImportDeclaration':
        visitImportDeclaration(node);
        break;

      case 'ExportDeclaration':
        if (node.declaration.type === 'LetDeclaration') {
          ctx.error(
            `Cannot export mutable variable '${node.declaration.name}'. Only constants can be exported.`,
            node.location
          );
        }
        visitStatement(node.declaration);
        break;

      case 'LetDeclaration':
        visitVariableDeclaration(node, 'variable');
        break;

      case 'ConstDeclaration':
        visitVariableDeclaration(node, 'constant');
        break;

      case 'DestructuringDeclaration':
        visitDestructuringDeclaration(node);
        break;

      case 'ModelDeclaration':
        ctx.declare(node.name, 'model', node.location);
        validateModelConfig(ctx, node, visitExpression);
        break;

      case 'FunctionDeclaration':
        if (!state.atTopLevel) {
          ctx.error('Functions can only be declared at global scope', node.location);
        }
        ctx.declare(node.name, 'function', node.location, {
          paramCount: node.params.length,
          paramTypes: node.params.map(p => p.vibeType),
          returnType: node.returnType,
        });
        visitFunction(node);
        break;

      case 'ReturnStatement':
        if (!state.inFunction) {
          ctx.error('return outside of function', node.location);
        }
        if (node.value) {
          // If returning from a prompt-typed function, validate string literals as prompt context
          const isPromptReturn = state.currentFunctionReturnType === 'prompt';
          if (isPromptReturn && (node.value.type === 'StringLiteral' || node.value.type === 'TemplateLiteral')) {
            validateStringInterpolation(ctx, node.value.value, true, node.value.location);
          } else {
            visitExpression(node.value);
          }
        }
        break;

      case 'BreakStatement':
        if (state.loopDepth === 0) {
          ctx.error('break outside of loop', node.location);
        }
        break;

      case 'ThrowStatement':
        // Visit the message expression for any nested checks
        visitExpression(node.message);
        break;

      case 'IfStatement':
        visitExpression(node.condition);
        validateConditionType(ctx, node.condition, 'if', getExprType);
        visitStatement(node.consequent);
        if (node.alternate) visitStatement(node.alternate);
        break;

      case 'ForInStatement':
        visitExpression(node.iterable);
        ctx.symbols.enterScope();
        ctx.declare(node.variable, 'variable', node.location, { vibeType: null });
        state.loopDepth++;
        visitStatement(node.body);
        state.loopDepth--;
        ctx.symbols.exitScope();
        if (node.contextMode) validateContextMode(ctx, node.contextMode, node.location);
        break;

      case 'WhileStatement':
        visitExpression(node.condition);
        validateConditionType(ctx, node.condition, 'while', getExprType);
        ctx.symbols.enterScope();
        state.loopDepth++;
        visitStatement(node.body);
        state.loopDepth--;
        ctx.symbols.exitScope();
        if (node.contextMode) validateContextMode(ctx, node.contextMode, node.location);
        break;

      case 'BlockStatement': {
        const wasAtTopLevel = state.atTopLevel;
        state.atTopLevel = false;
        ctx.symbols.enterScope();
        for (const stmt of node.body) {
          visitStatement(stmt);
        }
        ctx.symbols.exitScope();
        state.atTopLevel = wasAtTopLevel;
        break;
      }

      case 'ExpressionStatement':
        visitExpression(node.expression);
        break;

      case 'ToolDeclaration':
        if (!state.atTopLevel) {
          ctx.error('Tools can only be declared at global scope', node.location);
        }
        ctx.declare(node.name, 'tool', node.location, {
          paramCount: node.params.length,
          paramTypes: node.params.map(p => p.vibeType),
          returnType: node.returnType,
        });
        validateToolDeclaration(ctx, node);
        visitTool(node);
        break;

      case 'TypeDeclaration':
        visitTypeDeclaration(node);
        break;

      case 'AsyncStatement':
        validateAsyncExpression(ctx, node.expression, node.location);
        visitExpression(node.expression);
        break;
    }
  }

  function visitExpression(node: AST.Expression): void {
    switch (node.type) {
      case 'Identifier':
        if (!ctx.symbols.lookup(node.name) && !isCoreFunction(node.name)) {
          ctx.error(`'${node.name}' is not defined`, node.location);
        }
        break;

      case 'StringLiteral':
        validateStringInterpolation(ctx, node.value, false, node.location);
        break;

      case 'TemplateLiteral':
        validateStringInterpolation(ctx, node.value, false, node.location);
        break;

      case 'BooleanLiteral':
      case 'NumberLiteral':
      case 'NullLiteral':
        break;

      case 'ObjectLiteral':
        node.properties.forEach((prop) => visitExpression(prop.value));
        break;

      case 'ArrayLiteral':
        node.elements.forEach((element) => visitExpression(element));
        validateArrayLiteralTypes(node);
        break;

      case 'AssignmentExpression':
        visitAssignmentExpression(node);
        break;

      case 'VibeExpression':
        visitVibePrompt(node.prompt);
        checkPromptType(ctx, node.prompt);
        if (node.model) checkModelType(ctx, node.model, visitExpression);
        if (node.context) checkContextVariable(ctx, node.context);
        break;

      case 'CallExpression':
        visitExpression(node.callee);
        node.arguments.forEach((arg) => visitExpression(arg));
        checkCallArguments(ctx, node, getExprType, validateLitType);
        checkToolCall(ctx, node);
        // Validate push argument matches array element type
        if (node.callee.type === 'MemberExpression' && node.callee.property === 'push' && node.arguments.length === 1) {
          const arrType = getExprType(node.callee.object);
          if (arrType?.endsWith('[]')) {
            const elementType = arrType.slice(0, -2);
            const argType = getExprType(node.arguments[0]);
            if (argType && elementType && argType !== elementType) {
              ctx.error(`Cannot push ${argType} to ${arrType}`, node.arguments[0].location);
            }
          }
        }
        break;

      case 'TsBlock':
        validateTsBlock(ctx, node);
        break;

      case 'RangeExpression':
        visitExpression(node.start);
        visitExpression(node.end);
        if (node.start.type === 'NumberLiteral' && node.end.type === 'NumberLiteral') {
          if (node.start.value > node.end.value) {
            ctx.error(`Range start (${node.start.value}) must be <= end (${node.end.value})`, node.location);
          }
        }
        break;

      case 'BinaryExpression':
        visitExpression(node.left);
        visitExpression(node.right);
        validateArrayConcatenation(node);
        break;

      case 'UnaryExpression':
        visitExpression(node.operand);
        break;

      case 'IndexExpression':
        visitExpression(node.object);
        visitExpression(node.index);
        break;

      case 'SliceExpression':
        visitExpression(node.object);
        if (node.start) visitExpression(node.start);
        if (node.end) visitExpression(node.end);
        break;

      case 'MemberExpression':
        visitExpression(node.object);
        break;
    }
  }

  function visitVibePrompt(node: AST.Expression): void {
    if (node.type === 'StringLiteral') {
      validateStringInterpolation(ctx, node.value, true, node.location);
      return;
    }
    if (node.type === 'TemplateLiteral') {
      validateStringInterpolation(ctx, node.value, true, node.location);
      return;
    }
    visitExpression(node);
  }

  function visitVariableDeclaration(
    node: AST.LetDeclaration | AST.ConstDeclaration,
    kind: 'variable' | 'constant'
  ): void {
    const isNullInitializer = node.initializer?.type === 'NullLiteral';

    if (isNullInitializer) {
      if (kind === 'constant') {
        ctx.error(`Cannot initialize const with null - const values cannot be reassigned`, node.location);
      } else if (!node.vibeType) {
        ctx.error(`Cannot infer type from null - provide a type annotation: let ${node.name}: <type> = null`, node.location);
      }
    }

    // Empty array requires explicit type annotation
    const isEmptyArray = node.initializer?.type === 'ArrayLiteral' && node.initializer.elements.length === 0;
    if (isEmptyArray && !node.vibeType) {
      ctx.error(
        `Cannot infer type from empty array - provide a type annotation: let ${node.name}: <type>[] = []`,
        node.location
      );
    }

    if (node.isAsync && node.initializer) {
      validateAsyncExpression(ctx, node.initializer, node.location);
    }

    if (node.initializer?.type === 'VibeExpression' && !node.vibeType) {
      ctx.error(
        `Type cannot be inferred from AI call, must assign to explicitly typed variable: ${kind === 'constant' ? 'const' : 'let'} ${node.name}: <type> = ...`,
        node.location
      );
    }

    if (node.vibeType === 'model' && kind === 'variable') {
      ctx.error(`Variables with type 'model' must be declared with 'const', not 'let'`, node.location);
    }

    let effectiveType = node.vibeType;
    if (!effectiveType && node.initializer) {
      effectiveType = getExprType(node.initializer);
    }

    // CRITICAL: Write inferred type back to AST node so runtime can use it
    // After semantic analysis, vibeType is ALWAYS populated (except 'unknown' for json member access)
    if (!node.vibeType && effectiveType) {
      node.vibeType = effectiveType as AST.VibeType;
    }

    ctx.declare(node.name, kind, node.location, { vibeType: effectiveType });
    if (node.vibeType) {
      validateTypeAnnotation(ctx, node.vibeType, node.location);
    }
    if (node.initializer) {
      const isPromptType = node.vibeType === 'prompt';
      if (isPromptType && (node.initializer.type === 'StringLiteral' || node.initializer.type === 'TemplateLiteral')) {
        validateStringInterpolation(ctx, node.initializer.value, true, node.initializer.location);
      } else {
        visitExpression(node.initializer);
      }
      if (node.vibeType) {
        validateLitType(node.initializer, node.vibeType, node.location);
      }
    }
  }

  function visitDestructuringDeclaration(node: AST.DestructuringDeclaration): void {
    for (const field of node.fields) {
      if (!isValidType(field.type)) {
        ctx.error(`Invalid type '${field.type}' for field '${field.name}'`, node.location);
      }
    }

    // Allow destructuring from:
    // - VibeExpression (do/vibe AI calls)
    // - Identifier (json variables)
    // - CallExpression (function calls returning json)
    const allowedTypes = ['VibeExpression', 'Identifier', 'CallExpression'];
    if (!allowedTypes.includes(node.initializer.type)) {
      ctx.error(
        'Destructuring assignment requires a do/vibe expression, json variable, or function call',
        node.location
      );
    }

    if (node.isAsync) {
      validateAsyncExpression(ctx, node.initializer, node.location);
    }

    const seenNames = new Set<string>();
    const uniqueFields: typeof node.fields = [];
    for (const field of node.fields) {
      if (seenNames.has(field.name)) {
        ctx.error(`Duplicate field '${field.name}' in destructuring pattern`, node.location);
      } else {
        seenNames.add(field.name);
        uniqueFields.push(field);
      }
    }

    visitExpression(node.initializer);

    const declarationKind = node.isConst ? 'constant' : 'variable';
    for (const field of uniqueFields) {
      ctx.declare(field.name, declarationKind, node.location, { vibeType: field.type });
    }
  }

  function visitAssignmentExpression(node: AST.AssignmentExpression): void {
    const name = node.target.name;
    const symbol = ctx.symbols.lookup(name);

    if (!symbol) {
      ctx.error(`'${name}' is not defined`, node.target.location);
    } else if (symbol.kind === 'constant') {
      ctx.error(`Cannot reassign constant '${name}'`, node.location);
    } else if (symbol.kind === 'function') {
      ctx.error(`Cannot reassign function '${name}'`, node.location);
    } else if (symbol.kind === 'model') {
      ctx.error(`Cannot reassign model '${name}'`, node.location);
    } else if (symbol.kind === 'import') {
      ctx.error(`Cannot reassign imported '${name}'`, node.location);
    }

    visitExpression(node.value);
  }

  function visitImportDeclaration(node: AST.ImportDeclaration): void {
    if (!state.atTopLevel) {
      ctx.error('Imports can only be at global scope', node.location);
      return;
    }

    // Check for system module imports
    const isSystemModule = node.source === 'system/utils' || node.source === 'system/tools';
    const isToolImport = node.source === 'system/tools';

    // Extract TypeScript signatures for non-system TS imports
    if (node.sourceType === 'ts' && ctx.basePath && !isSystemModule) {
      const sourcePath = resolve(dirname(ctx.basePath), node.source);
      for (const spec of node.specifiers) {
        try {
          const sig = extractFunctionSignature(sourcePath, spec.imported);
          if (sig) {
            ctx.tsImportSignatures.set(spec.local, sig);
          }
        } catch {
          // Skip if can't extract signature
        }
      }
    }

    // Validate Vibe imports - check that imported symbols exist and extract types
    let vibeExports: Map<string, VibeExportInfo> | null = null;
    if (node.sourceType === 'vibe' && ctx.basePath) {
      vibeExports = getVibeExportInfo(ctx.basePath, node.source);
    }

    for (const spec of node.specifiers) {
      const existing = ctx.symbols.lookup(spec.local);
      if (existing) {
        if (existing.kind === 'import' || existing.kind === 'tool') {
          ctx.error(
            `'${spec.local}' is already imported from another module`,
            node.location
          );
        } else {
          ctx.error(
            `Import '${spec.local}' conflicts with existing ${existing.kind}`,
            node.location
          );
        }
      } else {
        // Validate that imported name exists in source file (for Vibe imports)
        if (vibeExports !== null && !vibeExports.has(spec.imported)) {
          ctx.error(
            `'${spec.imported}' is not exported from '${node.source}'`,
            node.location
          );
        }

        // Tool bundles (allTools, readonlyTools, safeTools) are imports, individual tools are 'tool' kind
        const toolBundles = ['allTools', 'readonlyTools', 'safeTools'];
        const importKind = isToolImport && !toolBundles.includes(spec.local) ? 'tool' : 'import';

        // For Vibe function imports, register with full type info so return types flow through
        const exportInfo = vibeExports?.get(spec.imported);
        if (exportInfo?.kind === 'function') {
          ctx.declare(spec.local, 'function', node.location, {
            paramCount: exportInfo.paramCount,
            paramTypes: exportInfo.paramTypes,
            returnType: exportInfo.returnType,
          });
        } else if (exportInfo?.kind === 'model') {
          ctx.declare(spec.local, importKind, node.location, { vibeType: 'model' });
        } else {
          ctx.declare(spec.local, importKind, node.location);
        }
      }
    }
  }

  /**
   * Info about an exported symbol from a Vibe file
   */
  interface VibeExportInfo {
    kind: 'function' | 'variable' | 'model';
    // For functions:
    paramCount?: number;
    paramTypes?: string[];
    returnType?: string | null;
    // For variables:
    vibeType?: string | null;
  }

  /**
   * Get export info from a Vibe source file.
   * Returns a map of name -> export info, or null if file cannot be read.
   */
  function getVibeExportInfo(basePath: string, importSource: string): Map<string, VibeExportInfo> | null {
    try {
      const sourcePath = resolve(dirname(basePath), importSource);
      if (!existsSync(sourcePath)) {
        return null; // File doesn't exist - let runtime handle this error
      }

      const sourceContent = readFileSync(sourcePath, 'utf-8');
      const sourceAst = parse(sourceContent, { file: sourcePath });

      const exports = new Map<string, VibeExportInfo>();
      for (const statement of sourceAst.body) {
        if (statement.type !== 'ExportDeclaration') continue;
        const decl = statement.declaration;

        switch (decl.type) {
          case 'FunctionDeclaration':
            exports.set(decl.name, {
              kind: 'function',
              paramCount: decl.params.length,
              paramTypes: decl.params.map(p => p.vibeType),
              returnType: decl.returnType,
            });
            break;
          case 'ModelDeclaration':
            exports.set(decl.name, { kind: 'model' });
            break;
          case 'ConstDeclaration':
          case 'LetDeclaration':
            exports.set(decl.name, {
              kind: 'variable',
              vibeType: decl.vibeType,
            });
            break;
        }
      }

      return exports;
    } catch {
      return null; // Parse error or other issue - skip validation
    }
  }

  /**
   * Check if a statement always returns or throws on all code paths.
   * Used to verify functions with return types exit properly.
   *
   * Note: In Vibe, if a function/tool body ends with an expression statement,
   * that expression's value is implicitly returned.
   */
  function alwaysReturnsOrThrows(stmt: AST.Statement, isLastInBlock: boolean = false): boolean {
    switch (stmt.type) {
      case 'ReturnStatement':
      case 'ThrowStatement':
        return true;

      case 'ExpressionStatement':
        // An expression at the end of a function/tool body is an implicit return
        return isLastInBlock;

      case 'IfStatement':
        // Must have else branch and both branches must return
        if (!stmt.alternate) {
          return false;
        }
        return alwaysReturnsOrThrows(stmt.consequent, isLastInBlock) &&
               alwaysReturnsOrThrows(stmt.alternate, isLastInBlock);

      case 'BlockStatement':
        // Check if any statement in the block guarantees return/throw
        // For the last statement, also consider implicit returns
        for (let i = 0; i < stmt.body.length; i++) {
          const s = stmt.body[i];
          const isLast = i === stmt.body.length - 1;
          if (alwaysReturnsOrThrows(s, isLast && isLastInBlock)) {
            return true;
          }
        }
        return false;

      case 'ForInStatement':
      case 'WhileStatement':
        // Loops don't guarantee execution (might iterate 0 times)
        return false;

      default:
        return false;
    }
  }

  function visitFunction(node: AST.FunctionDeclaration): void {
    const wasInFunction = state.inFunction;
    const prevReturnType = state.currentFunctionReturnType;
    state.inFunction = true;
    state.currentFunctionReturnType = node.returnType;
    ctx.symbols.enterScope();

    for (const param of node.params) {
      validateTypeAnnotation(ctx, param.vibeType, node.location);
      ctx.declare(param.name, 'parameter', node.location, { vibeType: param.vibeType });
    }

    if (node.returnType) {
      validateTypeAnnotation(ctx, node.returnType, node.location);
    }

    visitStatement(node.body);

    // Check that typed functions always return or throw
    if (node.returnType && !alwaysReturnsOrThrows(node.body, true)) {
      ctx.error(
        `Function '${node.name}' has return type '${node.returnType}' but not all code paths return or throw`,
        node.location
      );
    }

    ctx.symbols.exitScope();
    state.inFunction = wasInFunction;
    state.currentFunctionReturnType = prevReturnType;
  }

  function visitTool(node: AST.ToolDeclaration): void {
    const wasInFunction = state.inFunction;
    const prevReturnType = state.currentFunctionReturnType;
    state.inFunction = true;
    state.currentFunctionReturnType = node.returnType;
    ctx.symbols.enterScope();

    for (const param of node.params) {
      ctx.declare(param.name, 'parameter', node.location, { vibeType: param.vibeType });
    }

    visitStatement(node.body);

    // Tools always have a return type - check that all code paths return or throw
    if (!alwaysReturnsOrThrows(node.body, true)) {
      ctx.error(
        `Tool '${node.name}' has return type '${node.returnType}' but not all code paths return or throw`,
        node.location
      );
    }

    ctx.symbols.exitScope();
    state.inFunction = wasInFunction;
    state.currentFunctionReturnType = prevReturnType;
  }

  function visitTypeDeclaration(node: AST.TypeDeclaration): void {
    // Type declarations can only be at top level
    if (!state.atTopLevel) {
      ctx.error('Type declarations can only be at global scope', node.location);
    }

    // Validate field types
    validateStructuralTypeFields(node.structure.fields, node.location);

    // Register in symbol table
    ctx.declare(node.name, 'type', node.location, {
      vibeType: node.name,
    });

    // Register in type registry
    ctx.typeRegistry.register(node.name, node.structure);
  }

  function validateStructuralTypeFields(fields: AST.StructuralTypeField[], location: SourceLocation): void {
    const seenNames = new Set<string>();

    for (const field of fields) {
      // Check for duplicate field names
      if (seenNames.has(field.name)) {
        ctx.error(`Duplicate field '${field.name}' in type definition`, location);
        continue;
      }
      seenNames.add(field.name);

      // Validate field type (if not a nested type)
      if (!field.nestedType) {
        const baseType = field.type.replace(/\[\]/g, '');
        const isBuiltIn = ['text', 'json', 'boolean', 'number', 'prompt'].includes(baseType);
        const isKnownType = ctx.symbols.lookup(baseType) !== undefined;
        const isInRegistry = ctx.typeRegistry.has(baseType);

        // Type might be forward-referenced (declared later in file)
        // We'll do a second pass or rely on runtime for now
        // For MVP, just check built-in types are valid
        if (!isBuiltIn && baseType !== 'object') {
          // Named type reference - will be validated at use site
          // This allows forward references within the same file
        }
      }

      // Recursively validate nested types
      if (field.nestedType) {
        validateStructuralTypeFields(field.nestedType.fields, location);
      }
    }
  }

  return { visitStatement, visitExpression };
}
