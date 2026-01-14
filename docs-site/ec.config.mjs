import fs from 'node:fs';
import { defineEcConfig } from 'astro-expressive-code';

// Load simplified Vibe grammar (without TypeScript embedding that caused issues)
const vibeGrammar = JSON.parse(
	fs.readFileSync(new URL('./vibe-grammar.json', import.meta.url), 'utf-8')
);

export default defineEcConfig({
	shiki: {
		langs: [vibeGrammar],
	},
});
