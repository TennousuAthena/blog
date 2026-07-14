export const SITE_TITLE = '奇异果网络日志';
export const SITE_TITLE_EN = "Kiwi's web log";
export const SITE_MARK = '奇';
export const SITE_AUTHOR = '奇异果';
export const SITE_URL = 'https://blog.kiwi.moe';

export const SITE = {
	zh: {
		title: SITE_TITLE,
		titleEn: SITE_TITLE_EN,
		description: '随记、记录与沉淀 —— blog.kiwi.moe。文字由自己写就，偶有生成式 AI 润色。',
	},
	en: {
		title: SITE_TITLE,
		titleEn: SITE_TITLE_EN,
		description:
			'A personal notebook for notes, records, and reflections — blog.kiwi.moe. Written by me; occasionally polished with generative AI.',
	},
} as const;

export const SOCIAL = {
	github: 'https://github.com/tennousuAthena/blog',
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
	siteId: import.meta.env.PUBLIC_CWD_SITE_ID ?? 'kiwi',
	/** Lock widget version for stability */
	widgetVersion: '0.1.11',
};
