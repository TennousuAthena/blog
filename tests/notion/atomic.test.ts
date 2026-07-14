import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runSync, recoverIfNeeded } from '../../scripts/notion/sync.ts';
import { makeFakeClient, makePage, paragraphBlock, headingBlock, codeBlock, equationBlock, listBlock, imageBlock } from './_fake-client.ts';

async function tmpRoot(): Promise<string> {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'notion-sync-test-'));
}

test('runSync: builds MDX + manifest and swaps into managed root (empty prior)', async () => {
  const root = await tmpRoot();
  const client = makeFakeClient({
    pages: [makePage({ id: 'p1', name: 'Hello', slug: 'hello', description: 'd', lang: 'zh', pubStart: '2024-05-01T00:00:00.000Z', tags: ['a', 'b'], featured: true })],
  });
  const res = await runSync(client, 'ds', root);
  assert.equal(res.count, 1);
  const mdx = path.join(root, 'src/content/blog/notion/hello.mdx');
  const body = await fsp.readFile(mdx, 'utf8');
  assert.match(body, /title: Hello/);
  assert.match(body, /lang: zh/);
  assert.match(body, /translationKey: hello/);
  assert.match(body, /tags:\n  - a\n  - b/);
  assert.match(body, /featured: true/);
  const manifest = JSON.parse(await fsp.readFile(path.join(root, 'src/content/blog/notion/manifest.json'), 'utf8'));
  assert.equal(manifest.pages.length, 1);
  assert.equal(manifest.pages[0].slug, 'hello');
  // temp root cleaned up
  await assert.rejects(() => fsp.access(path.join(root, '.notion-sync-process')));
  await fsp.rm(root, { recursive: true, force: true });
});

