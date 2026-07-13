---
title: '组件的边界感'
description: '按钮、链接、卡片：什么时候该成为组件，什么时候只是一段样式？'
pubDate: '2026-06-18'
heroImage: '../../assets/blog-placeholder-4.jpg'
tags: ['组件', '设计', '前端']
featured: false
lang: 'zh'
translationKey: 'component-boundaries'
---

前端与设计师合作时，争论常落在「要不要做成组件」。一个实用标准是：**是否承载可复用的交互或语义**。

## 链接不是按钮

视觉上都可点击，但语义不同：链接导航，按钮提交或触发动作。博客主题里，「阅读文章」可以是链接伪装成按钮样式；表单提交才是真正的 `<button>`。

## 卡片的克制

若去掉边框、阴影、圆角后，内容仍清晰可读，它可能不需要成为卡片。列表项用分割线与悬停态往往更干净——尤其在长文归档页。

## 公开 API 要短

组件 props 一多，主题就难改。优先暴露：

- 内容槽（title / description）
- 少量变体（featured）
- 无障碍相关属性

其余交给 CSS 与设计 Token。
