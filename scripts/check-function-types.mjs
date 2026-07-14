import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const TYPES = 'functions/types.d.ts';

const current = fs.readFileSync(TYPES, 'utf8');

// Regenerate into a temp file and compare.
const tmp = `${TYPES}.tmp`;
try {
  execFileSync(
    'npx',
    ['wrangler', 'types', TYPES, '--strict-vars', 'false'],
    { stdio: 'ignore' },
  );
} catch (e) {
  console.error('wrangler types failed:', e.message);
  process.exit(1);
}

const regenerated = fs.readFileSync(TYPES, 'utf8');
fs.rmSync(tmp, { force: true });

const a = crypto.createHash('sha256').update(current).digest('hex');
const b = crypto.createHash('sha256').update(regenerated).digest('hex');
if (a !== b) {
  console.error('functions/types.d.ts is out of date. Run `npm run generate:function-types`.');
  process.exit(1);
}
console.log('functions/types.d.ts is up to date.');
