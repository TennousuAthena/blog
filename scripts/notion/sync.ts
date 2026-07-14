import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Client, collectAllDataSourceRows, collectPaginatedAPI, isFullBlock, isFullPage } from '@notionhq/client';
import type { BlockObjectResponse, DataSourceObjectResponse, PageObjectResponse } from '@notionhq/client';
import yaml from 'yaml';
import {
  NOTION_VERSION,
  PROPERTY,
  REQUIRED_LANGUAGE_OPTIONS,
  REQUIRED_STATUS_OPTIONS,
  REPO_ROOT,
  TEMP_PREFIX,
  MAX_MEDIA_BYTES,
  isKebabCase,
  type SchemaDiff,
} from './config.ts';
import { convertPageBody, type BlockNode, type ConvertContext } from './convert.ts';

export { isFullBlock, isFullPage };

/** Minimal local view of a data source property config (SDK does not export the type). */
type OptionLike = { name: string };
type PropertyConfig =
  | { type: 'title' }
  | { type: 'rich_text' }
  | { type: 'date' }
  | { type: 'checkbox' }
  | { type: 'status'; status: { options: OptionLike[] } }
  | { type: 'select'; select: { options: OptionLike[] } }
  | { type: 'multi_select'; multi_select: { options: OptionLike[] } };

const PUBLISHED_FILTER = { property: PROPERTY.status, status: { equals: 'Published' } } as const;

const QUERY_RE = /\/v1\/data_sources\/[^/]+\/query$/;

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export function makeRetryingFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async function retryingFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const res = await baseFetch(input, init);
    const url = input instanceof Request ? input.url : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const isRetryable = (res.status === 500 || res.status === 503) && method === 'POST' && QUERY_RE.test(url);
    if (!isRetryable) return res;
    let attemptRes = res;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const base = attempt === 1 ? 1000 : 2000;
      const jitter = Math.floor(Math.random() * 300);
      await sleep(base + jitter);
      attemptRes = await baseFetch(input, init);
      if (attemptRes.status !== 500 && attemptRes.status !== 503) break;
    }
    return attemptRes;
  };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

export class SchemaError extends Error {
  diffs: SchemaDiff[];
  constructor(diffs: SchemaDiff[]) {
    super(
      `Notion data source schema mismatch:\n${diffs
        .map((d) => `  ${d.field}: expected ${d.expected}, got ${d.actual}`)
        .join('\n')}`,
    );
    this.diffs = diffs;
  }
}

function optionNames(prop: PropertyConfig): string[] {
  if (prop.type === 'status') return prop.status.options.map((o) => o.name);
  if (prop.type === 'select') return prop.select.options.map((o) => o.name);
  if (prop.type === 'multi_select') return prop.multi_select.options.map((o) => o.name);
  return [];
}

function expectProperty(
  props: Record<string, PropertyConfig>,
  name: string,
  type: string,
  opts: { options?: readonly string[] },
  diffs: SchemaDiff[],
): void {
  const prop = props[name];
  if (!prop) {
    diffs.push({ field: name, expected: `property "${name}" (${type})`, actual: 'missing' });
    return;
  }
  if (prop.type !== type) {
    diffs.push({ field: name, expected: `type "${type}"`, actual: `type "${prop.type}"` });
    return;
  }
  if (opts.options) {
    const actual = optionNames(prop);
    const missing = opts.options.filter((o) => !actual.includes(o));
    if (missing.length > 0) {
      diffs.push({
        field: name,
        expected: `options [${opts.options.join(', ')}]`,
        actual: `options [${actual.join(', ')}]`,
      });
    }
  }
}

/** Retrieve the data source and assert the exact property contract. */
export async function validateSchema(notion: Client, dataSourceId: string): Promise<DataSourceObjectResponse> {
  const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  if (!(ds.object === 'data_source' && 'title' in ds)) {
    throw new SchemaError([
      { field: '(data source)', expected: 'full data source with properties', actual: `object "${ds.object}"` },
    ]);
  }
  const props = ds.properties as Record<string, PropertyConfig>;
  const diffs: SchemaDiff[] = [];
  expectProperty(props, PROPERTY.name, 'title', {}, diffs);
  expectProperty(props, PROPERTY.slug, 'rich_text', {}, diffs);
  expectProperty(props, PROPERTY.status, 'status', { options: REQUIRED_STATUS_OPTIONS }, diffs);
  expectProperty(props, PROPERTY.description, 'rich_text', {}, diffs);
  expectProperty(props, PROPERTY.publishDate, 'date', {}, diffs);
  expectProperty(props, PROPERTY.tags, 'multi_select', {}, diffs);
  expectProperty(props, PROPERTY.language, 'select', { options: REQUIRED_LANGUAGE_OPTIONS }, diffs);
  expectProperty(props, PROPERTY.featured, 'checkbox', {}, diffs);
  expectProperty(props, PROPERTY.translationKey, 'rich_text', {}, diffs);
  if (diffs.length > 0) throw new SchemaError(diffs);
  return ds;
}

