---
title: 'The Boundary of a Component'
description: 'Buttons, links, cards: when something deserves a component — and when style is enough.'
pubDate: '2026-06-18'
heroImage: '../../../assets/blog-placeholder-4.jpg'
tags: ['Components', 'Design', 'Frontend']
featured: false
lang: 'en'
translationKey: 'component-boundaries'
---

A practical test: **does it carry reusable interaction or semantics?**

## Links are not buttons

Both can look clickable. Links navigate; buttons submit or trigger actions. “Read posts” can be a styled link; form submit should be a real `<button>`.

## Restraint with cards

If removing border, shadow, and radius still leaves content clear, it may not need to be a card. Archive lists often read cleaner with rules and hover accents.

## Keep the public API short

Prefer slots, a few variants (`featured`), and a11y props. Everything else belongs to CSS and tokens.
