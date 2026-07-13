---
title: 'Writing Math in Markdown'
description: 'This theme ships remark-math + rehype-katex for inline and display LaTeX.'
pubDate: '2026-07-13'
heroImage: '../../../assets/blog-placeholder-3.jpg'
tags: ['Astro', 'Markdown', 'Typography']
featured: false
lang: 'en'
translationKey: 'latex-math'
---

Technical notes sometimes need equations. Ink Atelier renders LaTeX with KaTeX at build time.

## Inline

Euler's identity: $e^{i\pi} + 1 = 0$. You can also write $\nabla \cdot \mathbf{E} = \rho / \varepsilon_0$.

## Display

The quadratic formula:

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

Gaussian integral:

$$
\int_{-\infty}^{\infty} e^{-x^2}\, dx = \sqrt{\pi}
$$

## Syntax

| Use | Delimiter |
|-----|-----------|
| Inline | `$...$` |
| Display | `$$...$$` on its own lines |

See the [KaTeX supported functions](https://katex.org/docs/supported.html) for available commands.
