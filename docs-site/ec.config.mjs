import fs from 'node:fs';
import { defineEcConfig } from 'astro-expressive-code';

// Load Vibe TextMate grammar for syntax highlighting
const vibeGrammarRaw = JSON.parse(
	fs.readFileSync('../packages/vscode-extension/syntaxes/vibe.tmLanguage.json', 'utf-8')
);

// Create proper Shiki language definition
const vibeLanguage = {
	...vibeGrammarRaw,
	name: 'vibe',  // Override to lowercase for code block matching
	aliases: ['vibe'],
};

export default defineEcConfig({
	shiki: {
		langs: [vibeLanguage],
	},
});
