// Version (updated by publish script)
export const VERSION = '0.1.11';

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
import { Runtime, AIProvider, createRealAIProvider, dumpAIInteractions } from './runtime';

// Simple mock AI provider for testing
class MockAIProvider implements AIProvider {
  async execute(prompt: string) {
    return { value: `[AI Response to: ${prompt}]` };
  }

  async generateCode(prompt: string) {
    return { value: `// Generated code for: ${prompt}\nlet result = "generated"` };
  }

  async askUser(prompt: string): Promise<string> {
    return `[User response to: ${prompt}]`;
  }
}

// Options for running a vibe program
export interface RunVibeOptions {
  aiProvider?: AIProvider;
  file?: string;
}

// Main function to run a vibe program
export async function runVibe(source: string, options?: RunVibeOptions): Promise<unknown> {
  // 1. Parse
  const ast = parse(source, { file: options?.file });

  // 2. Semantic analysis
  const errors = analyze(ast, source);
  if (errors.length > 0) {
    throw errors[0];
  }

  // 3. Runtime
  const runtime = new Runtime(ast, options?.aiProvider ?? new MockAIProvider(), { basePath: options?.file });
  return runtime.run();
}

// CLI entry point
async function main(): Promise<void> {
  const args = Bun.argv.slice(2);

  // Handle upgrade/update command
  if (args[0] === 'upgrade' || args[0] === 'update') {
    const targetVersion = args[1] || 'latest';
    const packageSpec = `@vibe-lang/vibe@${targetVersion}`;
    console.log(`Upgrading vibe to ${targetVersion}...`);
    console.log(`Running: npm install -g ${packageSpec}\n`);

    const isWindows = process.platform === 'win32';
    if (isWindows) {
      // On Windows, use 'start /b' to run npm in background without new window
      // This allows vibe.exe to exit before npm tries to clean up
      Bun.spawn(['cmd', '/c', 'start', '/b', 'npm', 'install', '-g', packageSpec], {
        stdout: 'inherit',
        stderr: 'inherit',
      });
      process.exit(0);
    } else {
      // On Unix, just run npm directly and wait
      const proc = Bun.spawn(['npm', 'install', '-g', packageSpec], {
        stdout: 'inherit',
        stderr: 'inherit',
      });
      const exitCode = await proc.exited;
      process.exit(exitCode);
    }
  }

  // Handle version flag
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`vibe ${VERSION}`);
    return;
  }

  // Parse flags
  const logAi = args.includes('--log-ai');
  const fileArgs = args.filter(arg => !arg.startsWith('--'));

  if (fileArgs.length === 0) {
    console.log('Vibe - AI Agent Orchestration Language');
    console.log('Usage: vibe [command] [options] <file.vibe>');
    console.log('');
    console.log('Commands:');
    console.log('  upgrade [version]   Update vibe (default: latest)');
    console.log('');
    console.log('Options:');
    console.log('  --log-ai       Show detailed AI interaction logs');
    console.log('  -v, --version  Show version number');
    console.log('');
    console.log('Example program:');
    console.log('  let x = "hello"');
    console.log('  let y = vibe "what is 2 + 2?"');
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
    const ast = parse(source, { file: filePath });
    const errors = analyze(ast, source);
    if (errors.length > 0) {
      throw errors[0];
    }

    // Create runtime with logging option
    const runtime: Runtime = new Runtime(
      ast,
      createRealAIProvider(() => runtime.getState()),
      { basePath: filePath, logAiInteractions: logAi }
    );

    const result = await runtime.run();

    // Dump AI interactions if logging was enabled (auto-saved by Runtime)
    if (logAi) {
      const state = runtime.getState();
      if (state.aiInteractions.length > 0) {
        dumpAIInteractions(state);
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