// ---------------------------------------------------------------------------
// Property value extraction (narrowed, no casts)
// ---------------------------------------------------------------------------

interface RichTextHolder {
  rich_text: Array<{ text?: { content: string }; plain_text?: string }>;
  title: Array<{ text?: { content: string }; plain_text?: string }>;
}

function richTextOf(prop: unknown): RichTextHolder['rich_text'] {
  if (prop && typeof prop === 'object' && 'type' in prop) {
    const t = (prop as { type: unknown }).type;
    if (t === 'rich_text' || t === 'title') {
      const holder = prop as unknown as RichTextHolder;
      return holder.rich_text ?? holder.title ?? [];
    }
  }
  return [];
}
function richTextToString(prop: unknown): string {
  return richTextOf(prop)
    .map((r) => r.plain_text ?? r.text?.content ?? '')
    .join('');
}

// ---------------------------------------------------------------------------

async function fetchBlockTree(notion: Client, blockId: string): Promise<BlockNode[]> {
  const list = (args: { block_id: string; page_size: number }) => notion.blocks.children.list(args);
  const children = (await collectPaginatedAPI(list as never, { block_id: blockId, page_size: 100 } as never)) as BlockObjectResponse[];
  const nodes: BlockNode[] = [];
  for (const child of children) {
    if (!isFullBlock(child)) continue;
    const node: BlockNode = { block: child, children: [] };
    if (child.has_children) {
      node.children = await fetchBlockTree(notion, child.id);
    }
    nodes.push(node);
  }
  return nodes;
}

function collectImageBlocks(nodes: BlockNode[], acc: BlockNode[] = []): BlockNode[] {
  for (const n of nodes) {
    if (n.block.type === 'image') acc.push(n);
    if (n.children.length > 0) collectImageBlocks(n.children, acc);
  }
  return acc;
}

function imageUrlOf(block: BlockObjectResponse): string | null {
  if (block.type !== 'image') return null;
  const img = block.image;
  return img.type === 'external' ? img.external.url : img.file.url;
}

function coverUrlOf(page: PageObjectResponse): string | null {
  const cover = page.cover;
  if (!cover) return null;
  return cover.type === 'external' ? cover.external.url : cover.file.url;
}

// ---------------------------------------------------------------------------
// Media download + byte validation
// ---------------------------------------------------------------------------

export class MediaError extends Error {}

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF87 = Buffer.from('GIF87a');
const GIF89 = Buffer.from('GIF89a');
const RIFF = Buffer.from('RIFF');
const WEBP = Buffer.from('WEBP');
const FTYP = Buffer.from('ftyp');

function startsWith(buf: Buffer, prefix: Buffer): boolean {
  if (buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (buf[i] !== prefix[i]) return false;
  return true;
}

function detectImageType(buf: Buffer): string | null {
  if (startsWith(buf, JPEG)) return 'image/jpeg';
  if (startsWith(buf, PNG)) return 'image/png';
  if (startsWith(buf, GIF87) || startsWith(buf, GIF89)) return 'image/gif';
  if (buf.length >= 12 && startsWith(buf.subarray(0, 4), RIFF) && startsWith(buf.subarray(8, 12), WEBP))
    return 'image/webp';
  if (buf.length >= 16 && startsWith(buf.subarray(4, 8), FTYP)) {
    const b1 = buf.subarray(8, 12).toString('latin1');
    const b2 = buf.subarray(12, 16).toString('latin1');
    if (b1.includes('avif') || b1.includes('avis') || b2.includes('avif') || b2.includes('avis'))
      return 'image/avif';
  }
  return null;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function normalizeMime(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  return base === 'image/jpg' ? 'image/jpeg' : base;
}

export async function downloadMedia(
  url: string,
  destDir: string,
  key: string,
): Promise<{ rel: string; abs: string }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new MediaError(`fetch failed: ${(e as Error).message}`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new MediaError(`unexpected status ${res.status}`);
  }
  const finalUrl = res.url || url;
  try {
    const u = new URL(finalUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new MediaError('final URL not http(s)');
  } catch {
    throw new MediaError('final URL not http(s)');
  }
  const declared = res.headers.get('content-length');
  if (declared && Number(declared) > MAX_MEDIA_BYTES) throw new MediaError('declared size exceeds limit');

  const reader = res.body?.getReader();
  if (!reader) throw new MediaError('no response body');
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MEDIA_BYTES) {
      await reader.cancel().catch(() => {});
      throw new MediaError('actual size exceeds limit');
    }
    chunks.push(Buffer.from(value));
  }
  const buf = Buffer.concat(chunks);

  const detected = detectImageType(buf);
  if (!detected) throw new MediaError('unrecognized image magic bytes');
  const headerMime = res.headers.get('content-type');
  if (headerMime) {
    const norm = normalizeMime(headerMime);
    if (norm !== detected) throw new MediaError(`header mime ${norm} != detected ${detected}`);
  }
  const ext = EXT_BY_MIME[detected];
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
  const fileName = `${key}-${hash}.${ext}`;
  await fsp.mkdir(destDir, { recursive: true });
  const abs = path.join(destDir, fileName);
  await fsp.writeFile(abs, buf);
  return { rel: `assets/${path.basename(destDir)}/${fileName}`, abs };
}

