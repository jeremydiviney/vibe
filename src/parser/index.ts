import { CstParser } from 'chevrotain';
import {
  allTokens,
  Let,
  Const,
  Vibe,
  Do,
  Function,
  Return,
  If,
  Else,
  Break,
  Continue,
  True,
  False,
  Model,
  Default,
  Local,
  StringLiteral,
  Identifier,
  Equals,
  LParen,
  RParen,
  LBrace,
  RBrace,
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
      { ALT: () => this.SUBRULE(this.letDeclaration) },
      { ALT: () => this.SUBRULE(this.constDeclaration) },
      { ALT: () => this.SUBRULE(this.modelDeclaration) },
      { ALT: () => this.SUBRULE(this.functionDeclaration) },
      { ALT: () => this.SUBRULE(this.returnStatement) },
      { ALT: () => this.SUBRULE(this.ifStatement) },
      { ALT: () => this.SUBRULE(this.breakStatement) },
      { ALT: () => this.SUBRULE(this.continueStatement) },
      { ALT: () => this.SUBRULE(this.blockStatement) },
      { ALT: () => this.SUBRULE(this.expressionStatement) },
    ]);
  });

  private letDeclaration = this.RULE('letDeclaration', () => {
    this.CONSUME(Let);
    this.CONSUME(Identifier);
    this.OPTION(() => {
      this.CONSUME(Equals);
      this.SUBRULE(this.expression);
    });
  });

  private constDeclaration = this.RULE('constDeclaration', () => {
    this.CONSUME(Const);
    this.CONSUME(Identifier);
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
    this.SUBRULE(this.blockStatement);
  });

  private parameterList = this.RULE('parameterList', () => {
    this.CONSUME(Identifier);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.CONSUME2(Identifier);
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
      // Call expression or primary
      { ALT: () => this.SUBRULE(this.callExpression) },
    ]);
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
      { ALT: () => this.CONSUME(StringLiteral) },
      { ALT: () => this.CONSUME(True) },
      { ALT: () => this.CONSUME(False) },
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
}

// Create a singleton parser instance
export const vibeParser = new VibeParser();

// Export the parser class for visitor creation
export { VibeParser };
