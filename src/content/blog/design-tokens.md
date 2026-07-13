---
title: '设计 Token：从颜色到节奏'
description: '用一套可命名的变量约束视觉决策，让博客主题在扩张时仍保持一致性。'
pubDate: '2026-07-06'
heroImage: '../../assets/blog-placeholder-2.jpg'
tags: ['设计系统', 'CSS', '前端']
featured: false
lang: 'zh'
translationKey: 'design-tokens'
---

设计 Token 不是「多几个 CSS 变量」这么简单，而是给视觉决策起名字：什么叫纸色、什么叫强调色、什么叫正文度量。

## 分层命名

建议至少分三层：

1. **原始值**（raw）：`#0b7a6f`
2. **语义别名**（alias）：`--accent`
3. **组件映射**（component）：按钮背景引用 `--accent`

博客主题规模较小时，alias + component 两层通常足够。

## 节奏 Token

除了颜色，间距与字号同样需要节奏：

```css
:root {
  --space-sm: 0.65rem;
  --space-md: 1.15rem;
  --space-lg: 2rem;
  --measure: 42rem;
}
```

`--measure` 控制阅读栏宽；中文正文常用 40–45 字宽，比英文略窄更易扫读。

## 少即是多

Token 过多等于没有约束。先定纸色、墨色、强调色、分割线、正文字族五类，再按需扩展。扩张主题时，先问：「这是新语义，还是已有 Token 的变体？」
