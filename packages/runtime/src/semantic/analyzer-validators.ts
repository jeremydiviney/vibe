/**
 * Semantic Analyzer Validators
 *
 * Validation functions for the semantic analyzer.
 * Each function takes an AnalyzerContext and performs specific validation.
 */
import * as AST from '../ast';
import type { SourceLocation } from '../errors';
import type { AnalyzerContext } from './analyzer-context';
import { isValidType, typesCompatible, isValidJson, getBaseType } from './types';
import { ESCAPED_LBRACE, ESCAPED_RBRACE, ESCAPED_BANG_LBRACE } from '../parser/visitor/helpers';
import { isCoreFunction } from '../runtime/stdlib/core';
import { checkTsBlockTypes, inferTsBlockReturnType } from './ts-block-checker';
import { tsTypeToVibe, isVibeTypeCompatibleWithTs } from './ts-types';
import type { TsFunctionSignature } from './ts-signatures';

// ============================================================================
// Model and Tool Validation
// ============================================================================

/**
 * Validates model declaration configuration.
 */
export function validateModelConfig(
  ctx: AnalyzerContext,
  node: AST.ModelDeclaration,
  visitExpression: (node: AST.Expression) => void
): void {
  const config = node.config;
  const requiredFields = ['name', 'apiKey', 'url'];
  const optionalFields = ['provider', 'maxRetriesOnError', 'thinkingLevel', 'tools'];
  const validFields = [...requiredFields, ...optionalFields];
  const provided = new Set(config.providedFields);

  // Check for missing required fields
  for (const field of requiredFields) {
    if (!provided.has(field)) {
      ctx.error(`Model '${node.name}' is missing required field '${field}'`, node.location);
    }
  }

  // Check for unknown fields
  for (const field of config.providedFields) {
    if (!validFields.includes(field)) {
      ctx.error(`Model '${node.name}' has unknown field '${field}'`, node.location);
    }
  }

  // Validate provider is one of the allowed values
  if (config.provider) {
    if (config.provider.type === 'StringLiteral') {
      const validProviders = ['anthropic', 'openai', 'google'];
      if (!validProviders.includes(config.provider.value)) {
        ctx.error(
          `Invalid provider '${config.provider.value}'. Must be: ${validProviders.join(', ')}`,
          config.provider.location
        );
      }
    }
    visitExpression(config.provider);
  }

  // Validate maxRetriesOnError is a non-negative number
  if (config.maxRetriesOnError) {
    if (config.maxRetriesOnError.type === 'NumberLiteral') {
      if (config.maxRetriesOnError.value < 0 || !Number.isInteger(config.maxRetriesOnError.value)) {
        ctx.error(
          `maxRetriesOnError must be a non-negative integer, got ${config.maxRetriesOnError.value}`,
          config.maxRetriesOnError.location
        );
      }
    }
    visitExpression(config.maxRetriesOnError);
  }

  // Visit field expressions (check for undefined variables, etc.)
  if (config.modelName) visitExpression(config.modelName);
  if (config.apiKey) visitExpression(config.apiKey);
  if (config.url) visitExpression(config.url);
}

/**
 * Validates tool declaration.
 */
export function validateToolDeclaration(ctx: AnalyzerContext, node: AST.ToolDeclaration): void {
  // Validate @param decorators reference actual parameters
  if (node.paramDecorators) {
    const paramNames = new Set(node.params.map(p => p.name));
    for (const decoratorName of node.paramDecorators) {
      if (!paramNames.has(decoratorName)) {
        ctx.error(
          `@param '${decoratorName}' does not match any parameter in tool '${node.name}'. ` +
          `Valid parameters: ${node.params.map(p => p.name).join(', ') || '(none)'}`,
          node.location
        );
      }
    }
  }

  // Validate parameter type annotations (allow both Vibe types and imported types)
  for (const param of node.params) {
    const baseType = param.typeAnnotation.replace(/\[\]$/, '');
    const isVibeType = ['text', 'json', 'boolean', 'number', 'prompt'].includes(baseType);
    if (!isVibeType) {
      const symbol = ctx.symbols.lookup(baseType);
      if (!symbol) {
        ctx.error(
          `Unknown type '${baseType}' in tool parameter '${param.name}'`,
          node.location
        );
      }
    }
  }

  // Validate return type if present
  if (node.returnType) {
    const baseType = node.returnType.replace(/\[\]$/, '');
    const isVibeType = ['text', 'json', 'boolean', 'number', 'prompt'].includes(baseType);
    if (!isVibeType) {
      const symbol = ctx.symbols.lookup(baseType);
      if (!symbol) {
        ctx.error(
          `Unknown return type '${baseType}' in tool '${node.name}'`,
          node.location
        );
      }
    }
  }
}

