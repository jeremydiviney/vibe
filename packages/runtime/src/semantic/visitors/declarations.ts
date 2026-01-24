/**
 * Declaration Visitors
 *
 * Handles semantic analysis of variable, destructuring, assignment,
 * and type declarations.
 */
import * as AST from '../../ast';
import type { SourceLocation } from '../../errors';
import {
  validateTypeAnnotation,
  validateLiteralType,
  validateAsyncExpression,
  validateStringInterpolation,
} from '../analyzer-validators';
import type { VisitorContext } from './types';

export function visitVariableDeclaration(
  vc: VisitorContext,
  node: AST.LetDeclaration | AST.ConstDeclaration,
  kind: 'variable' | 'constant'
): void {
  const { ctx, visitExpression, getExprType } = vc;

  const validateLitType = (expr: AST.Expression, type: string, location: SourceLocation) => {
    validateLiteralType(ctx, expr, type, location, getExprType);
  };

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

export function visitDestructuringDeclaration(vc: VisitorContext, node: AST.DestructuringDeclaration): void {
  const { ctx, visitExpression } = vc;

  for (const field of node.fields) {
    validateTypeAnnotation(ctx, field.type, node.location);
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

export function visitAssignmentExpression(vc: VisitorContext, node: AST.AssignmentExpression): void {
  const { ctx, visitExpression } = vc;
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

export function visitTypeDeclaration(vc: VisitorContext, node: AST.TypeDeclaration): void {
  const { ctx, state } = vc;

  // Type declarations can only be at top level
  if (!state.atTopLevel) {
    ctx.error('Type declarations can only be at global scope', node.location);
  }

  // Validate field types
  validateStructuralTypeFields(vc, node.structure.fields, node.location);

  // Register in symbol table
  ctx.declare(node.name, 'type', node.location, {
    vibeType: node.name,
  });

  // Register in type registry
  ctx.typeRegistry.register(node.name, node.structure);
}

export function validateStructuralTypeFields(vc: VisitorContext, fields: AST.StructuralTypeField[], location: SourceLocation): void {
  const { ctx } = vc;
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
      validateStructuralTypeFields(vc, field.nestedType.fields, location);
    }
  }
}
