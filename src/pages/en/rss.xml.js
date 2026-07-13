import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE } from '../../consts';
import { postSlug } from '../../lib/posts';

export async function GET(context) {
	const posts = (await getCollection('blog'))
		.filter((post) => post.data.lang === 'en')
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

	return rss({
		title: `${SITE.en.title} · EN`,
		description: SITE.en.description,
		site: context.site,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: `/en/blog/${postSlug(post)}/`,
		})),
	});
}