// ---------------------------------------------------------------------------
// Frontmatter + metadata
// ---------------------------------------------------------------------------

export interface PostMeta {
  pageId: string;
  lang: 'zh' | 'en';
  slug: string;
  translationKey: string;
  title: string;
  description: string;
  pubDate: Date;
  updatedDate: Date;
  tags: string[];
  featured: boolean;
  heroImage: string | null;
  mdxRel: string;
  assets: string[];
}

function buildFrontmatter(meta: PostMeta): string {
  const fm: Record<string, unknown> = {
    title: meta.title,
    description: meta.description,
    pubDate: meta.pubDate,
    updatedDate: meta.updatedDate,
    tags: meta.tags,
    featured: meta.featured,
    lang: meta.lang,
    translationKey: meta.translationKey,
  };
  if (meta.heroImage) fm.heroImage = meta.heroImage;
  return ['---', yaml.stringify(fm).trimEnd(), '---', ''].join('\n');
}

export class MetaError extends Error {}

function extractMeta(page: PageObjectResponse, warn: (m: string) => void): PostMeta {
  const props = page.properties;
  const title = richTextToString(props[PROPERTY.name]);
  const slug = richTextToString(props[PROPERTY.slug]);
  const description = richTextToString(props[PROPERTY.description]);
  const langProp = props[PROPERTY.language];
  const lang = langProp && langProp.type === 'select' && langProp.select?.name ? langProp.select.name : '';
  const dateProp = props[PROPERTY.publishDate];
  const pubStart = dateProp && dateProp.type === 'date' ? dateProp.date?.start : undefined;
  const tagsProp = props[PROPERTY.tags];
  const tags = tagsProp && tagsProp.type === 'multi_select' ? tagsProp.multi_select.map((t) => t.name) : [];
  const featuredProp = props[PROPERTY.featured];
  const featured = featuredProp && featuredProp.type === 'checkbox' ? featuredProp.checkbox === true : false;
  const keyProp = props[PROPERTY.translationKey];
  const keyRaw = richTextToString(keyProp);

  if (!title) throw new MetaError(`page ${page.id}: Name is required`);
  if (!slug) throw new MetaError(`page ${page.id}: Slug is required`);
  if (!description) throw new MetaError(`page ${page.id}: Description is required`);
  if (lang !== 'zh' && lang !== 'en') throw new MetaError(`page ${page.id}: Language must be zh or en`);
  if (!pubStart) throw new MetaError(`page ${page.id}: Publish Date is required`);
  if (!isKebabCase(slug)) {
    throw new MetaError(`page ${page.id}: Slug "${slug}" is not lowercase ASCII kebab-case`);
  }
  const translationKey = keyRaw ? keyRaw : slug;
  if (!isKebabCase(translationKey)) {
    throw new MetaError(`page ${page.id}: Translation Key "${translationKey}" is not lowercase ASCII kebab-case`);
  }
  if (keyRaw) warn(`page ${page.id}: uses explicit Translation Key "${translationKey}"`);

  return {
    pageId: page.id,
    lang: lang as 'zh' | 'en',
    slug,
    translationKey,
    title,
    description,
    pubDate: new Date(pubStart as string),
    updatedDate: new Date(page.last_edited_time),
    tags,
    featured,
    heroImage: null,
    mdxRel: '',
    assets: [],
  };
}

