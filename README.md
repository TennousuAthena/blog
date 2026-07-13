# 墨间 Ink Atelier

面向**前端开发者与设计师**的 Astro 技术博客主题模板。强调中文排版、克制的视觉语言，以及可直接扩展的内容结构。

## 特性

- Astro 7 + Content Collections + MDX + RSS + Sitemap
- **i18n**：中文（默认 `/`）与英文（`/en/`），文章可用 `translationKey` 互链
- **日间 / 夜间**：玉青绿设计令牌双主题，跟随系统并记忆偏好
- **CWD 评论**：[cwd.js.org](https://cwd.js.org/) 接入，Shadow DOM + `customCssUrl` 对齐站点主题
- 中英字体配对：Instrument Serif / Source Sans 3 + Noto Serif SC / Noto Sans SC
- **LaTeX**：`remark-math` + `rehype-katex`（`$...$` / `$$...$$`）
- **Mermaid**：`astro-mermaid`，图表随墨间日夜间色板切换
- **TradingView**：`TradingViewChart` 嵌入 K 线，按容器宽度保持 4:3，跟随日夜间主题

## 快速开始

```bash
npm install
cp .env.example .env   # 配置 SITE 与 CWD（可选）
npm run dev
```

## 环境变量

在 `.env` 中配置：

```bash
# 博客正式域名（上线时改成你的地址，不要末尾斜杠）
SITE=https://your-blog.example.com

# CWD 评论 API（可选）
PUBLIC_CWD_API_BASE_URL=https://your-api.workers.dev
PUBLIC_CWD_SITE_ID=mojian
```

`SITE` 会写入 Astro `site`，供 canonical、RSS、sitemap、OG、CWD 自定义样式绝对地址使用。

### 本地测试评论

```bash
npm run cwd:mock   # http://127.0.0.1:8787
npm run dev        # 确保 .env 中 PUBLIC_CWD_API_BASE_URL=http://127.0.0.1:8787
```

打开任意文章页底部即可看到 CWD 组件（含种子评论）。正式上线时把 `PUBLIC_CWD_API_BASE_URL` 换成你的 Worker 地址。

## CWD 评论

1. 按 [CWD 文档](https://cwd.js.org/guide/getting-started.html) 部署 Cloudflare Workers API
2. 在 `.env` 填写 `PUBLIC_CWD_API_BASE_URL` 与 `PUBLIC_CWD_SITE_ID`
3. 未配置时文章页会显示接入提示，不影响其它功能
4. 主题样式见 `public/cwd-theme.css`；切换日夜间时会 `updateConfig({ theme })` 同步评论区

中英同一篇文章共用 `translationKey` 作为评论 `postSlug`，避免重复线程。

## 写文章

```md
---
title: '标题'
description: '摘要'
pubDate: '2026-07-13'
lang: 'zh'                 # zh | en
translationKey: 'my-post'  # 双语共享评论与语言切换
tags: ['排版', '前端']
featured: false
---
```

英文稿放在 `src/content/blog/en/`，并使用相同的 `translationKey`。

### 嵌入 TradingView K 线（MDX）

```mdx
import TradingViewChart from '../../components/TradingViewChart.astro';

<TradingViewChart symbol="BINANCE:BTCUSDT" interval="60" />
```

示例文章：`/blog/tradingview-chart/`。

## 自定义

| 文件 | 用途 |
|------|------|
| `src/consts.ts` | 站点名、社交、CWD 默认 |
| `src/i18n/ui.ts` | UI 文案（无顶栏语言切换，通过 `/` 与 `/en/` 路由访问） |
| `src/styles/global.css` | 日夜间设计令牌 |
| `public/cwd-theme.css` | CWD 评论主题覆盖 |
| `.env` | `SITE`、`PUBLIC_CWD_*` |

## 许可

基于 Astro Blog 模板改造，可自由用于个人与商业项目。
