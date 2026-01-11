import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { validateDocument } from './providers/diagnostics';
import { provideHover } from './providers/hover';
import { provideCompletions } from './providers/completion';
import { provideDocumentSymbols } from './providers/symbols';
import { provideDefinition } from './providers/definition';
import { provideReferences } from './providers/references';

// Create connection using all proposed features
const connection = createConnection(ProposedFeatures.all);

// Document manager with full sync for simplicity
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;

  // Check client capabilities
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', '@'],
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for configuration changes
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }

  connection.console.log('Vibe Language Server initialized');
});

// Validate document on open and change
documents.onDidChangeContent((change) => {
  validateAndSendDiagnostics(change.document);
});

async function validateAndSendDiagnostics(document: TextDocument): Promise<void> {
  try {
    const diagnostics = validateDocument(document);
    connection.sendDiagnostics({ uri: document.uri, diagnostics });
  } catch (error) {
    connection.console.error(`Validation error: ${error}`);
  }
}

// Provide completions
connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return provideCompletions(document, params.position);
});

// Provide hover information
connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return provideHover(document, params.position);
});

// Provide document symbols (outline)
connection.onDocumentSymbol((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return provideDocumentSymbols(document);
});

// Provide go to definition
connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return provideDefinition(document, params.position);
});

// Provide find references
connection.onReferences((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return provideReferences(document, params.position, params.context.includeDeclaration);
});

// Start listening
documents.listen(connection);
connection.listen();
