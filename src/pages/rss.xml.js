import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE } from '../consts';
import { postSlug } from '../lib/posts';

export async function GET(context) {
	const posts = (await getCollection('blog'))
		.filter((post) => post.data.lang === 'zh')
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

	return rss({
		title: SITE.zh.title,
		description: SITE.zh.description,
		site: context.site,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: `/blog/${postSlug(post)}/`,
		})),
	});
}
