# 奇异果网络日志 · Kiwi's web log

个人博客 —— 随记、记录与沉淀。站点：[blog.kiwi.moe](https://blog.kiwi.moe)。

文字核心由自己编写，句子上的润色大多借助生成式人工智能。

## 特性

- Astro 7 + Content Collections + MDX + RSS + Sitemap
- **i18n**：中文（默认 `/`）与英文（`/en/`）
- **日间 / 夜间**主题
- **CWD 评论**、**LaTeX**、**Mermaid**、**TradingView** K 线嵌入

## 快速开始

```bash
npm install
cp .env.example .env
npm run dev
```

## 环境变量

```bash
SITE=https://blog.kiwi.moe
PUBLIC_CWD_API_BASE_URL=
PUBLIC_CWD_SITE_ID=kiwi
```

本地测评论：`npm run cwd:mock`，并将 `PUBLIC_CWD_API_BASE_URL` 设为 `http://127.0.0.1:8787`。

## 写文章

在 `src/content/blog/`（英文在 `en/`）新增 Markdown / MDX，填写 `lang` 与可选的 `translationKey`。

## LLM 友好输出（构建时自动生成）

`npm run build` 会根据 Content Collections **自动**产出，无需手改：

| 产物 | 说明 |
|------|------|
| `/llms.txt` | 站点索引，列出全部文章 Markdown 链接 |
| `/blog/<slug>.md`、`/en/blog/<slug>.md` | 各博文原文 Markdown |
| 博文 `<head>` 中的 `rel="alternate" type="text/markdown"` | 指向对应 `.md` |

构建末尾会跑 `scripts/verify-llm-artifacts.mjs`，缺文件则失败。
