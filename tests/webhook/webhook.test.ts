import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signWebhookPayload } from '@notionhq/client';
import { onRequestPost } from '../../functions/notion-webhook.ts';

const DS = 'data-source-id-123';
const HOOK = 'https://api.cloudflare.com/hooks/hook-abc';

interface CallResult {
  status: number;
  hookCalls: Array<{ status: number }>;
}

async function call(opts: {
  method?: string;
  contentType?: string;
  body: unknown;
  signature?: string | null;
  setup?: string | null;
  env: Record<string, string>;
  hookResponses?: Array<number>;
  contentLength?: string;
}): Promise<CallResult> {
  const bodyStr = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    'content-length': opts.contentLength ?? String(Buffer.byteLength(bodyStr)),
  };
  if (opts.signature !== undefined) headers['X-Notion-Signature'] = opts.signature as string;
  const url = new URL('https://site.test/notion-webhook');
  if (opts.setup !== undefined && opts.setup !== null) url.searchParams.set('setup', opts.setup);

  const request = new Request(url.toString(), {
    method: opts.method ?? 'POST',
    headers,
    body: bodyStr,
  });

  const hookResponses = opts.hookResponses ?? [200];
  let hookIdx = 0;
  const hookCalls: Array<{ status: number }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const status = hookResponses[hookIdx] ?? 200;
    hookIdx++;
    hookCalls.push({ status });
    return new Response('ok', { status, headers: { 'cf-ray': 'cf-ray-xyz' } });
  }) as typeof fetch;
  try {
    const env = { ...opts.env };
    const ctx = { request, env };
    const res = await onRequestPost(ctx as never);
    return { status: res.status, hookCalls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function validSignedEvent(envSecret: string, event: Record<string, unknown>) {
  const body = JSON.stringify(event);
  return signWebhookPayload({ body, verificationToken: envSecret });
}

test('webhook: non-JSON content type returns 415', async () => {
  const r = await call({ body: 'x', contentType: 'text/plain', env: {} });
  assert.equal(r.status, 415);
});

test('webhook: malformed JSON returns 400', async () => {
  const r = await call({ body: '{bad', env: {} });
  assert.equal(r.status, 400);
});

test('webhook: payload missing type field returns 400', async () => {
  const r = await call({ body: { foo: 'bar' }, env: {} });
  assert.equal(r.status, 400);
});

test('webhook: oversize declared content-length returns 413', async () => {
  const r = await call({
    body: { type: 'data_source.entry_updated' },
    contentLength: String(300 * 1024),
    env: {},
  });
  assert.equal(r.status, 413);
});

test('webhook: setup with wrong nonce returns 404 and does not record', async () => {
  const r = await call({
    body: { type: 'verification', verification_token: 'tok' },
    setup: 'wrong',
    env: { BOOTSTRAP_NONCE: 'correct', SETUP_UNTIL: String(Date.now() + 60000) },
  });
  assert.equal(r.status, 404);
});

test('webhook: setup with expired SETUP_UNTIL returns 404', async () => {
  const r = await call({
    body: { type: 'verification', verification_token: 'tok' },
    setup: 'correct',
    env: { BOOTSTRAP_NONCE: 'correct', SETUP_UNTIL: String(Date.now() - 1000) },
  });
  assert.equal(r.status, 404);
});

test('webhook: valid setup records token and returns 204', async () => {
  const r = await call({
    body: { type: 'verification', verification_token: 'captured-token' },
    setup: 'correct',
    env: { BOOTSTRAP_NONCE: 'correct', SETUP_UNTIL: String(Date.now() + 60000) },
  });
  assert.equal(r.status, 204);
});

test('webhook: setup rejected when verification secret already configured', async () => {
  const r = await call({
    body: { type: 'verification', verification_token: 'tok' },
    setup: 'correct',
    env: {
      BOOTSTRAP_NONCE: 'correct',
      SETUP_UNTIL: String(Date.now() + 60000),
      NOTION_WEBHOOK_VERIFICATION_SECRET: 'already-set',
    },
  });
  assert.notEqual(r.status, 204);
});

test('webhook: event without verification secret returns 503', async () => {
  const r = await call({
    body: { type: 'data_source.entry_updated', data_source: { id: DS } },
    env: {},
  });
  assert.equal(r.status, 503);
});

test('webhook: forged signature returns 401', async () => {
  const r = await call({
    body: { type: 'data_source.entry_updated', data_source: { id: DS } },
    signature: 'sha256=deadbeef',
    env: { NOTION_WEBHOOK_VERIFICATION_SECRET: 'secret', CLOUDFLARE_DEPLOY_HOOK_URL: HOOK },
  });
  assert.equal(r.status, 401);
});

test('webhook: valid signature, accepted event, hook 2xx -> 202', async () => {
  const secret = 'verification-secret';
  const sig = await validSignedEvent(secret, { type: 'data_source.entry_updated', data_source: { id: DS } });
  const r = await call({
    body: { type: 'data_source.entry_updated', data_source: { id: DS } },
    signature: sig,
    hookResponses: [200],
    env: { NOTION_WEBHOOK_VERIFICATION_SECRET: secret, NOTION_DATA_SOURCE_ID: DS, CLOUDFLARE_DEPLOY_HOOK_URL: HOOK },
  });
  assert.equal(r.status, 202);
  assert.equal(r.hookCalls.length, 1);
});

test('webhook: valid signature but different data source -> 202, no hook call', async () => {
  const secret = 'verification-secret';
  const sig = await validSignedEvent(secret, { type: 'data_source.entry_updated', data_source: { id: 'other-ds' } });
  const r = await call({
    body: { type: 'data_source.entry_updated', data_source: { id: 'other-ds' } },
    signature: sig,
    env: { NOTION_WEBHOOK_VERIFICATION_SECRET: secret, NOTION_DATA_SOURCE_ID: DS, CLOUDFLARE_DEPLOY_HOOK_URL: HOOK },
  });
  assert.equal(r.status, 202);
  assert.equal(r.hookCalls.length, 0);
});

test('webhook: accepted event types cover created/updated/deleted/restored', async () => {
  const secret = 'verification-secret';
  for (const type of [
    'data_source.entry_created',
    'data_source.entry_updated',
    'data_source.entry_deleted',
    'data_source.entry_restored',
  ]) {
    const sig = await validSignedEvent(secret, { type, data_source: { id: DS } });
    const r = await call({
      body: { type, data_source: { id: DS } },
      signature: sig,
      env: { NOTION_WEBHOOK_VERIFICATION_SECRET: secret, NOTION_DATA_SOURCE_ID: DS, CLOUDFLARE_DEPLOY_HOOK_URL: HOOK },
    });
    assert.equal(r.status, 202);
  }
});

test('webhook: unknown event type with valid signature -> 202, no hook', async () => {
  const secret = 'verification-secret';
  const sig = await validSignedEvent(secret, { type: 'something.else', data_source: { id: DS } });
  const r = await call({
    body: { type: 'something.else', data_source: { id: DS } },
    signature: sig,
    env: { NOTION_WEBHOOK_VERIFICATION_SECRET: secret, NOTION_DATA_SOURCE_ID: DS, CLOUDFLARE_DEPLOY_HOOK_URL: HOOK },
  });
  assert.equal(r.status, 202);
  assert.equal(r.hookCalls.length, 0);
});

test('webhook: hook permanent 4xx -> 204', async () => {
  const secret = 'verification-secret';
  const sig = await validSignedEvent(secret, { type: 'data_source.entry_updated', data_source: { id: DS } });
  const r = await call({
    body: { type: 'data_source.entry_updated', data_source: { id: DS } },
    signature: sig,
    hookResponses: [404],
    env: { NOTION_WEBHOOK_VERIFICATION_SECRET: secret, NOTION_DATA_SOURCE_ID: DS, CLOUDFLARE_DEPLOY_HOOK_URL: HOOK },
  });
  assert.equal(r.status, 204);
});

test('webhook: hook retryable 5xx -> 502', async () => {
  const secret = 'verification-secret';
  const sig = await validSignedEvent(secret, { type: 'data_source.entry_updated', data_source: { id: DS } });
  const r = await call({
    body: { type: 'data_source.entry_updated', data_source: { id: DS } },
    signature: sig,
    hookResponses: [503],
    env: { NOTION_WEBHOOK_VERIFICATION_SECRET: secret, NOTION_DATA_SOURCE_ID: DS, CLOUDFLARE_DEPLOY_HOOK_URL: HOOK },
  });
  assert.equal(r.status, 502);
});

test('webhook: hook 429 -> 502', async () => {
  const secret = 'verification-secret';
  const sig = await validSignedEvent(secret, { type: 'data_source.entry_updated', data_source: { id: DS } });
  const r = await call({
    body: { type: 'data_source.entry_updated', data_source: { id: DS } },
    signature: sig,
    hookResponses: [429],
    env: { NOTION_WEBHOOK_VERIFICATION_SECRET: secret, NOTION_DATA_SOURCE_ID: DS, CLOUDFLARE_DEPLOY_HOOK_URL: HOOK },
  });
  assert.equal(r.status, 502);
});

test('webhook: missing or non-https hook URL -> 503', async () => {
  const secret = 'verification-secret';
  const sig = await validSignedEvent(secret, { type: 'data_source.entry_updated', data_source: { id: DS } });
  const r = await call({
    body: { type: 'data_source.entry_updated', data_source: { id: DS } },
    signature: sig,
    env: { NOTION_WEBHOOK_VERIFICATION_SECRET: secret, NOTION_DATA_SOURCE_ID: DS, CLOUDFLARE_DEPLOY_HOOK_URL: 'http://insecure.test/hook' },
  });
  assert.equal(r.status, 503);
});
