---
title: '在 Markdown 里写公式'
description: '本主题已接入 remark-math + rehype-katex，支持行内与块级 LaTeX。'
pubDate: '2026-07-13'
heroImage: '../../assets/blog-placeholder-3.jpg'
tags: ['Astro', 'Markdown', '排版']
featured: false
lang: 'zh'
translationKey: 'latex-math'
---

技术笔记里偶尔需要公式。墨间通过 KaTeX 在构建期渲染 LaTeX，无需浏览器端再算一遍。

## 行内公式

欧拉恒等式：$e^{i\pi} + 1 = 0$。也可以写 $\nabla \cdot \mathbf{E} = \rho / \varepsilon_0$。

## 块级公式

二次公式：

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

高斯积分：

$$
\int_{-\infty}^{\infty} e^{-x^2}\, dx = \sqrt{\pi}
$$

矩阵：

$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\begin{pmatrix}
x \\
y
\end{pmatrix}
=
\begin{pmatrix}
ax + by \\
cx + dy
\end{pmatrix}
$$

## 写法约定

| 场景 | 语法 |
|------|------|
| 行内 | `$...$` |
| 块级 | `$$...$$`（单独成段） |

复杂宏、宏包以 [KaTeX 支持列表](https://katex.org/docs/supported.html) 为准；不支持的命令会在构建时报错或显示错误提示。
