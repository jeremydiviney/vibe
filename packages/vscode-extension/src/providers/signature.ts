import { SignatureHelp, SignatureInformation, ParameterInformation, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { parse } from '@vibe-lang/runtime/parser/parse';
import type * as AST from '@vibe-lang/runtime/ast';
import { builtinSignatures } from '../utils/builtins';
import { getTSImportForIdentifier } from '../utils/ast-utils';
import { tsService } from '../services/typescript-service';

/**
 * Provide signature help for function calls
 */
export function provideSignatureHelp(
  document: TextDocument,
  position: Position
): SignatureHelp | null {
  const text = document.getText();
  const offset = document.offsetAt(position);

  // Find if we're inside a function call
  const callInfo = findCallAtPosition(text, offset);
  if (!callInfo) return null;

  // Try built-in functions first
  const builtin = builtinSignatures[callInfo.name];
  if (builtin) {
    return createSignatureHelp(builtin.label, builtin.params, builtin.doc, callInfo.activeParam);
  }

  // Try regex-based extraction for user-defined functions (works with incomplete code)
  const funcDef = findFunctionByRegex(text, callInfo.name);
  if (funcDef) {
    return createSignatureHelp(funcDef.label, funcDef.params, funcDef.doc, callInfo.activeParam);
  }

  // Try TypeScript imports
  try {
    const ast = parse(text, { file: document.uri });
    const tsImport = getTSImportForIdentifier(ast, callInfo.name);
    if (tsImport) {
      const vibeFilePath = URI.parse(document.uri).fsPath;
      const tsFilePath = tsService.resolveImportPath(vibeFilePath, tsImport.sourcePath);
      if (tsFilePath) {
        const tsHover = tsService.getHoverInfo(tsFilePath, tsImport.importedName);
        if (tsHover) {
          const tsSignature = parseTSSignature(tsHover.displayString);
          if (tsSignature) {
            return createSignatureHelp(
              tsSignature.label,
              tsSignature.params,
              tsHover.documentation || undefined,
              callInfo.activeParam
            );
          }
        }
      }
    }
  } catch {
    // Parse error - continue to AST fallback
  }

  // Fallback: try AST parsing (may fail with incomplete code)
  try {
    const ast = parse(text, { file: document.uri });
    const astFuncDef = findFunctionOrTool(ast, callInfo.name);

    if (astFuncDef) {
      const label = formatSignature(astFuncDef);
      const params = astFuncDef.params.map(p => `${p.name}: ${p.vibeType}`);
      const doc = astFuncDef.type === 'ToolDeclaration' ? astFuncDef.description : undefined;
      return createSignatureHelp(label, params, doc, callInfo.activeParam);
    }
  } catch {
    // Parse error - already tried regex fallback
  }

  return null;
}

function createSignatureHelp(
  label: string,
  params: string[],
  doc: string | undefined,
  activeParam: number
): SignatureHelp {
  const paramInfos: ParameterInformation[] = params.map(p => ({
    label: p.split(' - ')[0], // Just the "name: type" part
    documentation: p,
  }));

  const signature: SignatureInformation = {
    label,
    documentation: doc,
    parameters: paramInfos,
  };

  return {
    signatures: [signature],
    activeSignature: 0,
    activeParameter: Math.min(activeParam, params.length - 1),
  };
}

interface CallInfo {
  name: string;
  activeParam: number;
}

function findCallAtPosition(text: string, offset: number): CallInfo | null {
  // Work backwards from cursor to find function call context
  let depth = 0;
  let commaCount = 0;
  let i = offset - 1;

  while (i >= 0) {
    const char = text[i];

    if (char === ')' || char === ']' || char === '}') {
      depth++;
    } else if (char === '(' && depth === 0) {
      // Found the opening paren - get function name
      const nameMatch = text.slice(0, i).match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
      if (nameMatch) {
        return {
          name: nameMatch[1],
          activeParam: commaCount,
        };
      }
      return null;
    } else if (char === '(' || char === '[' || char === '{') {
      depth--;
      if (depth < 0) return null; // Unbalanced
    } else if (char === ',' && depth === 0) {
      commaCount++;
    }

    i--;
  }

  return null;
}

interface RegexFuncDef {
  label: string;
  params: string[];
  doc?: string;
}

/**
 * Find function/tool definition by regex (works with incomplete code)
 */
function findFunctionByRegex(text: string, name: string): RegexFuncDef | null {
  // Match: function name(params): returnType
  const funcPattern = new RegExp(
    `function\\s+${escapeRegex(name)}\\s*\\(([^)]*)\\)(?:\\s*:\\s*(\\w+))?`,
    'm'
  );
  const funcMatch = text.match(funcPattern);
  if (funcMatch) {
    const paramsStr = funcMatch[1].trim();
    const returnType = funcMatch[2] || '';
    const params = parseParams(paramsStr);
    const label = `${name}(${paramsStr})${returnType ? `: ${returnType}` : ''}`;
    return { label, params };
  }

  // Match: tool name(params): returnType @description "..."
  const toolPattern = new RegExp(
    `tool\\s+${escapeRegex(name)}\\s*\\(([^)]*)\\)(?:\\s*:\\s*(\\w+))?(?:\\s*@description\\s*"([^"]*)")?`,
    'm'
  );
  const toolMatch = text.match(toolPattern);
  if (toolMatch) {
    const paramsStr = toolMatch[1].trim();
    const returnType = toolMatch[2] || '';
    const doc = toolMatch[3];
    const params = parseParams(paramsStr);
    const label = `${name}(${paramsStr})${returnType ? `: ${returnType}` : ''}`;
    return { label, params, doc };
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseParams(paramsStr: string): string[] {
  if (!paramsStr) return [];
  return paramsStr.split(',').map(p => p.trim()).filter(p => p.length > 0);
}

function findFunctionOrTool(
  ast: AST.Program,
  name: string
): AST.FunctionDeclaration | AST.ToolDeclaration | null {
  for (const statement of ast.body) {
    if (statement.type === 'FunctionDeclaration' && statement.name === name) {
      return statement;
    }
    if (statement.type === 'ToolDeclaration' && statement.name === name) {
      return statement;
    }
  }
  return null;
}

function formatSignature(func: AST.FunctionDeclaration | AST.ToolDeclaration): string {
  const params = func.params.map(p => `${p.name}: ${p.vibeType}`).join(', ');
  const returnType = func.returnType ? `: ${func.returnType}` : '';
  return `${func.name}(${params})${returnType}`;
}

interface TSSignature {
  label: string;
  params: string[];
}

/**
 * Parse a TypeScript display string to extract signature info
 * Examples:
 *   "function add(a: number, b: number): number"
 *   "const multiply: (a: number, b: number) => number"
 */
function parseTSSignature(displayString: string): TSSignature | null {
  // Try function declaration: "function name(params): returnType"
  const funcMatch = displayString.match(/function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(.+))?/);
  if (funcMatch) {
    const [, name, paramsStr, returnType] = funcMatch;
    const params = parseParams(paramsStr);
    const label = `${name}(${paramsStr})${returnType ? `: ${returnType}` : ''}`;
    return { label, params };
  }

  // Try arrow function: "const name: (params) => returnType"
  const arrowMatch = displayString.match(/(?:const|let|var)\s+(\w+)\s*:\s*\(([^)]*)\)\s*=>\s*(.+)/);
  if (arrowMatch) {
    const [, name, paramsStr, returnType] = arrowMatch;
    const params = parseParams(paramsStr);
    const label = `${name}(${paramsStr}): ${returnType.trim()}`;
    return { label, params };
  }

  return null;
}
