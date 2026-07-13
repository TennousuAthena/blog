// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import mermaid from 'astro-mermaid';

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const site = (env.SITE || process.env.SITE || 'http://localhost:4321').replace(/\/$/, '');

/** 墨间 light palette — jade / mist */
const mermaidLight = {
	darkMode: false,
	background: 'transparent',
	fontFamily:
		'"Source Sans 3", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif',
	fontSize: '16px',
	primaryColor: '#cfe8e4',
	primaryTextColor: '#1a1d24',
	primaryBorderColor: '#0b7a6f',
	secondaryColor: '#e4e9f0',
	secondaryTextColor: '#1a1d24',
	secondaryBorderColor: '#7a8494',
	tertiaryColor: '#eef1f5',
	tertiaryTextColor: '#4a5160',
	tertiaryBorderColor: '#a3adb9',
	lineColor: '#4a5160',
	textColor: '#1a1d24',
	mainBkg: '#cfe8e4',
	nodeBorder: '#0b7a6f',
	clusterBkg: '#eef1f5',
	clusterBorder: '#0b7a6f',
	titleColor: '#1a1d24',
	edgeLabelBackground: '#eef1f5',
	actorBkg: '#cfe8e4',
	actorBorder: '#0b7a6f',
	actorTextColor: '#1a1d24',
	actorLineColor: '#4a5160',
	signalColor: '#1a1d24',
	signalTextColor: '#1a1d24',
	labelBoxBkgColor: '#eef1f5',
	labelBoxBorderColor: '#0b7a6f',
	labelTextColor: '#1a1d24',
	loopTextColor: '#1a1d24',
	noteBkgColor: '#e8edf3',
	noteTextColor: '#1a1d24',
	noteBorderColor: '#7a8494',
	activationBkgColor: '#b8ddd8',
	sequenceNumberColor: '#eef1f5',
};

// https://astro.build/config
export default defineConfig({
	site,
	integrations: [
		// Mermaid must run before other markdown-processing integrations
		mermaid({
			theme: 'base',
			// Site-owned theme bridge handles light/dark with 墨间 tokens
			autoTheme: false,
			enableLog: false,
			mermaidConfig: {
				themeVariables: mermaidLight,
				flowchart: {
					curve: 'basis',
					padding: 14,
					htmlLabels: true,
				},
				sequence: {
					actorMargin: 48,
					messageMargin: 36,
				},
			},
		}),
		mdx(),
		sitemap(),
	],
	i18n: {
		defaultLocale: 'zh',
		locales: ['zh', 'en'],
		routing: {
			prefixDefaultLocale: false,
		},
	},
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex],
		}),
		shikiConfig: {
			themes: {
				light: 'everforest-light',
				dark: 'everforest-dark',
			},
			defaultColor: false,
			wrap: true,
		},
	},
});
