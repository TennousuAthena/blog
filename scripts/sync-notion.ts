import { Client } from '@notionhq/client';
import { NOTION_VERSION, readRequiredEnv } from './notion/config.ts';
import { makeRetryingFetch, runSync } from './notion/sync.ts';
import { SchemaError } from './notion/sync.ts';
import { loadDotEnv } from './notion/env.ts';

// Local dev: load `.env` from the project root. Platform-injected vars win.
loadDotEnv();

/**
 * Entry point. Validates env, builds a Notion client pinned to the contracted
 * API version with a retrying fetch, and runs a full sync. Exits non-zero on
 * any failure; never prints tokens, signed URLs, or the deploy hook URL.
 */
async function main(): Promise<void> {
  const { env, missing } = readRequiredEnv();
  if (!env) {
    process.stderr.write(`Missing required environment variables: ${missing.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }

  const notion = new Client({
    auth: env.NOTION_TOKEN,
    notionVersion: NOTION_VERSION,
    fetch: makeRetryingFetch(),
  });

  try {
    const result = await runSync(notion, env.NOTION_DATA_SOURCE_ID);
    process.stdout.write(`Synced ${result.count} published page(s) into src/content/blog/notion\n`);
  } catch (err) {
    if (err instanceof SchemaError) {
      process.stderr.write(`Schema validation failed:\n${err.diffs.map((d) => `  ${d.field}: expected ${d.expected}, got ${d.actual}`).join('\n')}\n`);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Sync failed: ${msg}\n`);
    }
    process.exitCode = 1;
  }
}

main();
