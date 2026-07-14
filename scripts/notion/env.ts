import fs from 'node:fs';
import path from 'node:path';

/**
 * Load a `.env` file from the project root into `process.env`.
 * - Only affects local dev; the platform (Cloudflare) injects real vars.
 * - Never overrides values already set in the environment (real env wins).
 * - Silently no-ops if the file is absent.
 */
export function loadDotEnv(filePath = path.resolve(process.cwd(), '.env')): void {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // strip a single pair of surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
