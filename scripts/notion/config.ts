import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root: scripts/notion -> repo root. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Single managed root for all generated MDX and downloaded media. */
export const MANAGED_ROOT = path.join(REPO_ROOT, 'src', 'content', 'blog', 'notion');

/** Temp dir holding candidate/backup/journal, sibling to the managed root on the same FS. */
export const TEMP_PREFIX = '.notion-sync-';

/** Per-property contract names (exact) required on the Notion data source. */
export const PROPERTY = {
  name: 'Name',
  slug: 'Slug',
  status: 'Status',
  description: 'Description',
  publishDate: 'Publish Date',
  tags: 'Tags',
  language: 'Language',
  featured: 'Featured',
  translationKey: 'Translation Key',
} as const;

/** Required status / select option values. */
export const REQUIRED_STATUS_OPTIONS = ['Published'] as const;
export const REQUIRED_LANGUAGE_OPTIONS = ['zh', 'en'] as const;

/** Notion API version pinned for this integration. */
export const NOTION_VERSION = '2026-03-11';

/** Max download size for any media file (bytes). */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/** Max webhook request body (bytes) accepted by the Pages Function. */
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

/** Slug / translation key normalization: lowercase ASCII kebab-case. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface RequiredEnv {
  NOTION_TOKEN: string;
  NOTION_DATA_SOURCE_ID: string;
}

/**
 * Read and validate the credentials required to run a sync.
 * Returns the missing variable names (without values) so the caller can print
 * a redacted message and exit non-zero without leaking secrets.
 */
export function readRequiredEnv(): { env: RequiredEnv | null; missing: string[] } {
  const token = process.env.NOTION_TOKEN?.trim();
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID?.trim();
  const missing: string[] = [];
  if (!token) missing.push('NOTION_TOKEN');
  if (!dataSourceId) missing.push('NOTION_DATA_SOURCE_ID');
  if (missing.length > 0) return { env: null, missing };
  return {
    env: { NOTION_TOKEN: token as string, NOTION_DATA_SOURCE_ID: dataSourceId as string },
    missing: [],
  };
}

/** A schema validation diff produced when the data source contract is violated. */
export interface SchemaDiff {
  field: string;
  expected: string;
  actual: string;
}

export function isKebabCase(value: string): boolean {
  return SLUG_RE.test(value);
}
