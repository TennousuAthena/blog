import type { CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n/ui';

export function postSlug(post: CollectionEntry<'blog'>): string {
	return post.data.translationKey ?? post.id.replace(/^en\//, '');
}

/** HTML 页面对应的 Markdown 备用地址，如 /blog/foo.md */
export function postMarkdownPath(post: CollectionEntry<'blog'>, lang: Lang = post.data.lang): string {
	const slug = postSlug(post);
	return lang === 'en' ? `/en/blog/${slug}.md` : `/blog/${slug}.md`;
}

/** 供 LLM / alternate 使用的干净 Markdown（含 frontmatter） */
export function formatPostMarkdown(post: CollectionEntry<'blog'>): string {
	const { title, description, pubDate, updatedDate, tags, lang, translationKey } = post.data;
	const fm: string[] = [
		'---',
		`title: ${JSON.stringify(title)}`,
		`description: ${JSON.stringify(description)}`,
		`pubDate: ${pubDate.toISOString().slice(0, 10)}`,
	];
	if (updatedDate) fm.push(`updatedDate: ${updatedDate.toISOString().slice(0, 10)}`);
	if (tags.length) fm.push(`tags: ${JSON.stringify(tags)}`);
	fm.push(`lang: ${lang}`);
	if (translationKey) fm.push(`translationKey: ${JSON.stringify(translationKey)}`);
	fm.push('---', '', post.body?.trimEnd() ?? '', '');
	return fm.join('\n');
}

export function commentSlug(post: CollectionEntry<'blog'>): string {
	return `post/${post.data.translationKey ?? postSlug(post)}`;
}

export function sortPosts(posts: CollectionEntry<'blog'>[]) {
	return [...posts].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function postsByLang(posts: CollectionEntry<'blog'>[], lang: Lang) {
	return sortPosts(posts.filter((post) => post.data.lang === lang));
}

export function findTranslation(
	posts: CollectionEntry<'blog'>[],
	post: CollectionEntry<'blog'>,
	targetLang: Lang,
) {
	const key = post.data.translationKey ?? postSlug(post);
	return posts.find(
		(p) =>
			p.data.lang === targetLang &&
			(p.data.translationKey === key || postSlug(p) === key),
	);
}
