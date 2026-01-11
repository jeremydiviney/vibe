import { describe, it, expect } from 'bun:test';
import { provideDocumentFormatting } from '../providers/formatting';
import { TextDocument } from 'vscode-languageserver-textdocument';

function createDocument(content: string): TextDocument {
  return TextDocument.create('file:///test.vibe', 'vibe', 1, content);
}

function format(content: string, tabSize = 2, insertSpaces = true): string {
  const doc = createDocument(content);
  const edits = provideDocumentFormatting(doc, { tabSize, insertSpaces });
  return edits[0].newText;
}

describe('Document Formatting Provider', () => {
  describe('Indentation', () => {
    it('should indent function body', () => {
      const input = `function greet() {
let x = 1
return x
}`;
      const result = format(input);

      expect(result).toBe(`function greet() {
  let x = 1
  return x
}
`);
    });

    it('should handle nested blocks', () => {
      const input = `function test() {
if true {
let x = 1
}
}`;
      const result = format(input);

      expect(result).toBe(`function test() {
  if true {
    let x = 1
  }
}
`);
    });

    it('should use tabs when insertSpaces is false', () => {
      const input = `function test() {
let x = 1
}`;
      const result = format(input, 4, false);

      expect(result).toBe(`function test() {
\tlet x = 1
}
`);
    });

    it('should respect tabSize', () => {
      const input = `function test() {
let x = 1
}`;
      const result = format(input, 4, true);

      expect(result).toBe(`function test() {
    let x = 1
}
`);
    });
  });

  describe('Operator spacing', () => {
    it('should normalize assignment spacing', () => {
      const input = `let x=1`;
      const result = format(input);

      expect(result).toContain('let x = 1');
    });

    it('should normalize arithmetic spacing', () => {
      const input = `let x = 1+2*3`;
      const result = format(input);

      expect(result).toContain('1 + 2 * 3');
    });

    it('should normalize comparison spacing', () => {
      const input = `if x>0 and y<=10 {`;
      const result = format(input);

      expect(result).toContain('x > 0 and y <= 10');
    });
  });

  describe('Punctuation spacing', () => {
    it('should format commas', () => {
      const input = `function add(a:number,b:number) {`;
      const result = format(input);

      expect(result).toContain('a: number, b: number');
    });

    it('should format colons in type annotations', () => {
      const input = `let x:text = "hello"`;
      const result = format(input);

      expect(result).toContain('let x: text');
    });

    it('should format braces', () => {
      const input = `if true{`;
      const result = format(input);

      expect(result).toContain('if true {');
    });
  });

  describe('String preservation', () => {
    it('should preserve string contents', () => {
      const input = `let x = "hello   world"`;
      const result = format(input);

      expect(result).toContain('"hello   world"');
    });

    it('should preserve single-quoted strings', () => {
      const input = `let x = 'hello=world'`;
      const result = format(input);

      expect(result).toContain("'hello=world'");
    });

    it('should preserve template literals', () => {
      const input = 'let x = `hello ${name}`';
      const result = format(input);

      expect(result).toContain('`hello ${name}`');
    });
  });

  describe('Comments', () => {
    it('should preserve line comments', () => {
      const input = `// This is a comment
let x = 1`;
      const result = format(input);

      expect(result).toContain('// This is a comment');
    });
  });

  describe('Empty lines', () => {
    it('should preserve empty lines', () => {
      const input = `let x = 1

let y = 2`;
      const result = format(input);

      expect(result).toContain('\n\n');
    });
  });

  describe('Trailing newline', () => {
    it('should ensure file ends with newline', () => {
      const input = `let x = 1`;
      const result = format(input);

      expect(result.endsWith('\n')).toBe(true);
    });
  });

  describe('Array and range formatting', () => {
    it('should format array literals', () => {
      const input = `let arr = [1,2,3]`;
      const result = format(input);

      expect(result).toContain('[1, 2, 3]');
    });

    it('should format range operator', () => {
      const input = `for i in 0 .. 10 {`;
      const result = format(input);

      expect(result).toContain('0..10');
    });
  });
});
