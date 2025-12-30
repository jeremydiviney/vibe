// Re-export public API
export { VibeLexer, tokenize, allTokens } from './lexer';
export { vibeParser } from './parser';
export { parse } from './parser/parse';
export { analyze } from './semantic';
export { Runtime, RuntimeStatus } from './runtime';
export type { RuntimeState, AIProvider } from './runtime';
export * as AST from './ast';
export * from './errors';

import { parse } from './parser/parse';
import { analyze } from './semantic';
import { Runtime, AIProvider, createRealAIProvider, dumpAIInteractions, saveAIInteractions } from './runtime';
import { dirname } from 'path';

// Simple mock AI provider for testing
class MockAIProvider implements AIProvider {
  async execute(prompt: string): Promise<string> {
    return `[AI Response to: ${prompt}]`;
  }

  async generateCode(prompt: string): Promise<string> {
    return `// Generated code for: ${prompt}\nlet result = "generated"`;
  }

  async askUser(prompt: string): Promise<string> {
    return `[User response to: ${prompt}]`;
  }
}

// Main function to run a vibe program
export async function runVibe(source: string, aiProvider?: AIProvider): Promise<unknown> {
  // 1. Parse
  const ast = parse(source);

  // 2. Semantic analysis
  const errors = analyze(ast, source);
  if (errors.length > 0) {
    throw errors[0];
  }

  // 3. Runtime
  const runtime = new Runtime(ast, aiProvider ?? new MockAIProvider());
  return runtime.run();
}

// CLI entry point
async function main(): Promise<void> {
  const args = Bun.argv.slice(2);

  // Parse flags
  const logAi = args.includes('--log-ai');
  const fileArgs = args.filter(arg => !arg.startsWith('--'));

  if (fileArgs.length === 0) {
    console.log('Vibe - AI Agent Orchestration Language');
    console.log('Usage: bun run src/index.ts [options] <file.vibe>');
    console.log('');
    console.log('Options:');
    console.log('  --log-ai    Show detailed AI interaction logs');
    console.log('');
    console.log('Example program:');
    console.log('  let x = "hello"');
    console.log('  let y = do "what is 2 + 2?"');
    console.log('  function greet(name) {');
    console.log('    return "Hello, {name}!"');
    console.log('  }');
    return;
  }

  const filePath = fileArgs[0];
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = await file.text();

  try {
    // Parse and analyze
    const ast = parse(source);
    const errors = analyze(ast, source);
    if (errors.length > 0) {
      throw errors[0];
    }

    // Create runtime with logging option
    const runtime = new Runtime(
      ast,
      createRealAIProvider(() => runtime.getState()),
      { basePath: filePath, logAiInteractions: logAi }
    );

    const result = await runtime.run();

    // Dump and save AI interactions if logging was enabled
    if (logAi) {
      const interactions = runtime.getAIInteractions();
      if (interactions.length > 0) {
        dumpAIInteractions(interactions);
        const projectRoot = dirname(filePath);
        const savedPath = saveAIInteractions(interactions, projectRoot);
        if (savedPath) {
          console.log(`AI interaction log saved to: ${savedPath}`);
        }
      }
    }

    if (result !== null && result !== undefined) {
      console.log('Result:', result);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}