// ============================================================================
// Type Validation
// ============================================================================

/**
 * Validates a type annotation is valid.
 */
export function validateTypeAnnotation(ctx: AnalyzerContext, type: string, location: SourceLocation): void {
  if (!isValidType(type)) {
    ctx.error(`Unknown type '${getBaseType(type)}'`, location);
  }
}

/**
 * Validates a JSON literal string.
 */
export function validateJsonLiteral(ctx: AnalyzerContext, value: string, location: SourceLocation): void {
  if (!isValidJson(value)) {
    ctx.error(`Invalid JSON literal`, location);
  }
}

/**
 * Validates that a condition expression is boolean.
 */
export function validateConditionType(
  ctx: AnalyzerContext,
  expr: AST.Expression,
  conditionContext: 'if' | 'while',
  getExpressionType: (expr: AST.Expression) => string | null
): void {
  const exprType = getExpressionType(expr);
  if (exprType && exprType !== 'boolean') {
    ctx.error(`${conditionContext} condition must be boolean, got ${exprType}`, expr.location);
  }
}

/**
 * Validates that an expression is compatible with its type annotation.
 */
export function validateLiteralType(
  ctx: AnalyzerContext,
  expr: AST.Expression,
  type: string,
  location: SourceLocation,
  getExpressionType: (expr: AST.Expression) => string | null
): void {
  // Handle array types
  if (type.endsWith('[]')) {
    if (expr.type === 'ArrayLiteral') {
      const elementType = type.slice(0, -2);
      for (const element of expr.elements) {
        validateLiteralType(ctx, element, elementType, element.location, getExpressionType);
      }
    }
    return;
  }

  // json type cannot be an array literal - use json[] for arrays
  if (type === 'json' && expr.type === 'ArrayLiteral') {
    ctx.error(`json type expects an object, not an array. Use json[] for arrays.`, location);
    return;
  }

  // Get the source type from the expression
  const sourceType = getExpressionType(expr);
  if (!sourceType) {
    // Can't determine type at compile time
    if (type === 'json' && expr.type === 'StringLiteral') {
      validateJsonLiteral(ctx, expr.value, location);
    }
    return;
  }

  // Check type compatibility
  if (!typesCompatible(sourceType, type)) {
    ctx.error(`Type error: cannot assign ${sourceType} to ${type}`, location);
  }

  // Additional JSON validation for string literals
  if (type === 'json' && expr.type === 'StringLiteral') {
    validateJsonLiteral(ctx, expr.value, location);
  }
}

/**
 * Validates that an async expression is a single async-capable operation.
 */
export function validateAsyncExpression(ctx: AnalyzerContext, expr: AST.Expression, location: SourceLocation): void {
  const validTypes = ['VibeExpression', 'TsBlock', 'CallExpression'];
  if (!validTypes.includes(expr.type)) {
    ctx.error(
      `async declarations require a single do, vibe, ts block, or function call`,
      location
    );
  }
}

/**
 * Validates compress context mode arguments.
 */
export function validateContextMode(ctx: AnalyzerContext, mode: AST.ContextMode, location: SourceLocation): void {
  if (mode === 'forget' || mode === 'verbose') return;

  const { arg1, arg2 } = mode.compress;

  if (arg1 && arg1.kind === 'identifier') {
    const sym = ctx.symbols.lookup(arg1.name);
    if (!sym) {
      ctx.error(`compress argument '${arg1.name}' is not declared`, location);
    } else if (arg2) {
      const isPromptType = sym.kind === 'constant' && sym.typeAnnotation === 'prompt';
      const isTextType = sym.typeAnnotation === 'text' || sym.typeAnnotation === 'prompt';
      if (!isPromptType && !isTextType) {
        ctx.error(
          `compress first argument '${arg1.name}' must be prompt type when two arguments provided, got ${sym.typeAnnotation ?? sym.kind}`,
          location
        );
      }
    } else {
      const isModelType = sym.kind === 'model' || (sym.kind === 'constant' && sym.typeAnnotation === 'model');
      const isPromptType = sym.kind === 'constant' && sym.typeAnnotation === 'prompt';
      const isTextType = sym.typeAnnotation === 'text' || sym.typeAnnotation === 'prompt';
      if (!isModelType && !isPromptType && !isTextType) {
        ctx.error(
          `compress argument '${arg1.name}' must be prompt or model type, got ${sym.typeAnnotation ?? sym.kind}`,
          location
        );
      }
    }
  }

  if (arg2 && arg2.kind === 'identifier') {
    const sym = ctx.symbols.lookup(arg2.name);
    if (!sym) {
      ctx.error(`compress model '${arg2.name}' is not declared`, location);
    } else {
      const isModelType = sym.kind === 'model' || (sym.kind === 'constant' && sym.typeAnnotation === 'model');
      if (!isModelType) {
        ctx.error(
          `compress second argument '${arg2.name}' must be model type, got ${sym.typeAnnotation ?? sym.kind}`,
          location
        );
      }
    }
  }
}

