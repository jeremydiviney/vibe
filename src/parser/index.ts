import { CstParser } from 'chevrotain';
import * as T from '../lexer';

class VibeParser extends CstParser {
  constructor() {
    super(T.allTokens, {
      recoveryEnabled: true,
    });
    this.performSelfAnalysis();
  }

  // ============================================================================
  // Program
  // ============================================================================

  public program = this.RULE('program', () => {
    this.MANY(() => {
      this.SUBRULE(this.statement);
    });
  });

  // ============================================================================
  // Statements
  // ============================================================================

  private statement = this.RULE('statement', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.importDeclaration) },
      { ALT: () => this.SUBRULE(this.exportDeclaration) },
      { ALT: () => this.SUBRULE(this.letDeclaration) },
      { ALT: () => this.SUBRULE(this.constDeclaration) },
      { ALT: () => this.SUBRULE(this.modelDeclaration) },
      { ALT: () => this.SUBRULE(this.functionDeclaration) },
      { ALT: () => this.SUBRULE(this.toolDeclaration) },
      { ALT: () => this.SUBRULE(this.returnStatement) },
      { ALT: () => this.SUBRULE(this.ifStatement) },
      { ALT: () => this.SUBRULE(this.forInStatement) },
      { ALT: () => this.SUBRULE(this.whileStatement) },
      // Distinguish block statement from object literal expression:
      // { identifier : ... } is an object literal, otherwise it's a block
      {
        GATE: () => !(this.LA(1).tokenType === T.LBrace && this.LA(2).tokenType === T.Identifier && this.LA(3).tokenType === T.Colon),
        ALT: () => this.SUBRULE(this.blockStatement),
      },
      { ALT: () => this.SUBRULE(this.expressionStatement) },
    ]);
  });

  // import { name1, name2 } from "path"
  private importDeclaration = this.RULE('importDeclaration', () => {
    this.CONSUME(T.Import);
    this.CONSUME(T.LBrace);
    this.SUBRULE(this.importSpecifierList);
    this.CONSUME(T.RBrace);
    this.CONSUME(T.From);
    this.CONSUME(T.StringLiteral);
  });

  // name1, name2, name3
  private importSpecifierList = this.RULE('importSpecifierList', () => {
    this.CONSUME(T.Identifier);
    this.MANY(() => {
      this.CONSUME(T.Comma);
      this.CONSUME2(T.Identifier);
    });
  });

  // export function|let|const|model ...
  private exportDeclaration = this.RULE('exportDeclaration', () => {
    this.CONSUME(T.Export);
    this.OR([
      { ALT: () => this.SUBRULE(this.functionDeclaration) },
      { ALT: () => this.SUBRULE(this.letDeclaration) },
      { ALT: () => this.SUBRULE(this.constDeclaration) },
      { ALT: () => this.SUBRULE(this.modelDeclaration) },
    ]);
  });

  private letDeclaration = this.RULE('letDeclaration', () => {
    this.CONSUME(T.Let);
    this.OR([
      // Destructuring: let { name: type, name: type } = expression
      {
        GATE: () => this.LA(1).tokenType === T.LBrace,
        ALT: () => {
          this.SUBRULE(this.destructuringPattern);
          this.CONSUME(T.Equals);
          this.SUBRULE(this.expression);
        },
      },
      // Regular: let name : type = expression
      {
        ALT: () => {
          this.CONSUME(T.Identifier);
          this.OPTION(() => {
            this.CONSUME(T.Colon);
            this.SUBRULE(this.typeAnnotation);
          });
          this.OPTION2(() => {
            this.CONSUME2(T.Equals);
            this.SUBRULE2(this.expression);
          });
        },
      },
    ]);
  });

  // Type annotation: text, json, prompt, boolean, number, model, or any of these followed by []
  private typeAnnotation = this.RULE('typeAnnotation', () => {
    this.OR([
      { ALT: () => this.CONSUME(T.TextType) },
      { ALT: () => this.CONSUME(T.JsonType) },
      { ALT: () => this.CONSUME(T.PromptType) },
      { ALT: () => this.CONSUME(T.BooleanType) },
      { ALT: () => this.CONSUME(T.NumberType) },
      { ALT: () => this.CONSUME(T.Model) },  // model type for AI model parameters
    ]);
    // Optional array brackets: text[] or text[][]
    this.MANY(() => {
      this.CONSUME(T.LBracket);
      this.CONSUME(T.RBracket);
    });
  });

  private constDeclaration = this.RULE('constDeclaration', () => {
    this.CONSUME(T.Const);
    this.OR([
      // Destructuring: const { name: type, name: type } = expression
      {
        GATE: () => this.LA(1).tokenType === T.LBrace,
        ALT: () => {
          this.SUBRULE(this.destructuringPattern);
          this.CONSUME(T.Equals);
          this.SUBRULE(this.expression);
        },
      },
      // Regular: const name : type = expression
      {
        ALT: () => {
          this.CONSUME(T.Identifier);
          this.OPTION(() => {
            this.CONSUME(T.Colon);
            this.SUBRULE(this.typeAnnotation);
          });
          this.CONSUME2(T.Equals);
          this.SUBRULE2(this.expression);
        },
      },
    ]);
  });

  // Destructuring pattern: { name: type, name: type, ... }
  private destructuringPattern = this.RULE('destructuringPattern', () => {
    this.CONSUME(T.LBrace);
    this.SUBRULE(this.destructuringField);
    this.MANY(() => {
      this.CONSUME(T.Comma);
      this.SUBRULE2(this.destructuringField);
    });
    this.CONSUME(T.RBrace);
  });

  // Single destructuring field: name: type
  private destructuringField = this.RULE('destructuringField', () => {
    this.CONSUME(T.Identifier);
    this.CONSUME(T.Colon);
    this.SUBRULE(this.typeAnnotation);
  });

  private modelDeclaration = this.RULE('modelDeclaration', () => {
    this.CONSUME(T.Model);
    this.CONSUME(T.Identifier);
    this.CONSUME(T.Equals);
    this.SUBRULE(this.objectLiteral);
  });

  private objectLiteral = this.RULE('objectLiteral', () => {
    this.CONSUME(T.LBrace);
    this.OPTION(() => {
      this.SUBRULE(this.propertyList);
    });
    this.CONSUME(T.RBrace);
  });

  private propertyList = this.RULE('propertyList', () => {
    this.SUBRULE(this.property);
    this.MANY(() => {
      this.CONSUME(T.Comma);
      this.SUBRULE2(this.property);
    });
  });

  private property = this.RULE('property', () => {
    this.CONSUME(T.Identifier);
    this.CONSUME(T.Colon);
    this.SUBRULE(this.expression);
  });

  // function name(params): returnType { ... }
  // Note: Functions always forget context on exit (no context mode support)
  private functionDeclaration = this.RULE('functionDeclaration', () => {
    this.CONSUME(T.Function);
    this.CONSUME(T.Identifier);
    this.CONSUME(T.LParen);
    this.OPTION(() => {
      this.SUBRULE(this.parameterList);
    });
    this.CONSUME(T.RParen);
    // Optional return type
    this.OPTION2(() => {
      this.CONSUME(T.Colon);
      this.SUBRULE(this.typeAnnotation);
    });
    this.SUBRULE(this.blockStatement);
  });

  // tool name(params): returnType @description "..." @param name "..." { ... }
  private toolDeclaration = this.RULE('toolDeclaration', () => {
    this.CONSUME(T.Tool);
    this.CONSUME(T.Identifier);
    this.CONSUME(T.LParen);
    this.OPTION(() => {
      this.SUBRULE(this.toolParameterList);
    });
    this.CONSUME(T.RParen);
    // Optional return type
    this.OPTION2(() => {
      this.CONSUME(T.Colon);
      this.SUBRULE(this.toolTypeAnnotation);
    });
    // Optional metadata (@description, @param)
    this.MANY(() => {
      this.SUBRULE(this.toolMetadata);
    });
    this.SUBRULE(this.blockStatement);
  });

  // Tool type annotation: can be a built-in type or an Identifier (imported TS type)
  private toolTypeAnnotation = this.RULE('toolTypeAnnotation', () => {
    this.OR([
      { ALT: () => this.CONSUME(T.TextType) },
      { ALT: () => this.CONSUME(T.JsonType) },
      { ALT: () => this.CONSUME(T.PromptType) },
      { ALT: () => this.CONSUME(T.BooleanType) },
      { ALT: () => this.CONSUME(T.NumberType) },
      { ALT: () => this.CONSUME(T.Identifier) },  // Imported TS type
    ]);
    // Optional array brackets
    this.MANY(() => {
      this.CONSUME(T.LBracket);
      this.CONSUME(T.RBracket);
    });
  });

  // Tool metadata: @description "text" or @param name "text"
  private toolMetadata = this.RULE('toolMetadata', () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(T.AtDescription);
          this.CONSUME(T.StringLiteral);
        },
      },
      {
        ALT: () => {
          this.CONSUME(T.AtParam);
          this.CONSUME(T.Identifier);
          this.CONSUME2(T.StringLiteral);
        },
      },
    ]);
  });

  // Tool parameter: name: type (allows imported TS types as type annotation)
  private toolParameter = this.RULE('toolParameter', () => {
    this.CONSUME(T.Identifier);
    this.CONSUME(T.Colon);
    this.SUBRULE(this.toolTypeAnnotation);
  });

  private toolParameterList = this.RULE('toolParameterList', () => {
    this.SUBRULE(this.toolParameter);
    this.MANY(() => {
      this.CONSUME(T.Comma);
      this.SUBRULE2(this.toolParameter);
    });
  });

  // name: type (type is REQUIRED)
  private parameter = this.RULE('parameter', () => {
    this.CONSUME(T.Identifier);
    this.CONSUME(T.Colon);
    this.SUBRULE(this.typeAnnotation);
  });

  private parameterList = this.RULE('parameterList', () => {
    this.SUBRULE(this.parameter);
    this.MANY(() => {
      this.CONSUME(T.Comma);
      this.SUBRULE2(this.parameter);
    });
  });

  private returnStatement = this.RULE('returnStatement', () => {
    this.CONSUME(T.Return);
    this.OPTION(() => {
      this.SUBRULE(this.expression);
    });
  });

  private ifStatement = this.RULE('ifStatement', () => {
    this.CONSUME(T.If);
    this.SUBRULE(this.expression);
    this.SUBRULE(this.blockStatement);
    this.OPTION(() => {
      this.CONSUME(T.Else);
      this.OR([
        { ALT: () => this.SUBRULE2(this.ifStatement) },
        { ALT: () => this.SUBRULE2(this.blockStatement) },
      ]);
    });
  });

  // for variable in iterable { ... } [forget|verbose|compress]
  private forInStatement = this.RULE('forInStatement', () => {
    this.CONSUME(T.For);
    this.CONSUME(T.Identifier);  // Loop variable
    this.CONSUME(T.In);
    this.SUBRULE(this.expression);  // Iterable (array, number, or [start, end])
    this.SUBRULE(this.blockStatement);
    this.OPTION(() => {
      this.SUBRULE(this.contextMode);
    });
  });

  // while condition { ... } [forget|verbose|compress]
  private whileStatement = this.RULE('whileStatement', () => {
    this.CONSUME(T.While);
    this.SUBRULE(this.expression);  // Condition
    this.SUBRULE(this.blockStatement);
    this.OPTION(() => {
      this.SUBRULE(this.contextMode);
    });
  });

  // Context mode: forget | verbose | compress | compress(...args)
  // compress supports: compress, compress(model), compress("prompt"),
  //                    compress(promptVar), compress("prompt", model), compress(promptVar, model)
  private contextMode = this.RULE('contextMode', () => {
    this.OR([
      { ALT: () => this.CONSUME(T.Forget) },
      { ALT: () => this.CONSUME(T.Verbose) },
      {
        ALT: () => {
          this.CONSUME(T.Compress);
          this.OPTION(() => {
            this.CONSUME(T.LParen);
            // First argument: string literal or identifier
            this.OR1([
              { ALT: () => this.CONSUME(T.StringLiteral) },
              { ALT: () => this.CONSUME1(T.Identifier) },
            ]);
            // Optional second argument: identifier (model)
            this.OPTION1(() => {
              this.CONSUME(T.Comma);
              this.CONSUME2(T.Identifier);
            });
            this.CONSUME(T.RParen);
          });
        },
      },
    ]);
  });

  private blockStatement = this.RULE('blockStatement', () => {
    this.CONSUME(T.LBrace);
    this.MANY(() => {
      this.SUBRULE(this.statement);
    });
    this.CONSUME(T.RBrace);
  });

  private expressionStatement = this.RULE('expressionStatement', () => {
    this.SUBRULE(this.expression);
  });

  // ============================================================================
  // Expressions (with operator precedence)
  // Precedence (lowest to highest):
  //   1. AI ops, assignment
  //   2. or
  //   3. and
  //   4. comparison (== != < > <= >=)
  //   5. additive (+ -)
  //   6. multiplicative (* / %)
  //   7. unary (not, -)
  //   8. range (..)
  //   9. postfix (calls, indexing, slicing)
  //   10. primary
  // ============================================================================

  private expression = this.RULE('expression', () => {
    this.OR([
      // AI operation - vibe (multi-turn tool loop)
      {
        ALT: () => {
          this.CONSUME(T.Vibe);
          this.SUBRULE(this.expression);        // prompt (required)
          this.SUBRULE(this.vibeModifiers);     // optional model and/or context
        },
      },
      // AI operation - do (single-round, no tool loop)
      {
        ALT: () => {
          this.CONSUME(T.Do);
          this.SUBRULE2(this.expression);       // prompt (required)
          this.SUBRULE2(this.vibeModifiers);    // optional model and/or context
        },
      },
      // Assignment expression (identifier = expression)
      {
        GATE: () => this.LA(1).tokenType === T.Identifier && this.LA(2).tokenType === T.Equals,
        ALT: () => this.SUBRULE(this.assignmentExpression),
      },
      // Logical or and below
      { ALT: () => this.SUBRULE(this.orExpression) },
    ]);
  });

  // Optional model and/or context for vibe/do expressions
  // Syntaxes:
  //   (nothing)                    → no model, default context
  //   default | local              → no model, explicit context
  //   identifier                   → explicit model, default context
  //   identifier contextSpecifier → explicit model, explicit context
  private vibeModifiers = this.RULE('vibeModifiers', () => {
    // Context keyword (default/local) without model
    this.OPTION(() => {
      this.OR([
        {
          GATE: () => this.LA(1).tokenType === T.Default || this.LA(1).tokenType === T.Local,
          ALT: () => this.SUBRULE(this.contextSpecifier),
        },
        // Model identifier - only if NOT followed by ( (which would be a function call)
        {
          GATE: () => this.LA(1).tokenType === T.Identifier && this.LA(2).tokenType !== T.LParen,
          ALT: () => {
            this.CONSUME(T.Identifier);  // model
            this.OPTION2(() => {
              this.SUBRULE2(this.contextSpecifier);  // optional context
            });
          },
        },
        // Empty alternative - no modifiers (when next token doesn't match model/context pattern)
        { ALT: () => { /* no-op */ } },
      ]);
    });
  });

  // Or: or (lowest precedence for logical)
  private orExpression = this.RULE('orExpression', () => {
    this.SUBRULE(this.andExpression);
    this.MANY(() => {
      this.CONSUME(T.Or);
      this.SUBRULE2(this.andExpression);
    });
  });

  // And: and
  private andExpression = this.RULE('andExpression', () => {
    this.SUBRULE(this.comparisonExpression);
    this.MANY(() => {
      this.CONSUME(T.And);
      this.SUBRULE2(this.comparisonExpression);
    });
  });

  // Comparison: == != < > <= >=
  private comparisonExpression = this.RULE('comparisonExpression', () => {
    this.SUBRULE(this.additiveExpression);
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(T.EqualEqual) }, { ALT: () => this.CONSUME(T.NotEqual) },
        { ALT: () => this.CONSUME(T.LessThan) }, { ALT: () => this.CONSUME(T.GreaterThan) },
        { ALT: () => this.CONSUME(T.LessEqual) }, { ALT: () => this.CONSUME(T.GreaterEqual) },
      ]);
      this.SUBRULE2(this.additiveExpression);
    });
  });

  // Additive: + -
  private additiveExpression = this.RULE('additiveExpression', () => {
    this.SUBRULE(this.multiplicativeExpression);
    this.MANY(() => {
      this.OR([{ ALT: () => this.CONSUME(T.Plus) }, { ALT: () => this.CONSUME(T.Minus) }]);
      this.SUBRULE2(this.multiplicativeExpression);
    });
  });

  // Multiplicative: * / %
  private multiplicativeExpression = this.RULE('multiplicativeExpression', () => {
    this.SUBRULE(this.unaryExpression);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(T.Star) }, { ALT: () => this.CONSUME(T.Slash) },
        { ALT: () => this.CONSUME(T.Percent) },
      ]);
      this.SUBRULE2(this.unaryExpression);
    });
  });

  // Unary: not, -
  private unaryExpression = this.RULE('unaryExpression', () => {
    this.OR([
      { ALT: () => { this.CONSUME(T.Not); this.SUBRULE(this.unaryExpression); } },
      { // Unary minus
        GATE: () => this.LA(1).tokenType === T.Minus,
        ALT: () => { this.CONSUME(T.Minus); this.SUBRULE2(this.unaryExpression); },
      },
      { ALT: () => this.SUBRULE(this.rangeExpression) },
    ]);
  });

  // Range: ..
  private rangeExpression = this.RULE('rangeExpression', () => {
    this.SUBRULE(this.postfixExpression);
    this.OPTION(() => { this.CONSUME(T.DotDot); this.SUBRULE2(this.postfixExpression); });
  });

  private assignmentExpression = this.RULE('assignmentExpression', () => {
    this.CONSUME(T.Identifier);
    this.CONSUME(T.Equals);
    this.SUBRULE(this.expression);
  });

  private contextSpecifier = this.RULE('contextSpecifier', () => {
    this.OR([
      { ALT: () => this.CONSUME(T.Default) },
      { ALT: () => this.CONSUME(T.Local) },
      { ALT: () => this.CONSUME(T.Identifier) },
    ]);
  });

  // Postfix: function calls, indexing, slicing, member access
  private postfixExpression = this.RULE('postfixExpression', () => {
    this.SUBRULE(this.primaryExpression);
    this.MANY(() => {
      this.OR([
        // Function call: (args)
        {
          ALT: () => {
            this.CONSUME(T.LParen);
            this.OPTION(() => {
              this.SUBRULE(this.argumentList);
            });
            this.CONSUME(T.RParen);
          },
        },
        // Indexing/slicing: [expr] or [expr,expr] or [,expr] or [expr,]
        {
          ALT: () => {
            this.CONSUME(T.LBracket);
            this.SUBRULE(this.indexOrSlice);
            this.CONSUME(T.RBracket);
          },
        },
        // Member access: .identifier
        { ALT: () => { this.CONSUME(T.Dot); this.CONSUME(T.Identifier); } },
      ]);
    });
  });

  // Index or slice inside brackets (Python-style colon syntax)
  // [expr] = single index
  // [expr:expr] = slice (inclusive)
  // [:expr] = slice from start
  // [expr:] = slice to end
  // [:] = full slice (copy)
  private indexOrSlice = this.RULE('indexOrSlice', () => {
    this.OR([
      // Starts with colon: [:expr] or [:] (slice from start)
      {
        GATE: () => this.LA(1).tokenType === T.Colon,
        ALT: () => {
          this.CONSUME(T.Colon);
          // Optional end expression: [:] vs [:expr]
          this.OPTION(() => {
            this.SUBRULE(this.expression);
          });
        },
      },
      // Starts with expression
      {
        ALT: () => {
          this.SUBRULE2(this.expression);
          // Check if followed by colon (slice)
          this.OPTION2(() => {
            this.CONSUME2(T.Colon);
            // Optional end expression: [expr:] vs [expr:expr]
            this.OPTION3(() => {
              this.SUBRULE3(this.expression);
            });
          });
        },
      },
    ]);
  });

  private argumentList = this.RULE('argumentList', () => {
    this.SUBRULE(this.expression);
    this.MANY(() => {
      this.CONSUME(T.Comma);
      this.SUBRULE2(this.expression);
    });
  });

  private primaryExpression = this.RULE('primaryExpression', () => {
    this.OR([
      { ALT: () => this.CONSUME(T.TsBlock) },  // ts(params) { body }
      { ALT: () => this.CONSUME(T.StringLiteral) },
      { ALT: () => this.CONSUME(T.TemplateLiteral) },
      { ALT: () => this.CONSUME(T.NumberLiteral) },
      { ALT: () => this.CONSUME(T.True) }, { ALT: () => this.CONSUME(T.False) },
      { ALT: () => this.SUBRULE(this.objectLiteralExpr) },
      { ALT: () => this.SUBRULE(this.arrayLiteral) },
      { ALT: () => this.CONSUME(T.Identifier) },
      { ALT: () => { this.CONSUME(T.LParen); this.SUBRULE(this.expression); this.CONSUME(T.RParen); } },
    ]);
  });

  private objectLiteralExpr = this.RULE('objectLiteralExpr', () => {
    this.CONSUME(T.LBrace);
    this.OPTION(() => {
      this.SUBRULE(this.propertyList);
    });
    this.CONSUME(T.RBrace);
  });

  private arrayLiteral = this.RULE('arrayLiteral', () => {
    this.CONSUME(T.LBracket);
    this.OPTION(() => {
      this.SUBRULE(this.elementList);
    });
    this.CONSUME(T.RBracket);
  });

  private elementList = this.RULE('elementList', () => {
    this.SUBRULE(this.expression);
    this.MANY(() => {
      this.CONSUME(T.Comma);
      this.SUBRULE2(this.expression);
    });
  });
}

// Create a singleton parser instance
export const vibeParser = new VibeParser();

// Export the parser class for visitor creation
export { VibeParser };
