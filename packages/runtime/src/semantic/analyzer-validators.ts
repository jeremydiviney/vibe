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
    const baseType = param.vibeType.replace(/\[\]$/, '');
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
 * Accepts built-in types and named structural types from the type registry.
 */
export function validateTypeAnnotation(ctx: AnalyzerContext, type: string, location: SourceLocation): void {
  const baseType = getBaseType(type);

  // Check built-in types first
  if (isValidType(type)) {
    return;
  }

  // Check if it's a registered structural type
  if (ctx.typeRegistry?.has(baseType)) {
    return;
  }

  // Check if it's declared as a type in the symbol table
  const symbol = ctx.symbols.lookup(baseType);
  if (symbol?.kind === 'type') {
    return;
  }

  ctx.error(`Unknown type '${baseType}'`, location);
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
    } else {
      // Non-literal expression: check if source type is compatible array type
      const sourceType = getExpressionType(expr);
      if (sourceType && !sourceType.endsWith('[]')) {
        ctx.error(`Type error: cannot assign ${sourceType} to ${type}`, location);
      } else if (sourceType && sourceType !== type) {
        ctx.error(`Type error: cannot assign ${sourceType} to ${type}`, location);
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
      const isPromptType = sym.kind === 'constant' && sym.vibeType === 'prompt';
      const isTextType = sym.vibeType === 'text' || sym.vibeType === 'prompt';
      if (!isPromptType && !isTextType) {
        ctx.error(
          `compress first argument '${arg1.name}' must be prompt type when two arguments provided, got ${sym.vibeType ?? sym.kind}`,
          location
        );
      }
    } else {
      const isModelType = sym.kind === 'model' || (sym.kind === 'constant' && sym.vibeType === 'model');
      const isPromptType = sym.kind === 'constant' && sym.vibeType === 'prompt';
      const isTextType = sym.vibeType === 'text' || sym.vibeType === 'prompt';
      if (!isModelType && !isPromptType && !isTextType) {
        ctx.error(
          `compress argument '${arg1.name}' must be prompt or model type, got ${sym.vibeType ?? sym.kind}`,
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
      const isModelType = sym.kind === 'model' || (sym.kind === 'constant' && sym.vibeType === 'model');
      if (!isModelType) {
        ctx.error(
          `compress second argument '${arg2.name}' must be model type, got ${sym.vibeType ?? sym.kind}`,
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
  for (const rawParam of node.params) {
    // Parse "name = expr" or plain "name" syntax
    const eqIndex = rawParam.indexOf('=');
    const bindingName = eqIndex !== -1 ? rawParam.slice(0, eqIndex).trim() : rawParam;
    const expr = eqIndex !== -1 ? rawParam.slice(eqIndex + 1).trim() : rawParam;

    // Validate the base variable exists
    const segments = parseTsParamExpr(expr);
    const baseName = segments ? segments[0].value as string : expr;
    const symbol = ctx.symbols.lookup(baseName);
    if (!symbol) {
      ctx.error(`'${baseName}' is not defined`, node.location);
      continue;
    }

    // Resolve the type of the full expression (handles member, index, slice)
    const vibeType = resolveTsParamExprType(ctx, expr, node.location);
    params.push({
      name: bindingName,
      vibeType,
    });
  }

  const tsErrors = checkTsBlockTypes(params, node.body, node.location);
  for (const err of tsErrors) {
    ctx.error(err.message, err.location);
  }
}

/**
 * Resolve the vibeType of a ts block parameter expression string.
 * Handles dotted member access, index access, and slice expressions.
 * Examples: "varName", "obj.field", "arr[0]", "arr[-1]", "arr[1:3]", "obj.list[0].name"
 */
function resolveTsParamExprType(ctx: AnalyzerContext, expr: string, location: SourceLocation): string | null {
  const segments = parseTsParamExpr(expr);
  if (!segments) return null;

  // Look up the base variable
  const baseName = segments[0].value as string;
  const symbol = ctx.symbols.lookup(baseName);
  if (!symbol) return null;

  let currentType: string | null = symbol.vibeType ?? (symbol.kind === 'model' ? 'model' : null);

  // Walk the access chain to resolve the final type
  for (let i = 1; i < segments.length; i++) {
    if (!currentType) return null;
    const seg = segments[i];

    switch (seg.type) {
      case 'member':
        currentType = resolveMemberType(currentType, seg.value as string);
        break;
      case 'index':
        if (currentType.endsWith('[]')) {
          currentType = currentType.slice(0, -2);  // T[] -> T
        } else if (currentType === 'json') {
          currentType = 'json';
        } else {
          currentType = null;
        }
        break;
      case 'slice':
        // Slice preserves the array type: T[] -> T[]
        if (!currentType.endsWith('[]')) {
          currentType = null;
        }
        break;
    }
  }

  return currentType;
}

/** Resolve the type of a member access on a given base type. */
function resolveMemberType(baseType: string, property: string): string | null {
  if (baseType.endsWith('[]')) {
    if (property === 'len') return 'number';
    return null;
  }
  if (baseType === 'text' || baseType === 'prompt') {
    if (property === 'len') return 'number';
    return null;
  }
  if (baseType === 'json') return null;  // json member access is untyped
  if (baseType === 'model') {
    if (property === 'usage') return 'json[]';
    if (property === 'name') return 'text';
    return null;
  }
  return null;
}

type TsParamSegment =
  | { type: 'base'; value: string }
  | { type: 'member'; value: string }
  | { type: 'index'; value: number }
  | { type: 'slice'; start: number | null; end: number | null };

/**
 * Parse a ts param expression string into access segments.
 * Returns null if the expression is malformed.
 */
function parseTsParamExpr(expr: string): TsParamSegment[] | null {
  const segments: TsParamSegment[] = [];
  let i = 0;

  // Parse base identifier
  let base = '';
  while (i < expr.length && expr[i] !== '.' && expr[i] !== '[') {
    base += expr[i];
    i++;
  }
  if (!base) return null;
  segments.push({ type: 'base', value: base });

  // Parse chain of .field, [index], [start:end]
  while (i < expr.length) {
    if (expr[i] === '.') {
      i++; // skip dot
      let field = '';
      while (i < expr.length && expr[i] !== '.' && expr[i] !== '[') {
        field += expr[i];
        i++;
      }
      if (!field) return null;
      segments.push({ type: 'member', value: field });
    } else if (expr[i] === '[') {
      i++; // skip [
      let content = '';
      while (i < expr.length && expr[i] !== ']') {
        content += expr[i];
        i++;
      }
      if (i >= expr.length) return null; // no closing ]
      i++; // skip ]

      if (content.includes(':')) {
        // Slice: [start:end]
        const [startStr, endStr] = content.split(':');
        const start = startStr.trim() ? parseInt(startStr.trim(), 10) : null;
        const end = endStr.trim() ? parseInt(endStr.trim(), 10) : null;
        segments.push({ type: 'slice', start, end });
      } else {
        // Index: [n]
        const idx = parseInt(content.trim(), 10);
        if (isNaN(idx)) return null;
        segments.push({ type: 'index', value: idx });
      }
    } else {
      return null; // unexpected character
    }
  }

  return segments;
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
  } else if (sym.vibeType === 'json') {
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
      const isModelParam = sym.kind === 'parameter' && sym.vibeType === 'model';
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
    case 'ArrayLiteral': {
      // Infer array type from first element
      if (expr.elements.length === 0) {
        return null; // Empty array - type unknown
      }
      const firstElementType = getExpressionType(ctx, expr.elements[0]);
      if (firstElementType && !firstElementType.endsWith('[]')) {
        return `${firstElementType}[]`;
      }
      return null;
    }
    case 'SliceExpression': {
      // A slice of an array has the same type as the array
      const objectType = getExpressionType(ctx, expr.object);
      if (objectType?.endsWith('[]')) {
        return objectType;
      }
      return null;
    }
    case 'IndexExpression': {
      // Array element access: arr[0] where arr is model[] -> model
      const objectType = getExpressionType(ctx, expr.object);
      if (!objectType) return null;
      if (objectType.endsWith('[]')) return objectType.slice(0, -2);  // model[] -> model
      if (objectType === 'json') return 'json';  // JSON property access
      return null;
    }
    case 'MemberExpression': {
      const objectType = getExpressionType(ctx, expr.object);
      if (!objectType) return null;
      const property = expr.property;

      // Array methods/properties
      if (objectType.endsWith('[]')) {
        if (property === 'len') return 'number';
        // pop returns element type, but is a method - handled in CallExpression
      }

      // String/prompt methods/properties
      if (objectType === 'text' || objectType === 'prompt') {
        if (property === 'len') return 'number';
      }

      // Plain json member access → return null (unknown type, defer to runtime)
      // This allows: if jsonObj.isValid { ... } without semantic error
      if (objectType === 'json') return null;

      // For structural types, resolve through type registry
      if (ctx.typeRegistry) {
        const resolvedType = ctx.typeRegistry.resolveSingleMember(objectType, property);
        if (resolvedType) {
          return resolvedType;
        }
        // If the type is a known structural type but field doesn't exist, report error
        const structType = ctx.typeRegistry.lookup(objectType);
        if (structType) {
          const validFields = structType.fields.map(f => f.name);
          ctx.error(
            `Property '${property}' does not exist on type '${objectType}'. Available fields: ${validFields.join(', ')}`,
            expr.location
          );
          return null;
        }
      }

      return null;
    }
    case 'BinaryExpression': {
      const { operator } = expr;
      // Comparison and logical operators return boolean
      if (['==', '!=', '<', '>', '<=', '>=', 'and', 'or'].includes(operator)) return 'boolean';
      // Arithmetic operators (except +) return number
      if (['-', '*', '/', '%'].includes(operator)) return 'number';
      // + depends on operand types
      if (operator === '+') {
        const leftType = getExpressionType(ctx, expr.left);
        const rightType = getExpressionType(ctx, expr.right);
        if (leftType === 'number' && rightType === 'number') return 'number';
        if (leftType === 'text' || rightType === 'text') return 'text';
        if (leftType?.endsWith('[]') && leftType === rightType) return leftType;
        return null;
      }
      return null;
    }
    case 'UnaryExpression': {
      if (expr.operator === 'not') return 'boolean';
      if (expr.operator === '-') return 'number';
      return null;
    }
    case 'RangeExpression':
      return 'number[]';
    case 'Identifier': {
      const symbol = ctx.symbols.lookup(expr.name);
      if (symbol?.vibeType) {
        return symbol.vibeType;
      }
      // Infer type from symbol kind when vibeType isn't explicitly set
      if (symbol?.kind === 'model') return 'model';
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
      // Handle method calls (MemberExpression callee) like arr.pop(), arr.len()
      if (expr.callee.type === 'MemberExpression') {
        const objType = getExpressionType(ctx, expr.callee.object);
        const method = expr.callee.property;

        // Array methods
        if (objType?.endsWith('[]')) {
          if (method === 'len') return 'number';
          if (method === 'pop') return objType.slice(0, -2);  // model[] -> model
          if (method === 'push') return objType;  // push returns the array
        }

        // String/prompt methods
        if (objType === 'text' || objType === 'prompt') {
          if (method === 'len') return 'number';
        }
      }
      return null;
    }
    case 'TsBlock': {
      const params: Array<{ name: string; vibeType: string | null }> = [];
      for (const rawParam of expr.params) {
        const eqIndex = rawParam.indexOf('=');
        const bindingName = eqIndex !== -1 ? rawParam.slice(0, eqIndex).trim() : rawParam;
        const paramExpr = eqIndex !== -1 ? rawParam.slice(eqIndex + 1).trim() : rawParam;
        const vibeType = resolveTsParamExprType(ctx, paramExpr, expr.location);
        params.push({
          name: bindingName,
          vibeType,
        });
      }
      return inferTsBlockReturnType(params, expr.body);
    }
    default:
      return null;
  }
}
