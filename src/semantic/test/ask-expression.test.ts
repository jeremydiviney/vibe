import { describe, expect, test } from 'bun:test';
import { parse } from '../../parser/parse';
import { analyze } from '../index';

describe('Semantic Analysis - Ask Expression', () => {
  // ============================================================================
  // Undefined variables in ask prompt
  // ============================================================================

  test('ask with undefined variable as prompt', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = ask undefinedPrompt myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedPrompt' is not defined");
  });

  test('ask with undefined model', () => {
    const ast = parse(`let x = ask "prompt" undefinedModel default`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedModel' is not defined");
  });

  test('ask with undefined context variable', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = ask "prompt" myModel undefinedContext
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'undefinedContext' is not defined");
  });

  // ============================================================================
  // Model type constraints
  // ============================================================================

  test('ask with variable as model argument', () => {
    const ast = parse(`
let notAModel = "test"
let x = ask "prompt" notAModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Expected model, got variable 'notAModel'");
  });

  test('ask with constant as model argument', () => {
    const ast = parse(`
const notAModel = "test"
let x = ask "prompt" notAModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Expected model, got constant 'notAModel'");
  });

  test('ask with function as model argument', () => {
    const ast = parse(`
function notAModel(): text {
  return "test"
}
let x = ask "prompt" notAModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Expected model, got function 'notAModel'");
  });

  test('ask with parameter as model argument', () => {
    const ast = parse(`
model realModel = { name: "test", apiKey: "key", url: "http://test" }
function test(notAModel: text): text {
  let x = ask "prompt" notAModel default
  return x
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Expected model, got parameter 'notAModel'");
  });

  // ============================================================================
  // Valid ask expressions
  // ============================================================================

  test('ask with string literal - no errors', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let name = ask "What is your name?" myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('ask with defined variable prompt - no errors', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let question = "How old are you?"
let answer = ask question myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('ask with function parameter - no errors', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
function getInput(message: text): text {
  return ask message myModel default
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('ask with local context - no errors', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = ask "Question?" myModel local
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('ask with variable context - no errors', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let myContext = "some context"
let x = ask "Question?" myModel myContext
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('ask in function accessing global variables - no errors', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let globalPrompt = "Global question"
function askGlobal(): text {
  let a = ask globalPrompt myModel default
  return a
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Ask with other semantic errors
  // ============================================================================

  test('ask result assigned to duplicate variable', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = "first"
let x = ask "What?" myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'x' is already declared");
  });

  test('ask inside function with return outside function error', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
return ask "Invalid return" myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('return outside of function');
  });

  // ============================================================================
  // Ask in block scopes
  // ============================================================================

  test('ask with variable from outer scope', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let question = "Outer question"
if true {
  let answer = ask question myModel default
}
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  test('ask with variable from inner scope - error', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
if true {
  let question = "Inner question"
}
let answer = ask question myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'question' is not defined");
  });

  // ============================================================================
  // Multiple ask expressions with errors
  // ============================================================================

  test('multiple ask expressions with undefined variables', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let a = ask undefined1 myModel default
let b = ask undefined2 myModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe("'undefined1' is not defined");
    expect(errors[1].message).toBe("'undefined2' is not defined");
  });

  test('multiple ask expressions with wrong model types', () => {
    const ast = parse(`
let notAModel = "test"
let a = ask "prompt1" notAModel default
let b = ask "prompt2" notAModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe("Expected model, got variable 'notAModel'");
    expect(errors[1].message).toBe("Expected model, got variable 'notAModel'");
  });

  // ============================================================================
  // Ask combined with other expressions
  // ============================================================================

  test('ask as function argument with undefined callee', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
let x = unknownFunc(ask "test" myModel default)
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("'unknownFunc' is not defined");
  });

  test('ask in valid function call', () => {
    const ast = parse(`
model myModel = { name: "test", apiKey: "key", url: "http://test" }
function process(input: text): text {
  return input
}
let x = process(ask "Enter value" myModel default)
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(0);
  });

  // ============================================================================
  // Combined errors: undefined model and wrong type
  // ============================================================================

  test('undefined model and wrong type model in different asks', () => {
    const ast = parse(`
let notAModel = "test"
let x = ask "prompt1" undefinedModel default
let y = ask "prompt2" notAModel default
`);
    const errors = analyze(ast);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toBe("'undefinedModel' is not defined");
    expect(errors[1].message).toBe("Expected model, got variable 'notAModel'");
  });
});
