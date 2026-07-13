import type { CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n/ui';

export function postSlug(post: CollectionEntry<'blog'>): string {
	return post.data.translationKey ?? post.id.replace(/^en\//, '');
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
