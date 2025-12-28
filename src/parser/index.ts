import { CstParser } from 'chevrotain';
import {
  allTokens,
  Let,
  Const,
  Vibe,
  Do,
  Ask,
  Function,
  Return,
  If,
  Else,
  While,
  For,
  In,
  And,
  Or,
  Not,
  True,
  False,
  Model,
  Default,
  Local,
  Import,
  Export,
  From,
  TsBlock,
  TextType,
  JsonType,
  PromptType,
  BooleanType,
  NumberType,
  StringLiteral,
  TemplateLiteral,
  NumberLiteral,
  Identifier,
  // Comparison operators
  EqualEqual,
  NotEqual,
  LessThan,
  GreaterThan,
  LessEqual,
  GreaterEqual,
  // Assignment
  Equals,
  // Arithmetic operators
  Plus,
  Minus,
  Star,
  Slash,
  Percent,
  // Delimiters
  LParen,
  RParen,
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  Comma,
  Colon,
  DotDot,
  Dot,
} from '../lexer';

class VibeParser extends CstParser {
  constructor() {
    super(allTokens, {
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
      { ALT: () => this.SUBRULE(this.returnStatement) },
      { ALT: () => this.SUBRULE(this.ifStatement) },
      { ALT: () => this.SUBRULE(this.forInStatement) },
      { ALT: () => this.SUBRULE(this.whileStatement) },
      // Distinguish block statement from object literal expression:
      // { identifier : ... } is an object literal, otherwise it's a block
      {
        GATE: () => !(this.LA(1).tokenType === LBrace && this.LA(2).tokenType === Identifier && this.LA(3).tokenType === Colon),
        ALT: () => this.SUBRULE(this.blockStatement),
      },
      { ALT: () => this.SUBRULE(this.expressionStatement) },
    ]);
  });

  // import { name1, name2 } from "path"
  private importDeclaration = this.RULE('importDeclaration', () => {
    this.CONSUME(Import);
    this.CONSUME(LBrace);
    this.SUBRULE(this.importSpecifierList);
    this.CONSUME(RBrace);
    this.CONSUME(From);
    this.CONSUME(StringLiteral);
  });

  // name1, name2, name3
  private importSpecifierList = this.RULE('importSpecifierList', () => {
    this.CONSUME(Identifier);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.CONSUME2(Identifier);
    });
  });

  // export function|let|const|model ...
  private exportDeclaration = this.RULE('exportDeclaration', () => {
    this.CONSUME(Export);
    this.OR([
      { ALT: () => this.SUBRULE(this.functionDeclaration) },
      { ALT: () => this.SUBRULE(this.letDeclaration) },
      { ALT: () => this.SUBRULE(this.constDeclaration) },
      { ALT: () => this.SUBRULE(this.modelDeclaration) },
    ]);
  });

  private letDeclaration = this.RULE('letDeclaration', () => {
    this.CONSUME(Let);
    this.CONSUME(Identifier);
    this.OPTION(() => {
      this.CONSUME(Colon);
      this.SUBRULE(this.typeAnnotation);
    });
    this.OPTION2(() => {
      this.CONSUME(Equals);
      this.SUBRULE(this.expression);
    });
  });

  // Type annotation: text, json, prompt, boolean, number, or any of these followed by []
  private typeAnnotation = this.RULE('typeAnnotation', () => {
    this.OR([
      { ALT: () => this.CONSUME(TextType) },
      { ALT: () => this.CONSUME(JsonType) },
      { ALT: () => this.CONSUME(PromptType) },
      { ALT: () => this.CONSUME(BooleanType) },
      { ALT: () => this.CONSUME(NumberType) },
    ]);
    // Optional array brackets: text[] or text[][]
    this.MANY(() => {
      this.CONSUME(LBracket);
      this.CONSUME(RBracket);
    });
  });

  private constDeclaration = this.RULE('constDeclaration', () => {
    this.CONSUME(Const);
    this.CONSUME(Identifier);
    this.OPTION(() => {
      this.CONSUME(Colon);
      this.SUBRULE(this.typeAnnotation);
    });
    this.CONSUME(Equals);
    this.SUBRULE(this.expression);
  });

  private modelDeclaration = this.RULE('modelDeclaration', () => {
    this.CONSUME(Model);
    this.CONSUME(Identifier);
    this.CONSUME(Equals);
    this.SUBRULE(this.objectLiteral);
  });

  private objectLiteral = this.RULE('objectLiteral', () => {
    this.CONSUME(LBrace);
    this.OPTION(() => {
      this.SUBRULE(this.propertyList);
    });
    this.CONSUME(RBrace);
  });

  private propertyList = this.RULE('propertyList', () => {
    this.SUBRULE(this.property);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.property);
    });
  });

  private property = this.RULE('property', () => {
    this.CONSUME(Identifier);
    this.CONSUME(Colon);
    this.SUBRULE(this.expression);
  });

  private functionDeclaration = this.RULE('functionDeclaration', () => {
    this.CONSUME(Function);
    this.CONSUME(Identifier);
    this.CONSUME(LParen);
    this.OPTION(() => {
      this.SUBRULE(this.parameterList);
    });
    this.CONSUME(RParen);
    // Optional return type
    this.OPTION2(() => {
      this.CONSUME(Colon);
      this.SUBRULE(this.typeAnnotation);
    });
    this.SUBRULE(this.blockStatement);
  });

  // name: type (type is REQUIRED)
  private parameter = this.RULE('parameter', () => {
    this.CONSUME(Identifier);
    this.CONSUME(Colon);
    this.SUBRULE(this.typeAnnotation);
  });

  private parameterList = this.RULE('parameterList', () => {
    this.SUBRULE(this.parameter);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.parameter);
    });
  });

  private returnStatement = this.RULE('returnStatement', () => {
    this.CONSUME(Return);
    this.OPTION(() => {
      this.SUBRULE(this.expression);
    });
  });

  private ifStatement = this.RULE('ifStatement', () => {
    this.CONSUME(If);
    this.SUBRULE(this.expression);
    this.SUBRULE(this.blockStatement);
    this.OPTION(() => {
      this.CONSUME(Else);
      this.OR([
        { ALT: () => this.SUBRULE2(this.ifStatement) },
        { ALT: () => this.SUBRULE2(this.blockStatement) },
      ]);
    });
  });

  // for variable in iterable { ... }
  private forInStatement = this.RULE('forInStatement', () => {
    this.CONSUME(For);
    this.CONSUME(Identifier);  // Loop variable
    this.CONSUME(In);
    this.SUBRULE(this.expression);  // Iterable (array, number, or [start, end])
    this.SUBRULE(this.blockStatement);
  });

  // while condition { ... }
  private whileStatement = this.RULE('whileStatement', () => {
    this.CONSUME(While);
    this.SUBRULE(this.expression);  // Condition
    this.SUBRULE(this.blockStatement);
  });

  private blockStatement = this.RULE('blockStatement', () => {
    this.CONSUME(LBrace);
    this.MANY(() => {
      this.SUBRULE(this.statement);
    });
    this.CONSUME(RBrace);
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
      // AI operations
      {
        ALT: () => {
          this.CONSUME(Do);
          this.SUBRULE(this.expression);        // prompt
          this.SUBRULE2(this.expression);       // model
          this.SUBRULE(this.contextSpecifier);  // context
        },
      },
      {
        ALT: () => {
          this.CONSUME(Vibe);
          this.SUBRULE3(this.expression);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Ask);
          this.SUBRULE4(this.expression);       // prompt
          this.SUBRULE5(this.expression);       // model
          this.SUBRULE2(this.contextSpecifier); // context
        },
      },
      // Assignment expression (identifier = expression)
      {
        GATE: () => this.LA(1).tokenType === Identifier && this.LA(2).tokenType === Equals,
        ALT: () => this.SUBRULE(this.assignmentExpression),
      },
      // Logical or and below
      { ALT: () => this.SUBRULE(this.orExpression) },
    ]);
  });

  // Or: or (lowest precedence for logical)
  private orExpression = this.RULE('orExpression', () => {
    this.SUBRULE(this.andExpression);
    this.MANY(() => {
      this.CONSUME(Or);
      this.SUBRULE2(this.andExpression);
    });
  });

  // And: and
  private andExpression = this.RULE('andExpression', () => {
    this.SUBRULE(this.comparisonExpression);
    this.MANY(() => {
      this.CONSUME(And);
      this.SUBRULE2(this.comparisonExpression);
    });
  });

  // Comparison: == != < > <= >=
  private comparisonExpression = this.RULE('comparisonExpression', () => {
    this.SUBRULE(this.additiveExpression);
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(EqualEqual) },
        { ALT: () => this.CONSUME(NotEqual) },
        { ALT: () => this.CONSUME(LessThan) },
        { ALT: () => this.CONSUME(GreaterThan) },
        { ALT: () => this.CONSUME(LessEqual) },
        { ALT: () => this.CONSUME(GreaterEqual) },
      ]);
      this.SUBRULE2(this.additiveExpression);
    });
  });

  // Additive: + -
  private additiveExpression = this.RULE('additiveExpression', () => {
    this.SUBRULE(this.multiplicativeExpression);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(Plus) },
        { ALT: () => this.CONSUME(Minus) },
      ]);
      this.SUBRULE2(this.multiplicativeExpression);
    });
  });

  // Multiplicative: * / %
  private multiplicativeExpression = this.RULE('multiplicativeExpression', () => {
    this.SUBRULE(this.unaryExpression);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(Star) },
        { ALT: () => this.CONSUME(Slash) },
        { ALT: () => this.CONSUME(Percent) },
      ]);
      this.SUBRULE2(this.unaryExpression);
    });
  });

  // Unary: not, -
  private unaryExpression = this.RULE('unaryExpression', () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Not);
          this.SUBRULE(this.unaryExpression);
        },
      },
      {
        // Unary minus: only when Minus is at start and followed by expression
        // This is tricky because binary minus also uses Minus token
        // We use GATE to check this is actually at the start of a unary context
        GATE: () => this.LA(1).tokenType === Minus,
        ALT: () => {
          this.CONSUME(Minus);
          this.SUBRULE2(this.unaryExpression);
        },
      },
      { ALT: () => this.SUBRULE(this.rangeExpression) },
    ]);
  });

  // Range: ..
  private rangeExpression = this.RULE('rangeExpression', () => {
    this.SUBRULE(this.postfixExpression);
    this.OPTION(() => {
      this.CONSUME(DotDot);
      this.SUBRULE2(this.postfixExpression);
    });
  });

  private assignmentExpression = this.RULE('assignmentExpression', () => {
    this.CONSUME(Identifier);
    this.CONSUME(Equals);
    this.SUBRULE(this.expression);
  });

  private contextSpecifier = this.RULE('contextSpecifier', () => {
    this.OR([
      { ALT: () => this.CONSUME(Default) },
      { ALT: () => this.CONSUME(Local) },
      { ALT: () => this.CONSUME(Identifier) },
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
            this.CONSUME(LParen);
            this.OPTION(() => {
              this.SUBRULE(this.argumentList);
            });
            this.CONSUME(RParen);
          },
        },
        // Indexing/slicing: [expr] or [expr,expr] or [,expr] or [expr,]
        {
          ALT: () => {
            this.CONSUME(LBracket);
            this.SUBRULE(this.indexOrSlice);
            this.CONSUME(RBracket);
          },
        },
        // Member access: .identifier
        {
          ALT: () => {
            this.CONSUME(Dot);
            this.CONSUME(Identifier);
          },
        },
      ]);
    });
  });

  // Index or slice inside brackets
  // [expr] = single index
  // [expr,expr] = slice
  // [,expr] = slice from start
  // [expr,] = slice to end
  private indexOrSlice = this.RULE('indexOrSlice', () => {
    this.OR([
      // Starts with comma: [,expr] (slice from start)
      {
        GATE: () => this.LA(1).tokenType === Comma,
        ALT: () => {
          this.CONSUME(Comma);
          this.SUBRULE(this.expression);
        },
      },
      // Starts with expression
      {
        ALT: () => {
          this.SUBRULE2(this.expression);
          // Check if followed by comma (slice)
          this.OPTION(() => {
            this.CONSUME2(Comma);
            // Optional end expression: [expr,] vs [expr,expr]
            this.OPTION2(() => {
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
      this.CONSUME(Comma);
      this.SUBRULE2(this.expression);
    });
  });

  private primaryExpression = this.RULE('primaryExpression', () => {
    this.OR([
      { ALT: () => this.CONSUME(TsBlock) },  // ts(params) { body }
      { ALT: () => this.CONSUME(StringLiteral) },
      { ALT: () => this.CONSUME(TemplateLiteral) },
      { ALT: () => this.CONSUME(NumberLiteral) },
      { ALT: () => this.CONSUME(True) },
      { ALT: () => this.CONSUME(False) },
      { ALT: () => this.SUBRULE(this.objectLiteralExpr) },
      { ALT: () => this.SUBRULE(this.arrayLiteral) },
      { ALT: () => this.CONSUME(Identifier) },
      {
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.expression);
          this.CONSUME(RParen);
        },
      },
    ]);
  });

  private objectLiteralExpr = this.RULE('objectLiteralExpr', () => {
    this.CONSUME(LBrace);
    this.OPTION(() => {
      this.SUBRULE(this.propertyList);
    });
    this.CONSUME(RBrace);
  });

  private arrayLiteral = this.RULE('arrayLiteral', () => {
    this.CONSUME(LBracket);
    this.OPTION(() => {
      this.SUBRULE(this.elementList);
    });
    this.CONSUME(RBracket);
  });

  private elementList = this.RULE('elementList', () => {
    this.SUBRULE(this.expression);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.expression);
    });
  });
}

// Create a singleton parser instance
export const vibeParser = new VibeParser();

// Export the parser class for visitor creation
export { VibeParser };
