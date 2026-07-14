import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema, SchemaError, runSync } from '../../scripts/notion/sync.ts';
import { makeDataSource, makeFakeClient, makePage } from './_fake-client.ts';

test('validateSchema: accepts a data source matching the full contract', async () => {
  const client = makeFakeClient({ pages: [] });
  const ds = await validateSchema(client, 'ds');
  assert.equal(ds.id, 'ds');
});

test('validateSchema: reports date vs rich_text mismatch for Publish Date', async () => {
  const bad = makeDataSource({ 'Publish Date': { id: 'p', name: 'Publish Date', type: 'rich_text', rich_text: {} } });
  const client = makeFakeClient({ pages: [], dataSource: bad });
  await assert.rejects(() => validateSchema(client, 'ds'), (err: unknown) => {
    assert.ok(err instanceof SchemaError);
    const d = err as SchemaError;
    const pub = d.diffs.find((x) => x.field === 'Publish Date');
    assert.ok(pub, 'Publish Date diff present');
    assert.match(pub!.expected, /date/);
    assert.match(pub!.actual, /rich_text/);
    return true;
  });
});

test('validateSchema: reports missing required status option Published', async () => {
  const bad = makeDataSource({
    Status: { id: 's', name: 'Status', type: 'status', status: { options: [{ id: '1', name: 'Draft', color: 'default', description: null }], groups: [] } },
  });
  const client = makeFakeClient({ pages: [], dataSource: bad });
  await assert.rejects(() => validateSchema(client, 'ds'), (err: unknown) => {
    assert.ok(err instanceof SchemaError);
    const d = err as SchemaError;
    assert.ok(d.diffs.find((x) => x.field === 'Status' && /Published/.test(x.expected)));
    return true;
  });
});

test('validateSchema: reports missing language option en', async () => {
  const bad = makeDataSource({
    Language: { id: 'l', name: 'Language', type: 'select', select: { options: [{ id: 'z', name: 'zh', color: 'default', description: null }] } },
  });
  const client = makeFakeClient({ pages: [], dataSource: bad });
  await assert.rejects(() => validateSchema(client, 'ds'), (err: unknown) => {
    assert.ok(err instanceof SchemaError);
    const d = err as SchemaError;
    assert.ok(d.diffs.find((x) => x.field === 'Language' && /en/.test(x.expected)));
    return true;
  });
});

test('validateSchema: reports all diffs at once before any query', async () => {
  const bad = makeDataSource({
    'Publish Date': { id: 'p', name: 'Publish Date', type: 'rich_text', rich_text: {} },
    Status: { id: 's', name: 'Status', type: 'status', status: { options: [], groups: [] } },
  });
  const client = makeFakeClient({ pages: [], dataSource: bad });
  await assert.rejects(() => validateSchema(client, 'ds'), (err: unknown) => {
    assert.ok(err instanceof SchemaError);
    const d = err as SchemaError;
    assert.ok(d.diffs.length >= 2);
    return true;
  });
});

test('runSync: no candidate output on schema failure', async () => {
  const bad = makeDataSource({ 'Publish Date': { id: 'p', name: 'Publish Date', type: 'rich_text', rich_text: {} } });
  const client = makeFakeClient({ pages: [makePage({ id: 'p1', name: 'X', slug: 'x', description: 'd', lang: 'zh', pubStart: '2024-01-01T00:00:00.000Z' })], dataSource: bad });
  await assert.rejects(() => runSync(client, 'ds', 'tmp-root-should-not-exist'));
});
