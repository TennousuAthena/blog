import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

async function copyMinimal(target: string): Promise<void> {
  await fsp.mkdir(target, { recursive: true });
  await fsp.cp(path.join(REPO, 'public'), path.join(target, 'public'), { recursive: true });
  await fsp.cp(path.join(REPO, 'src'), path.join(target, 'src'), {
    recursive: true,
    filter: (src) => {
      // Exclude any pre-existing managed root content from the real tree.
      const rel = path.relative(path.join(REPO, 'src'), src);
      return rel !== path.join('content', 'blog', 'notion');
    },
  });
  await fsp.copyFile(path.join(REPO, 'package.json'), path.join(target, 'package.json'));
  await fsp.copyFile(path.join(REPO, 'astro.config.mjs'), path.join(target, 'astro.config.mjs'));
  await fsp.copyFile(path.join(REPO, 'tsconfig.json'), path.join(target, 'tsconfig.json'));
}

async function writeFixtures(root: string): Promise<void> {
  const notion = path.join(root, 'src', 'content', 'blog', 'notion');
  await fsp.mkdir(path.join(notion, 'assets', 'p1'), { recursive: true });
  await fsp.writeFile(path.join(notion, 'assets', 'p1', 'cover-hash123.png'), PNG);

  const zh = `---
title: 冒烟测试文章
description: Notion 同步冒烟测试
pubDate: 2024-06-01T00:00:00.000Z
heroImage: ./assets/p1/cover-hash123.png
tags:
  - 笔记
featured: true
lang: zh
translationKey: notion-sync-smoke
---

## 二级标题

正文段落，包含 **加粗** 与 \`inline code\`。

- 列表项一
- 列表项二

\`\`\`ts
const x: number = 1;
\`\`\`

$$
E = mc^2
$$
`;
  await fsp.writeFile(path.join(notion, 'notion-sync-smoke.mdx'), zh);

  await fsp.mkdir(path.join(notion, 'en'), { recursive: true });
  const en = `---
title: Notion Sync Smoke
description: Notion sync smoke test
pubDate: 2024-06-01T00:00:00.000Z
heroImage: ../assets/p1/cover-hash123.png
tags:
  - notes
featured: true
lang: en
translationKey: notion-sync-smoke
---

## Heading

Body paragraph with **bold** and \`inline code\`.

- List one
- List two
`;
  await fsp.writeFile(path.join(notion, 'en', 'notion-sync-smoke.mdx'), en);
}

test('notion-build: isolated Astro build renders zh/en articles, home, tags, RSS', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'notion-build-test-'));
  try {
    await copyMinimal(root);
    await writeFixtures(root);
    // Symlink node_modules so the temp root's config can resolve deps.
    await fsp.symlink(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    const astroBin = path.join(root, 'node_modules', '.bin', 'astro');
    // macOS /var vs /private/var: pass a realpath so Astro's root mapping is consistent.
    const realRoot = fs.realpathSync(root);
    try {
      execFileSync(astroBin, ['build', '--root', realRoot], { cwd: realRoot, stdio: 'pipe', timeout: 180_000, env: { ...process.env } });
    } catch (e) {
      const err = e as { stderr?: Buffer };
      console.error('ASTRO BUILD STDERR:\n', err.stderr?.toString() ?? String(e));
      throw e;
    }
    const dist = path.join(realRoot, 'dist');
    // Article routes (translationKey drives the slug).
    const zhHtml = await fsp.readFile(path.join(dist, 'blog', 'notion-sync-smoke', 'index.html'), 'utf8');
    const enHtml = await fsp.readFile(path.join(dist, 'en', 'blog', 'notion-sync-smoke', 'index.html'), 'utf8');
    // Home, tags, RSS exist.
    assert.ok(fs.existsSync(path.join(dist, 'index.html')));
    assert.ok(fs.existsSync(path.join(dist, 'tags', 'index.html')));
    assert.ok(fs.existsSync(path.join(dist, 'rss.xml')));

    // HTML contains title, body, image, tag; no signed Notion URL or Notion-specific markers.
    assert.match(zhHtml, /冒烟测试文章/);
    assert.match(zhHtml, /二级标题/);
    assert.match(zhHtml, /列表项一/);
    assert.match(zhHtml, /笔记/);
    assert.match(enHtml, /Notion Sync Smoke/);
    assert.match(enHtml, /Heading/);
    // No signed Notion S3 URLs leak into output.
    assert.doesNotMatch(zhHtml, /amazonaws\.com.*X-Amz/);
    assert.doesNotMatch(enHtml, /amazonaws\.com.*X-Amz/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
