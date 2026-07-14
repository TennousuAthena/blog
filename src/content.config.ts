import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// retainBody 默认 true：构建时导出 /blog/*.md 与 llms.txt 需要原文
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}', retainBody: true }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			tags: z.array(z.string()).default([]),
			featured: z.boolean().default(false),
			lang: z.enum(['zh', 'en']).default('zh'),
			/** Shared key so zh/en posts share one CWD comment thread */
			translationKey: z.string().optional(),
		}),
});

export const collections = { blog };
