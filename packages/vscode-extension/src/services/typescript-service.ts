import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

/**
 * TypeScript Language Service wrapper for providing TS features
 * on imported TypeScript symbols in Vibe files
 */
export class TypeScriptService {
  private services: Map<string, ts.LanguageService> = new Map();
  private fileVersions: Map<string, number> = new Map();
  private fileContents: Map<string, string> = new Map();

  /**
   * Get or create a language service for a TypeScript file
   */
  private getServiceForFile(tsFilePath: string): ts.LanguageService {
    const dir = path.dirname(tsFilePath);

    // Check if we have a service for this directory
    let service = this.services.get(dir);
    if (service) return service;

    // Find tsconfig.json or use default options
    const configPath = ts.findConfigFile(dir, ts.sys.fileExists, 'tsconfig.json');
    let compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      allowJs: true,
    };

    if (configPath) {
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      if (configFile.config) {
        const parsed = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          path.dirname(configPath)
        );
        compilerOptions = parsed.options;
      }
    }

    // Create language service host
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => {
        // Return all .ts files we know about in this directory
        const files: string[] = [];
        for (const [file] of this.fileContents) {
          if (file.startsWith(dir) && file.endsWith('.ts')) {
            files.push(file);
          }
        }
        // Also include the requested file
        if (!files.includes(tsFilePath)) {
          files.push(tsFilePath);
        }
        return files;
      },
      getScriptVersion: (fileName) => {
        return String(this.fileVersions.get(fileName) || 0);
      },
      getScriptSnapshot: (fileName) => {
        let content = this.fileContents.get(fileName);
        if (!content) {
          try {
            content = fs.readFileSync(fileName, 'utf-8');
            this.fileContents.set(fileName, content);
            this.fileVersions.set(fileName, 1);
          } catch {
            return undefined;
          }
        }
        return ts.ScriptSnapshot.fromString(content);
      },
      getCurrentDirectory: () => dir,
      getCompilationSettings: () => compilerOptions,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    service = ts.createLanguageService(host, ts.createDocumentRegistry());
    this.services.set(dir, service);
    return service;
  }

  /**
   * Ensure a file is loaded in the service
   */
  private ensureFile(filePath: string): void {
    if (!this.fileContents.has(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.fileContents.set(filePath, content);
        this.fileVersions.set(filePath, 1);
      } catch {
        // File doesn't exist
      }
    }
  }

  /**
   * Get definition locations for a symbol in a TypeScript file
   */
  getDefinition(
    tsFilePath: string,
    symbolName: string
  ): { file: string; line: number; character: number } | null {
    const absPath = path.resolve(tsFilePath);
    this.ensureFile(absPath);

    const service = this.getServiceForFile(absPath);
    const content = this.fileContents.get(absPath);
    if (!content) return null;

    // Find the export position for this symbol
    const exportPos = this.findExportPosition(content, symbolName);
    if (exportPos === -1) return null;

    // Get definition at that position
    const definitions = service.getDefinitionAtPosition(absPath, exportPos);
    if (!definitions || definitions.length === 0) return null;

    const def = definitions[0];
    const sourceFile = service.getProgram()?.getSourceFile(def.fileName);
    if (!sourceFile) return null;

    const pos = sourceFile.getLineAndCharacterOfPosition(def.textSpan.start);
    return {
      file: def.fileName,
      line: pos.line,
      character: pos.character,
    };
  }

  /**
   * Get hover/quick info for a symbol in a TypeScript file
   */
  getHoverInfo(
    tsFilePath: string,
    symbolName: string
  ): { displayString: string; documentation: string } | null {
    const absPath = path.resolve(tsFilePath);
    this.ensureFile(absPath);

    const service = this.getServiceForFile(absPath);
    const content = this.fileContents.get(absPath);
    if (!content) return null;

    // Find the export position for this symbol
    const exportPos = this.findExportPosition(content, symbolName);
    if (exportPos === -1) return null;

    const info = service.getQuickInfoAtPosition(absPath, exportPos);
    if (!info) return null;

    const displayString = ts.displayPartsToString(info.displayParts);
    const documentation = ts.displayPartsToString(info.documentation || []);

    return { displayString, documentation };
  }

  /**
   * Find the position of an exported symbol in a file
   */
  private findExportPosition(content: string, symbolName: string): number {
    // Match various export patterns
    const patterns = [
      new RegExp(`export\\s+function\\s+(${symbolName})\\s*[(<]`),
      new RegExp(`export\\s+const\\s+(${symbolName})\\s*[=:]`),
      new RegExp(`export\\s+let\\s+(${symbolName})\\s*[=:]`),
      new RegExp(`export\\s+class\\s+(${symbolName})\\s*[{<]`),
      new RegExp(`export\\s+interface\\s+(${symbolName})\\s*[{<]`),
      new RegExp(`export\\s+type\\s+(${symbolName})\\s*[=<]`),
      new RegExp(`export\\s+enum\\s+(${symbolName})\\s*\\{`),
      new RegExp(`export\\s+\\{[^}]*\\b(${symbolName})\\b[^}]*\\}`), // export { symbolName }
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match.index !== undefined) {
        // Return position of the symbol name within the match
        const symbolIndex = match[0].indexOf(symbolName);
        return match.index + symbolIndex;
      }
    }

    // Try to find it as a named export or re-export
    const namedExportPattern = new RegExp(`\\b(${symbolName})\\b`);
    const match = content.match(namedExportPattern);
    if (match && match.index !== undefined) {
      return match.index;
    }

    return -1;
  }

  /**
   * Resolve a TypeScript import path relative to a Vibe file
   */
  resolveImportPath(vibeFilePath: string, importPath: string): string | null {
    const vibeDir = path.dirname(vibeFilePath);

    // Handle relative imports
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      let resolved = path.resolve(vibeDir, importPath);

      // Add .ts extension if not present
      if (!resolved.endsWith('.ts') && !resolved.endsWith('.js')) {
        if (fs.existsSync(resolved + '.ts')) {
          resolved += '.ts';
        } else if (fs.existsSync(resolved + '/index.ts')) {
          resolved = path.join(resolved, 'index.ts');
        }
      }

      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }

    return null;
  }

  /**
   * Clear cached data for a file (call when file changes)
   */
  invalidateFile(filePath: string): void {
    const absPath = path.resolve(filePath);
    this.fileContents.delete(absPath);
    const version = this.fileVersions.get(absPath) || 0;
    this.fileVersions.set(absPath, version + 1);
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.services.clear();
    this.fileVersions.clear();
    this.fileContents.clear();
  }
}

// Singleton instance
export const tsService = new TypeScriptService();
