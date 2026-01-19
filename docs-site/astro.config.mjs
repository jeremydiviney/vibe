// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://vibelang.net',
	base: '/docs',
	integrations: [
		starlight({
			title: 'Vibe',
			logo: {
				light: './src/assets/vibe-logo-dark.png',
				dark: './src/assets/vibe-logo.png',
				replacesTitle: true,
			},
			components: {
				ThemeProvider: './src/components/ThemeProvider.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
			},
			// Custom language config is in ec.config.mjs
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/vibelang-org/vibe' },
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Hello World', slug: 'getting-started/hello-world' },
					],
				},
				{
					label: 'Language Guide',
					items: [
						{ label: 'Basic Syntax', slug: 'guide/basics' },
						{ label: 'Types', slug: 'guide/types' },
						{ label: 'Control Flow', slug: 'guide/control-flow' },
						{ label: 'Functions', slug: 'guide/functions' },
						{ label: 'Modules', slug: 'guide/modules' },
						{ label: 'Error Handling', slug: 'guide/error-handling' },
					],
				},
				{
					label: 'AI Features',
					items: [
						{ label: 'AI Prompts', slug: 'ai/prompts' },
						{ label: 'Models', slug: 'ai/models' },
						{ label: 'Tools', slug: 'ai/tools' },
						{ label: 'Context Management', slug: 'ai/context' },
						{ label: 'Async Execution', slug: 'ai/async' },
					],
				},
				{
					label: 'TypeScript Interop',
					items: [
						{ label: 'TS Blocks', slug: 'typescript/blocks' },
						{ label: 'Importing Modules', slug: 'typescript/imports' },
					],
				},
				{
					label: 'Reference',
					autogenerate: { directory: 'reference' },
				},
			],
			customCss: [
				'./src/styles/custom.css',
			],
		}),
	],
});
