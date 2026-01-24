/**
 * Expression Visitors
 *
 * Handles semantic analysis of all expression types.
 */
import * as AST from '../../ast';
import type { SourceLocation } from '../../errors';
import { isCoreFunction } from '../../runtime/stdlib/core';
import {
  validateStringInterpolation,
  validateTsBlock,
  checkCallArguments,
  checkToolCall,
  checkPromptType,
  checkModelType,
  checkContextVariable,
  validateLiteralType,
} from '../analyzer-validators';
import { visitAssignmentExpression } from './declarations';
import type { VisitorContext } from './types';

export function visitExpressionBody(vc: VisitorContext, node: AST.Expression): void {
  const { ctx, visitExpression, getExprType } = vc;

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
      validateArrayLiteralTypes(vc, node);
      break;

    case 'AssignmentExpression':
      visitAssignmentExpression(vc, node);
      break;

    case 'VibeExpression':
      visitVibePrompt(vc, node.prompt);
      checkPromptType(ctx, node.prompt);
      if (node.model) checkModelType(ctx, node.model, visitExpression);
      if (node.context) checkContextVariable(ctx, node.context);
      break;

    case 'CallExpression': {
      visitExpression(node.callee);
      node.arguments.forEach((arg) => visitExpression(arg));
      const validateLitType = (expr: AST.Expression, type: string, location: SourceLocation) => {
        validateLiteralType(ctx, expr, type, location, getExprType);
      };
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
    }

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
      validateArrayConcatenation(vc, node);
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

export function visitVibePrompt(vc: VisitorContext, node: AST.Expression): void {
  const { ctx, visitExpression } = vc;

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

export function validateArrayLiteralTypes(vc: VisitorContext, node: AST.ArrayLiteral): void {
  const { ctx, getExprType } = vc;

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

export function isArrayExpression(expr: AST.Expression, exprType: string | null): boolean {
  if (exprType?.endsWith('[]')) {
    return true;
  }
  // Array literals and slices are always arrays
  if (expr.type === 'ArrayLiteral' || expr.type === 'SliceExpression') {
    return true;
  }
  return false;
}

export function validateArrayConcatenation(vc: VisitorContext, node: AST.BinaryExpression): void {
  const { ctx, getExprType } = vc;

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
