---
title: 'Design Tokens: From Color to Rhythm'
description: 'Name your visual decisions so a blog theme stays coherent as it grows.'
pubDate: '2026-07-06'
heroImage: '../../../assets/blog-placeholder-2.jpg'
tags: ['Design System', 'CSS', 'Frontend']
featured: false
lang: 'en'
translationKey: 'design-tokens'
---

Design tokens are not “a few more CSS variables.” They name decisions: paper, ink, accent, measure.

## Layered naming

1. **Raw**: `#0b7a6f`
2. **Alias**: `--accent`
3. **Component**: button background → `--accent`

For a blog theme, alias + component is usually enough.

## Rhythm tokens

Spacing and type need rhythm too:

```css
:root {
  --space-sm: 0.65rem;
  --space-md: 1.15rem;
  --space-lg: 2rem;
  --measure: 42rem;
}
```

Chinese body copy often sits near 40–45 characters wide.

## Less is more

Too many tokens erase constraint. Start with paper, ink, accent, divider, and body family — then expand only when a new semantic appears.