// ---------------------------------------------------------------------------
// Atomic managed-root maintenance
// ---------------------------------------------------------------------------

interface Journal {
  version: 1;
  startedAt: string;
  pid: number;
  candidate: string;
  backup: string;
}

function tempDirFor(root: string): string {
  return path.join(root, `${TEMP_PREFIX}${process.pid}`);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function removeAll(p: string): Promise<void> {
  await fsp.rm(p, { recursive: true, force: true });
}

async function findLegacyRoots(root: string): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(root);
  } catch {
    return [];
  }
  const roots: string[] = [];
  for (const name of entries) {
    if (!name.startsWith(TEMP_PREFIX)) continue;
    const full = path.join(root, name);
    try {
      const st = await fsp.stat(full);
      if (!st.isDirectory()) continue;
      await fsp.access(path.join(full, 'journal.json'));
      roots.push(full);
    } catch {
      // no journal => not ours; leave it
    }
  }
  return roots;
}

/**
 * Recover from a crashed previous sync before starting a new one.
 * - target missing + exactly one valid backup => restore it
 * - target present => drop leftover candidate/backup
 * - multiple recoverable backups / corrupt journal => fail (never guess)
 */
export async function recoverIfNeeded(root: string = REPO_ROOT): Promise<void> {
  const target = path.join(root, 'src', 'content', 'blog', 'notion');
  const legacy = await findLegacyRoots(root);
  const targetExists = await exists(target);
  if (targetExists) {
    for (const dir of legacy) await removeAll(dir).catch(() => {});
    return;
  }
  if (legacy.length === 0) return;
  if (legacy.length > 1) {
    throw new Error(`multiple recoverable sync temp dirs found; aborting: ${legacy.join(', ')}`);
  }
  const dir = legacy[0];
  let journal: Journal;
  try {
    journal = JSON.parse(await fsp.readFile(path.join(dir, 'journal.json'), 'utf8')) as Journal;
  } catch {
    throw new Error(`corrupt journal in ${dir}; aborting`);
  }
  const backup = path.join(dir, journal.backup);
  if (!(await exists(backup))) throw new Error(`no valid backup in ${dir}; aborting`);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.rename(backup, target);
  await removeAll(dir).catch(() => {});
}

export interface SyncResult {
  count: number;
  manifestPath: string;
}

async function swapInto(target: string, candidate: string, backup: string, tempRoot: string): Promise<void> {
  // Ensure the parent of the managed root exists (e.g. a fresh temp project root).
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const targetExisted = await exists(target);
  if (targetExisted) await fsp.rename(target, backup);
  try {
    await fsp.rename(candidate, target);
  } catch (e) {
    if (targetExisted) {
      await removeAll(target).catch(() => {});
      await fsp.rename(backup, target).catch(() => {});
    } else {
      await removeAll(target).catch(() => {});
    }
    throw e;
  }
  await removeAll(tempRoot).catch(() => {});
}

/**
 * Invalidate Astro's content cache after the managed root is replaced.
 * Astro persists content/image references in `node_modules/.astro/data-store.json`
 * and `.astro/content-assets.mjs`; these go stale when sync removes or renames
 * MDX/image files, and would cause `ImageNotFound` on the next build.
 */
async function invalidateAstroCache(root: string): Promise<void> {
  const targets = [
    path.join(root, 'node_modules', '.astro', 'data-store.json'),
    path.join(root, '.astro'),
  ];
  for (const p of targets) {
    await removeAll(p).catch(() => {});
  }
}

/**
 * Run a full sync: validate schema, query Published rows, fetch blocks, download
 * media, build the candidate tree in a temp dir, then atomically swap it into
 * MANAGED_ROOT. Any failure leaves the existing managed root untouched.
 */
