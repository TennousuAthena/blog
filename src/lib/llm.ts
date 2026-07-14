import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { SITE, SITE_TITLE, SITE_TITLE_EN, SITE_URL, SOCIAL } from '../consts';
import type { Lang } from '../i18n/ui';
import { formatPostMarkdown, postMarkdownPath, postSlug, postsByLang } from './posts';

/** 静态构建时预渲染 Markdown / llms.txt（随 Content Collections 自动更新） */
export const prerender = true;

export function blogMarkdownStaticPaths(lang: Lang): GetStaticPaths {
	return async () => {
		const posts = postsByLang(await getCollection('blog'), lang);
		return posts.map((post) => ({
			params: { slug: postSlug(post) },
			props: { post },
		}));
	};
}

type MdProps = { post: CollectionEntry<'blog'> };

export const blogMarkdownGET: APIRoute<MdProps> = ({ props }) =>
	new Response(formatPostMarkdown(props.post), {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});

export const llmsTxtGET: APIRoute = async ({ site }) => {
	const origin = (site?.origin || SITE_URL).replace(/\/$/, '');
	const all = await getCollection('blog');
	const zh = postsByLang(all, 'zh');
	const en = postsByLang(all, 'en');
	const abs = (path: string) => `${origin}${path.startsWith('/') ? path : `/${path}`}`;

	const lines: string[] = [
		`# ${SITE_TITLE}`,
		'',
		`> ${SITE.zh.description}`,
		'',
		`${SITE_TITLE_EN}（${origin}）。核心内容由作者撰写，语句润色大多借助生成式人工智能。`,
		'每篇文章提供 Markdown 备用版本（同路径加 `.md`），在 `astro build` 时由 Content Collections 自动生成。',
		'',
		'## Posts',
		'',
	];

	for (const post of zh) {
		lines.push(
			`- [${post.data.title}](${abs(postMarkdownPath(post, 'zh'))}): ${post.data.description}`,
		);
	}

	if (en.length) {
		lines.push('', '## English', '');
		for (const post of en) {
			lines.push(
				`- [${post.data.title}](${abs(postMarkdownPath(post, 'en'))}): ${post.data.description}`,
			);
		}
	}

	lines.push(
		'',
		'## Optional',
		'',
		`- [About](${abs('/about/')}): 关于本站（随记、记录与沉淀）`,
		`- [RSS](${abs('/rss.xml')}): 中文订阅源`,
		`- [GitHub](${SOCIAL.github}): 本站源码`,
		'',
	);

	return new Response(lines.join('\n'), {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
