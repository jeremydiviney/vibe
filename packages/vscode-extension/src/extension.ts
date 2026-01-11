import * as path from 'path';
import { ExtensionContext, workspace } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  // Path to the server module
  const serverModule = context.asAbsolutePath(path.join('out', 'server.js'));

  // Server options - run the server as a Node.js process
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  // Client options - documents to sync
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'vibe' }],
    synchronize: {
      // Watch for .vibe file changes
      fileEvents: workspace.createFileSystemWatcher('**/*.vibe'),
    },
  };

  // Create the client
  client = new LanguageClient(
    'vibeLanguageServer',
    'Vibe Language Server',
    serverOptions,
    clientOptions
  );

  // Register client for disposal on deactivation
  context.subscriptions.push(client);

  // Start the client (also starts the server)
  await client.start();
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}
