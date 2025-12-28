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
  For,
  In,
  Break,
  Continue,
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
  Equals,
  LParen,
  RParen,
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  Comma,
  Colon,
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
      { ALT: () => this.SUBRULE(this.breakStatement) },
      { ALT: () => this.SUBRULE(this.continueStatement) },
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

  private breakStatement = this.RULE('breakStatement', () => {
    this.CONSUME(Break);
  });

  private continueStatement = this.RULE('continueStatement', () => {
    this.CONSUME(Continue);
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
  // Expressions (simplified - no operator precedence needed)
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
      // Call expression or primary
      { ALT: () => this.SUBRULE(this.callExpression) },
    ]);
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

  private callExpression = this.RULE('callExpression', () => {
    this.SUBRULE(this.primaryExpression);
    this.MANY(() => {
      this.CONSUME(LParen);
      this.OPTION(() => {
        this.SUBRULE(this.argumentList);
      });
      this.CONSUME(RParen);
    });
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
