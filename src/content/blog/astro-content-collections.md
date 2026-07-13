---
title: 'Astro Content Collections 实战'
description: '用 schema 约束 frontmatter，让文章列表、标签页与 RSS 都建立在同一数据源上。'
pubDate: '2026-06-28'
heroImage: '../../assets/blog-placeholder-3.jpg'
tags: ['Astro', '工程化', '前端']
featured: false
lang: 'zh'
translationKey: 'astro-content-collections'
---

Astro 的 Content Collections 把 Markdown 变成类型安全的内容源。对博客主题而言，这意味着标签、精选与日期都可以被页面可靠消费。

## 最小 schema

```ts
z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
})
```

`coerce.date` 允许 frontmatter 写字符串日期；`default([])` 避免漏写标签时报错。

## 列表与筛选

```ts
const posts = (await getCollection('blog'))
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
```

标签页只需 `flatMap` 收集唯一 tag，再按 tag 过滤——无需额外 CMS。

## MDX 何时值得

需要在文章中嵌入交互组件、图表或自定义 callout 时再上 MDX。纯叙述性文章用 Markdown 更轻。
