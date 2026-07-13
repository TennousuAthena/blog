export const SITE_TITLE = '墨间';
export const SITE_TITLE_EN = 'Ink Atelier';
export const SITE_AUTHOR = '墨间';

export const SITE = {
	zh: {
		title: SITE_TITLE,
		titleEn: SITE_TITLE_EN,
		description:
			'写给前端开发者与设计师的技术与审美笔记 —— 排版、交互、组件与视觉语言。',
	},
	en: {
		title: SITE_TITLE,
		titleEn: SITE_TITLE_EN,
		description:
			'Notes on craft for frontend developers and designers — typography, interaction, components, and visual language.',
	},
} as const;

export const SOCIAL = {
	github: 'https://github.com',
	twitter: 'https://twitter.com',
	rss: '/rss.xml',
};

/**
 * CWD comment system — https://cwd.js.org/
 * Deploy your own API via Cloudflare Workers, then fill these in.
 * Leave apiBaseUrl empty to show a setup hint instead of loading the widget.
 */
export const CWD = {
	/** e.g. https://your-cwd-api.workers.dev */
	apiBaseUrl: import.meta.env.PUBLIC_CWD_API_BASE_URL ?? '',
	siteId: import.meta.env.PUBLIC_CWD_SITE_ID ?? 'mojian',
	/** Lock widget version for stability */
	widgetVersion: '0.1.11',
};