export async function runSync(notion: Client, dataSourceId: string, root: string = REPO_ROOT): Promise<SyncResult> {
  const target = path.join(root, 'src', 'content', 'blog', 'notion');
  const tempRoot = tempDirFor(root);
  const candidate = path.join(tempRoot, 'candidate');
  const backup = path.join(tempRoot, 'backup');

  await recoverIfNeeded(root);
  await removeAll(tempRoot).catch(() => {});
  await fsp.mkdir(candidate, { recursive: true });
  await fsp.writeFile(
    path.join(tempRoot, 'journal.json'),
    JSON.stringify({
      version: 1,
      startedAt: new Date().toISOString(),
      pid: process.pid,
      candidate: 'candidate',
      backup: 'backup',
    } satisfies Journal),
  );

  const warnings = new Set<string>();
  const warn = (m: string) => {
    if (!warnings.has(m)) {
      warnings.add(m);
      process.stderr.write(`[warn] ${m}\n`);
    }
  };

  await validateSchema(notion, dataSourceId);

  const rows = await collectAllDataSourceRows(notion, {
    data_source_id: dataSourceId,
    filter: PUBLISHED_FILTER,
    page_size: 100,
  });

  const pages = rows.filter(isFullPage);
  if (rows.length !== pages.length) warn(`skipped ${rows.length - pages.length} non-page / partial rows`);

  pages.sort((a, b) => {
    const da = a.properties[PROPERTY.publishDate];
    const db = b.properties[PROPERTY.publishDate];
    const ta = da && da.type === 'date' && da.date?.start ? new Date(da.date.start).getTime() : 0;
    const tb = db && db.type === 'date' && db.date?.start ? new Date(db.date.start).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

  const metas: PostMeta[] = [];
  const slugByLang = new Map<string, string>();
  const keyByLang = new Map<string, string>();

  for (const page of pages) {
    let meta: PostMeta;
    try {
      meta = extractMeta(page, warn);
    } catch (e) {
      if (e instanceof MetaError) {
        warn(`skipped page ${page.id}: ${(e as Error).message}`);
        continue;
      }
      throw e;
    }
    const slugKey = `${meta.lang}:${meta.slug}`;
    if (slugByLang.has(slugKey)) {
      warn(`skipped page ${page.id}: duplicate slug "${meta.slug}" for language "${meta.lang}" (conflicts with ${slugByLang.get(slugKey)})`);
      continue;
    }
    slugByLang.set(slugKey, meta.pageId);
    const keyKey = `${meta.lang}:${meta.translationKey}`;
    if (keyByLang.has(keyKey)) {
      warn(`skipped page ${page.id}: duplicate translation key "${meta.translationKey}" for language "${meta.lang}" (conflicts with ${keyByLang.get(keyKey)})`);
      continue;
    }
    keyByLang.set(keyKey, meta.pageId);
    meta.mdxRel = meta.lang === 'zh' ? `${meta.slug}.mdx` : `en/${meta.slug}.mdx`;
    metas.push(meta);
  }

  for (const page of pages) {
    const meta = metas.find((m) => m.pageId === page.id);
    if (!meta) continue;
    const ctx: ConvertContext = { media: new Map(), warn };
    const tree = await fetchBlockTree(notion, meta.pageId);

    const coverUrl = coverUrlOf(page);
    if (coverUrl) {
      const { rel } = await downloadMedia(coverUrl, path.join(candidate, 'assets', meta.pageId), 'cover');
      meta.heroImage = meta.lang === 'zh' ? `./${rel}` : `../${rel}`;
      meta.assets.push(rel);
    }

    for (const img of collectImageBlocks(tree)) {
      const url = imageUrlOf(img.block);
      if (!url) continue;
      try {
        const { rel } = await downloadMedia(url, path.join(candidate, 'assets', meta.pageId), img.block.id);
        ctx.media.set(img.block.id, meta.lang === 'zh' ? `./${rel}` : `../${rel}`);
        meta.assets.push(rel);
      } catch (e) {
        warn(`media ${img.block.id}: ${(e as Error).message}`);
      }
    }

    const body = convertPageBody(tree, ctx);
    const mdx = buildFrontmatter(meta) + body + '\n';
    const mdxPath = path.join(candidate, meta.mdxRel);
    await fsp.mkdir(path.dirname(mdxPath), { recursive: true });
    await fsp.writeFile(mdxPath, mdx);
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    pages: metas.map((m) => ({
      pageId: m.pageId,
      lang: m.lang,
      slug: m.slug,
      translationKey: m.translationKey,
      mdx: m.mdxRel,
      assets: m.assets,
    })),
  };
  await fsp.writeFile(path.join(candidate, 'manifest.json'), JSON.stringify(manifest, null, 2));

  await swapInto(target, candidate, backup, tempRoot);
  // Invalidate Astro's content cache: the managed root was just replaced, so
  // any cached MDX/image references (data-store.json, .astro/) are stale and
  // would break the next `astro build` with ImageNotFound.
  await invalidateAstroCache(root);
  return { count: metas.length, manifestPath: path.join(target, 'manifest.json') };
}

// Referenced for type-completeness by callers building their own Notion client.
export const NOTION_API_VERSION = NOTION_VERSION;
