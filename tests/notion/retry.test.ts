import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRetryingFetch } from '../../scripts/notion/sync.ts';

function fakeFetchFor(sequence: number[]) {
  let i = 0;
  const seen: Array<{ method: string; url: string }> = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    seen.push({ method, url });
    const status = sequence[i] ?? 200;
    i++;
    return new Response('{}', { status });
  }) as unknown as typeof fetch;
  return { fn, seen: () => seen };
}

test('makeRetryingFetch: retries 500/503 on data source query POST, then succeeds', async () => {
  const { fn, seen } = fakeFetchFor([500, 503, 200]);
  const retrying = makeRetryingFetch(fn);
  const res = await retrying('https://api.notion.com/v1/data_sources/ds123/query', { method: 'POST', body: '{}' });
  assert.equal(res.status, 200);
  assert.equal(seen().length, 3);
  assert.equal(seen()[0].method, 'POST');
  assert.match(seen()[0].url, /data_sources\/ds123\/query$/);
});

test('makeRetryingFetch: does not retry non-query or non-5xx', async () => {
  // 404 on a GET should not be retried.
  const { fn, seen } = fakeFetchFor([404]);
  const retrying = makeRetryingFetch(fn);
  const res = await retrying('https://api.notion.com/v1/pages/p1', { method: 'GET' });
  assert.equal(res.status, 404);
  assert.equal(seen().length, 1);
});

test('makeRetryingFetch: stops after 2 extra retries (3 total) on persistent 500', async () => {
  const { fn, seen } = fakeFetchFor([500, 500, 500, 500]);
  const retrying = makeRetryingFetch(fn);
  const res = await retrying('https://api.notion.com/v1/data_sources/ds123/query', { method: 'POST', body: '{}' });
  assert.equal(res.status, 500);
  assert.equal(seen().length, 3);
});

test('makeRetryingFetch: does not retry 429 (left to SDK)', async () => {
  const { fn, seen } = fakeFetchFor([429]);
  const retrying = makeRetryingFetch(fn);
  const res = await retrying('https://api.notion.com/v1/data_sources/ds123/query', { method: 'POST', body: '{}' });
  assert.equal(res.status, 429);
  assert.equal(seen().length, 1);
});

test('makeRetryingFetch: 200 on first try is returned once', async () => {
  const { fn, seen } = fakeFetchFor([200]);
  const retrying = makeRetryingFetch(fn);
  const res = await retrying('https://api.notion.com/v1/data_sources/ds123/query', { method: 'POST', body: '{}' });
  assert.equal(res.status, 200);
  assert.equal(seen().length, 1);
});