test('runSync: full block tree is rendered to MDX (headings, lists, code, equation)', async () => {
  const root = await tmpRoot();
  const client = makeFakeClient({
    pages: [makePage({ id: 'p1', name: 'Doc', slug: 'doc', description: 'd', lang: 'en', pubStart: '2024-05-02T00:00:00.000Z' })],
    blockMap: {
      p1: [
        headingBlock('b1', 'Section'),
        paragraphBlock('b2', 'Some <b>text</b> & more'),
        listBlock('b3', 'item one'),
        listBlock('b4', 'item two'),
        codeBlock('b5', 'const x = 1;'),
        equationBlock('b6', 'E = mc^2'),
      ],
    },
  });
  await runSync(client, 'ds', root);
  const body = await fsp.readFile(path.join(root, 'src/content/blog/notion/en/doc.mdx'), 'utf8');
  assert.match(body, /## Section/);
  assert.match(body, /Some &lt;b&gt;text&lt;\/b&gt; &amp; more/);
  assert.match(body, /- item one\n- item two/);
  assert.match(body, /```ts\nconst x = 1;\n```/);
  assert.match(body, /\$\$[\s\S]*E = mc\^2[\s\S]*\$\$/);
  await fsp.rm(root, { recursive: true, force: true });
});

test('runSync: zero published pages still swaps an empty managed root', async () => {
  const root = await tmpRoot();
  const client = makeFakeClient({ pages: [] });
  const res = await runSync(client, 'ds', root);
  assert.equal(res.count, 0);
  const exists = fs.existsSync(path.join(root, 'src/content/blog/notion'));
  assert.equal(exists, true);
  await fsp.rm(root, { recursive: true, force: true });
});

test('runSync: duplicate slug in same language skips the duplicate, syncs the rest', async () => {
  const root = await tmpRoot();
  const client = makeFakeClient({
    pages: [
      makePage({ id: 'p1', name: 'A', slug: 'dup', description: 'd', lang: 'zh', pubStart: '2024-01-01T00:00:00.000Z' }),
      makePage({ id: 'p2', name: 'B', slug: 'dup', description: 'd', lang: 'zh', pubStart: '2024-02-01T00:00:00.000Z' }),
    ],
  });
  const res = await runSync(client, 'ds', root);
  assert.equal(res.count, 1);
  await fsp.rm(root, { recursive: true, force: true });
});

test('runSync: explicit duplicate translation key in same language skips the duplicate', async () => {
  const root = await tmpRoot();
  const client = makeFakeClient({
    pages: [
      makePage({ id: 'p1', name: 'A', slug: 'a', description: 'd', lang: 'zh', pubStart: '2024-01-01T00:00:00.000Z', translationKey: 'shared' }),
      makePage({ id: 'p2', name: 'B', slug: 'b', description: 'd', lang: 'zh', pubStart: '2024-02-01T00:00:00.000Z', translationKey: 'shared' }),
    ],
  });
  const res = await runSync(client, 'ds', root);
  assert.equal(res.count, 1);
  await fsp.rm(root, { recursive: true, force: true });
});

test('runSync: non-kebab slug skips the page, sync succeeds', async () => {
  const root = await tmpRoot();
  const client = makeFakeClient({
    pages: [makePage({ id: 'p1', name: 'A', slug: 'Not Kebab', description: 'd', lang: 'zh', pubStart: '2024-01-01T00:00:00.000Z' })],
  });
  const res = await runSync(client, 'ds', root);
  assert.equal(res.count, 0);
  await fsp.rm(root, { recursive: true, force: true });
});

test('runSync: image downloaded and referenced from MDX', async () => {
  const root = await tmpRoot();
  // Point the image block at a tiny PNG served by a local mock via global fetch override.
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x09]);
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(png)); c.close(); } }), { status: 200, headers: { 'content-length': String(png.length), 'content-type': 'image/png' } })) as unknown as typeof fetch;
  const client = makeFakeClient({
    pages: [makePage({ id: 'p1', name: 'A', slug: 'img', description: 'd', lang: 'zh', pubStart: '2024-01-01T00:00:00.000Z' })],
    blockMap: { p1: [imageBlock('b1', 'https://x.test/i.png')] },
  });
  try {
    await runSync(client, 'ds', root);
    const body = await fsp.readFile(path.join(root, 'src/content/blog/notion/img.mdx'), 'utf8');
    assert.match(body, /!\[\]\(\.\/assets\/p1\//);
  } finally {
    globalThis.fetch = original;
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('recoverIfNeeded: restores backup when target missing and one backup present', async () => {
  const root = await tmpRoot();
  const target = path.join(root, 'src/content/blog/notion');
  const temp = path.join(root, '.notion-sync-99999');
  await fsp.mkdir(path.join(temp, 'backup'), { recursive: true });
  await fsp.writeFile(path.join(temp, 'journal.json'), JSON.stringify({ version: 1, startedAt: '', pid: 99999, candidate: 'candidate', backup: 'backup' }));
  await fsp.writeFile(path.join(temp, 'backup', 'kept.mdx'), 'kept');
  await recoverIfNeeded(root);
  assert.equal(await fsp.readFile(path.join(target, 'kept.mdx'), 'utf8'), 'kept');
  await assert.rejects(() => fsp.access(temp));
  await fsp.rm(root, { recursive: true, force: true });
});

test('recoverIfNeeded: aborts when multiple recoverable backups exist', async () => {
  const root = await tmpRoot();
  for (const pid of [1, 2]) {
    const temp = path.join(root, `.notion-sync-${pid}`);
    await fsp.mkdir(path.join(temp, 'backup'), { recursive: true });
    await fsp.writeFile(path.join(temp, 'journal.json'), JSON.stringify({ version: 1, startedAt: '', pid, candidate: 'candidate', backup: 'backup' }));
  }
  await assert.rejects(() => recoverIfNeeded(root), /multiple recoverable/);
  await fsp.rm(root, { recursive: true, force: true });
});

test('recoverIfNeeded: drops leftover candidate/backup when target exists', async () => {
  const root = await tmpRoot();
  const target = path.join(root, 'src/content/blog/notion');
  await fsp.mkdir(target, { recursive: true });
  const temp = path.join(root, '.notion-sync-555');
  await fsp.mkdir(temp, { recursive: true });
  await fsp.writeFile(path.join(temp, 'journal.json'), JSON.stringify({ version: 1, startedAt: '', pid: 555, candidate: 'candidate', backup: 'backup' }));
  await recoverIfNeeded(root);
  await assert.rejects(() => fsp.access(temp));
  await fsp.rm(root, { recursive: true, force: true });
});
