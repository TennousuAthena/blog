---
title: 'Diagrams with Mermaid'
description: 'Mermaid is wired in — flowcharts and sequence diagrams follow the site light/dark tokens.'
pubDate: '2026-07-13'
heroImage: '../../../assets/blog-placeholder-4.jpg'
tags: ['Astro', 'Mermaid', 'Frontend']
featured: false
lang: 'en'
translationKey: 'mermaid-diagrams'
---

Diagrams as code stay easier to maintain than screenshots. Ink Atelier renders `mermaid` fences via `astro-mermaid`, themed with the jade/mist palette.

## Flowchart

```mermaid
flowchart LR
  A[Markdown] --> B[Astro Build]
  B --> C{Has Mermaid?}
  C -->|Yes| D[Client SVG render]
  C -->|No| E[Static HTML]
  D --> F[Theme bridge]
  F --> G[Ink Atelier page]
  E --> G
```

## Sequence

```mermaid
sequenceDiagram
  participant U as Reader
  participant P as Page
  participant M as Mermaid
  U->>P: Open post / toggle theme
  P->>M: Apply themeVariables
  M-->>P: Return SVG
  P-->>U: Update diagram
```

## Usage

Use a `mermaid` fenced code block in Markdown or MDX. Toggling light/dark re-renders diagrams with the site tokens.
