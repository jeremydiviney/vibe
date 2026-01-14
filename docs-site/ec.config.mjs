import { defineEcConfig } from 'astro-expressive-code';

// Use JavaScript highlighting for Vibe code blocks as a fallback
// until we can properly integrate the custom TextMate grammar
export default defineEcConfig({
	shiki: {
		langAlias: {
			vibe: 'javascript',
		},
	},
});
