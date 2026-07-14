import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadMedia } from '../../scripts/notion/sync.ts';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x09]);
const GIF = Buffer.from('GIF89a'.split('').map((c) => c.charCodeAt(0)).concat([0, 0, 0]));
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)]);
const AVIF = (() => {
  const b = Buffer.alloc(16);
  b.write('ftyp', 4);
  b.write('avif', 8);
  return b;
})();
const HTML_BYTES = Buffer.from('<html><body>x</body></html>');

interface MockResp {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

function mockFetch(make: () => MockResp): typeof fetch {
  return (async () => {
    const r = make();
    const buf = r.body;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buf));
        controller.close();
      },
    }), {
      status: r.status,
      headers: { ...r.headers, 'content-length': String(buf.length) },
    });
  }) as unknown as typeof fetch;
}

function setFetch(r: MockResp): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch(() => r);
  return () => {
    globalThis.fetch = original;
  };
}

test('downloadMedia: accepts five valid magic-byte formats', async () => {
  const cases: Array<[Buffer, string]> = [
    [JPEG, 'image/jpeg'],
    [PNG, 'image/png'],
    [GIF, 'image/gif'],
    [WEBP, 'image/webp'],
    [AVIF, 'image/avif'],
  ];
  for (const [buf, mime] of cases) {
    const restore = setFetch({ status: 200, headers: { 'content-type': mime }, body: buf });
    try {
      const { rel } = await downloadMedia('https://x.test/i', 'tmp/assets/p', 'cover');
      assert.match(rel, /\.(jpg|png|gif|webp|avif)$/);
    } finally {
      restore();
    }
  }
});

test('downloadMedia: rejects disguised HTML', async () => {
  const restore = setFetch({ status: 200, headers: { 'content-type': 'text/html' }, body: HTML_BYTES });
  try {
    await assert.rejects(() => downloadMedia('https://x.test/i', 'tmp/assets/p', 'cover'), /unrecognized image magic bytes/);
  } finally {
    restore();
  }
});

test('downloadMedia: header mime vs detected mismatch fails', async () => {
  const restore = setFetch({ status: 200, headers: { 'content-type': 'image/png' }, body: JPEG });
  try {
    await assert.rejects(() => downloadMedia('https://x.test/i', 'tmp/assets/p', 'cover'), /header mime/);
  } finally {
    restore();
  }
});

test('downloadMedia: oversize declared content-length fails', async () => {
  const restore = setFetch({ status: 200, headers: { 'content-type': 'image/png' }, body: PNG });
  try {
    const big = Buffer.alloc(26 * 1024 * 1024, 0);
    const r = { status: 200, headers: { 'content-type': 'image/png' }, body: big };
    globalThis.fetch = mockFetch(() => r);
    await assert.rejects(() => downloadMedia('https://x.test/i', 'tmp/assets/p', 'cover'), /declared size exceeds limit/);
  } finally {
    restore();
  }
});

test('downloadMedia: non-http(s) request URL fails', async () => {
  const restore = setFetch({ status: 200, headers: { 'content-type': 'image/png' }, body: PNG });
  try {
    await assert.rejects(() => downloadMedia('ftp://x.test/i', 'tmp/assets/p', 'cover'), /final URL not http/);
  } finally {
    restore();
  }
});