// ============================================================================
// TypeScript Validation
// ============================================================================

/**
 * Validates a call to an imported TypeScript function.
 */
export function validateTsCall(
  ctx: AnalyzerContext,
  node: AST.CallExpression,
  sig: TsFunctionSignature,
  getExpressionType: (expr: AST.Expression) => string | null
): void {
  // Check argument count
  const requiredParams = sig.params.filter(p => !p.optional).length;
  if (node.arguments.length < requiredParams) {
    ctx.error(
      `Function '${sig.name}' requires ${requiredParams} argument${requiredParams === 1 ? '' : 's'}, got ${node.arguments.length}`,
      node.location
    );
  }
  if (node.arguments.length > sig.params.length) {
    ctx.error(
      `Function '${sig.name}' accepts at most ${sig.params.length} argument${sig.params.length === 1 ? '' : 's'}, got ${node.arguments.length}`,
      node.location
    );
  }

  // Check argument types
  for (let i = 0; i < node.arguments.length && i < sig.params.length; i++) {
    const arg = node.arguments[i];
    const argType = getExpressionType(arg);
    const paramTsType = sig.params[i].tsType;

    if (!argType) continue;

    if (!isVibeTypeCompatibleWithTs(argType, paramTsType)) {
      ctx.error(
        `Argument ${i + 1} of '${sig.name}': expected ${paramTsType}, got ${argType}`,
        arg.location
      );
    }
  }
}

/**
 * Validates a ts() block by checking parameter references and type-checking the body.
 */
export function validateTsBlock(ctx: AnalyzerContext, node: AST.TsBlock): void {
  const params: Array<{ name: string; vibeType: string | null }> = [];
  for (const paramName of node.params) {
    const symbol = ctx.symbols.lookup(paramName);
    if (!symbol) {
      ctx.error(`'${paramName}' is not defined`, node.location);
      continue;
    }
    params.push({
      name: paramName,
      vibeType: symbol.typeAnnotation ?? null,
    });
  }

  const tsErrors = checkTsBlockTypes(params, node.body, node.location);
  for (const err of tsErrors) {
    ctx.error(err.message, err.location);
  }
}

// ============================================================================
// Call Validation
// ============================================================================

/**
 * Check that we're not calling a tool directly.
 */
export function checkToolCall(ctx: AnalyzerContext, node: AST.CallExpression): void {
  if (node.callee.type !== 'Identifier') return;

  const symbol = ctx.symbols.lookup(node.callee.name);
  if (symbol?.kind === 'tool') {
    ctx.error(
      `Cannot call tool '${node.callee.name}' directly. Tools can only be used by AI models via the tools array in model declarations.`,
      node.location
    );
  }
}

/**
 * Check that call arguments match the function's parameter types.
 */
export function checkCallArguments(
  ctx: AnalyzerContext,
  node: AST.CallExpression,
  getExpressionType: (expr: AST.Expression) => string | null,
  validateLiteralTypeFn: (expr: AST.Expression, type: string, location: SourceLocation) => void
): void {
  if (node.callee.type !== 'Identifier') return;
  const calleeName = node.callee.name;

  // Check if it's a TS import - validate against TS signature
  const tsSig = ctx.tsImportSignatures.get(calleeName);
  if (tsSig) {
    validateTsCall(ctx, node, tsSig, getExpressionType);
    return;
  }

  // Otherwise, check against Vibe function signature
  const funcSymbol = ctx.symbols.lookup(calleeName);
  if (!funcSymbol || funcSymbol.kind !== 'function') return;
  if (!funcSymbol.paramTypes) return;

  // Check each argument against corresponding parameter type
  for (let i = 0; i < node.arguments.length && i < funcSymbol.paramTypes.length; i++) {
    const arg = node.arguments[i];
    const expectedType = funcSymbol.paramTypes[i];
    if (expectedType) {
      validateLiteralTypeFn(arg, expectedType, arg.location);
    }
  }
}

// ============================================================================
// Prompt and Context Validation
// ============================================================================

/**
 * Validates that prompt parameters are string literals or text/prompt typed variables.
 */
