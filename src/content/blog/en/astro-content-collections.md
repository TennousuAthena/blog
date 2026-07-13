---
title: 'Astro Content Collections in Practice'
description: 'Schema-guarded frontmatter so lists, tags, and RSS share one content source.'
pubDate: '2026-06-28'
heroImage: '../../../assets/blog-placeholder-3.jpg'
tags: ['Astro', 'Engineering', 'Frontend']
featured: false
lang: 'en'
translationKey: 'astro-content-collections'
---

Astro Content Collections turn Markdown into a typed content source. For a blog theme, tags, featured flags, and dates become reliable page inputs.

## Minimal schema

```ts
z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  lang: z.enum(['zh', 'en']).default('zh'),
  translationKey: z.string().optional(),
})
```

`translationKey` lets zh/en posts share one CWD comment thread.

## Lists & filters

```ts
const posts = (await getCollection('blog'))
  .filter((p) => p.data.lang === 'en')
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
```

## When MDX is worth it

Use MDX when you embed interactive components or charts. Pure narrative stays lighter as Markdown.