export function checkPromptType(ctx: AnalyzerContext, node: AST.Expression): void {
  if (node.type !== 'Identifier') return;

  const sym = ctx.symbols.lookup(node.name);
  if (!sym) return;

  if (sym.kind === 'model') {
    ctx.error(`Cannot use model '${node.name}' as prompt`, node.location);
  } else if (sym.kind === 'function') {
    ctx.error(`Cannot use function '${node.name}' as prompt`, node.location);
  } else if (sym.typeAnnotation === 'json') {
    ctx.error(`Cannot use json typed variable '${node.name}' as prompt`, node.location);
  }
}

/**
 * Validates the model type in a vibe expression.
 */
export function checkModelType(
  ctx: AnalyzerContext,
  node: AST.Expression,
  visitExpression: (node: AST.Expression) => void
): void {
  if (node.type === 'Identifier') {
    const sym = ctx.symbols.lookup(node.name);
    if (!sym) {
      ctx.error(`'${node.name}' is not defined`, node.location);
    } else if (sym.kind !== 'model') {
      const isModelParam = sym.kind === 'parameter' && sym.typeAnnotation === 'model';
      if (!isModelParam) {
        ctx.error(`Expected model, got ${sym.kind} '${node.name}'`, node.location);
      }
    }
  } else {
    visitExpression(node);
  }
}

/**
 * Validates the context variable in a vibe expression.
 */
export function checkContextVariable(ctx: AnalyzerContext, context: AST.ContextSpecifier): void {
  if (context.kind === 'variable' && context.variable) {
    if (!ctx.symbols.lookup(context.variable)) {
      ctx.error(`'${context.variable}' is not defined`, context.location);
    }
  }
}

// ============================================================================
// String Interpolation Validation
// ============================================================================

/** Pattern to match interpolation syntax */
const INTERPOLATION_PATTERN = /(!?)\{(\w+(?:\.\w+|\[\d+\]|\[\d*:\d*\])*)\}/g;

/**
 * Validates string interpolation references.
 */
export function validateStringInterpolation(
  ctx: AnalyzerContext,
  value: string,
  isPromptContext: boolean,
  location: SourceLocation
): void {
  // Skip escaped placeholders
  const testValue = value
    .replace(new RegExp(ESCAPED_LBRACE, 'g'), '')
    .replace(new RegExp(ESCAPED_RBRACE, 'g'), '')
    .replace(new RegExp(ESCAPED_BANG_LBRACE, 'g'), '');

  // Reset regex state
  INTERPOLATION_PATTERN.lastIndex = 0;

  let match;
  while ((match = INTERPOLATION_PATTERN.exec(testValue)) !== null) {
    const [, bang, path] = match;
    const isExpansion = bang === '!';
    const varName = path.split(/[.\[]/)[0];

    const symbol = ctx.symbols.lookup(varName);
    if (!symbol && !isCoreFunction(varName)) {
      ctx.error(`'${varName}' is not defined`, location);
      continue;
    }

    if (!isPromptContext && isExpansion) {
      ctx.error(
        `Expansion syntax !{${path}} is only valid in prompt strings (do/vibe expressions or prompt-typed variables)`,
        location
      );
    }
  }
}

// ============================================================================
// Expression Type Inference
// ============================================================================

/**
 * Gets the type of an expression if it can be determined at compile time.
 */
export function getExpressionType(ctx: AnalyzerContext, expr: AST.Expression): string | null {
  switch (expr.type) {
    case 'StringLiteral':
    case 'TemplateLiteral':
      return 'text';
    case 'BooleanLiteral':
      return 'boolean';
    case 'NumberLiteral':
      return 'number';
    case 'NullLiteral':
      return 'null';
    case 'ObjectLiteral':
      return 'json';
    case 'ArrayLiteral':
      return null;
    case 'Identifier': {
      const symbol = ctx.symbols.lookup(expr.name);
      if (symbol?.typeAnnotation) {
        return symbol.typeAnnotation;
      }
      return null;
    }
    case 'CallExpression': {
      if (expr.callee.type === 'Identifier') {
        const tsSig = ctx.tsImportSignatures.get(expr.callee.name);
        if (tsSig) {
          return tsTypeToVibe(tsSig.returnType);
        }
        const funcSymbol = ctx.symbols.lookup(expr.callee.name);
        if (funcSymbol?.kind === 'function' && funcSymbol.returnType) {
          return funcSymbol.returnType;
        }
      }
      return null;
    }
    case 'TsBlock': {
      const params: Array<{ name: string; vibeType: string | null }> = [];
      for (const paramName of expr.params) {
        const symbol = ctx.symbols.lookup(paramName);
        params.push({
          name: paramName,
          vibeType: symbol?.typeAnnotation ?? null,
        });
      }
      return inferTsBlockReturnType(params, expr.body);
    }
    default:
      return null;
  }
}
