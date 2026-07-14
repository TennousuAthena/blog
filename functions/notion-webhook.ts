import { verifyWebhookSignature } from '@notionhq/client';
import type { PagesFunction } from '@cloudflare/workers-types';
const MAX_BODY_BYTES = 256 * 1024;

/** Accept only these Notion data-source webhook event types. */
const ACCEPTED_EVENT_TYPES = new Set([
  'data_source.entry_created',
  'data_source.entry_updated',
  'data_source.entry_deleted',
  'data_source.entry_restored',
]);

let _bootstrapNonce: string | null = null;
let _setupUntilMs = 0;

function parseSetupUntil(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.headers.get('content-type')?.toLowerCase() !== 'application/json') {
    return new Response('Unsupported Media Type', { status: 415 });
  }

  // Bounded read: abort if the declared or actual body exceeds the cap.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    return new Response('Payload Too Large', { status: 413 });
  }
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_BODY_BYTES) {
    return new Response('Payload Too Large', { status: 413 });
  }
  const raw = new TextDecoder().decode(buf);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('type' in payload) ||
    typeof payload.type !== 'string'
  ) {
    return new Response('Bad Request', { status: 400 });
  }
  const event: { type: string; data_source?: { id?: string } } =
    'data_source' in payload && typeof payload.data_source === 'object' && payload.data_source !== null
      ? { type: payload.type, data_source: payload.data_source as { id?: string } }
      : { type: payload.type };
  // --- Verification bootstrap ---
  // When NOTION_WEBHOOK_VERIFICATION_SECRET is empty, accept Notion's
  // verification request, log the token for capture, and return 200.
  // No nonce needed — Notion's verification is done manually in the UI.
  const verificationSecret = env.NOTION_WEBHOOK_VERIFICATION_SECRET ?? '';
  if (verificationSecret === '') {
    if ('verification_token' in payload && typeof payload.verification_token === 'string') {
      const token = payload.verification_token;
      if (token !== '') {
        console.log(`VERIFICATION_TOKEN=${token}`);
        return new Response(null, { status: 200 });
      }
    }
    // Not a verification request, but secret not yet configured.
    return new Response('Service Unavailable', { status: 503 });
  }
  const signature = request.headers.get('X-Notion-Signature');
  const ok = await verifyWebhookSignature({
    body: raw,
    signature,
    verificationToken: verificationSecret,
  });
  if (!ok) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!ACCEPTED_EVENT_TYPES.has(event.type)) {
    // Unknown event type: ignore silently.
    return new Response(null, { status: 202 });
  }
  const dataSourceId = env.NOTION_DATA_SOURCE_ID ?? '';
  const payloadSourceId = event.data_source?.id ?? '';
  if (dataSourceId !== '' && payloadSourceId !== dataSourceId) {
    // Event belongs to a different data source.
    return new Response(null, { status: 202 });
  }

  const cnbToken = env.CNB_API_TOKEN ?? '';
  const cnbRepo = env.CNB_REPO ?? 'kiwimoe/blog';
  if (!cnbToken.startsWith('cnb_')) {
    return new Response('Service Unavailable', { status: 503 });
  }

  try {
    const res = await fetch(`https://api.cnb.cool/${cnbRepo}/-/build/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cnbToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        branch: 'main',
        event: 'api_trigger_notion',
        title: `Notion webhook: ${event.type}`,
      }),
    });
    if (res.ok) return new Response(null, { status: 202 });
    if (res.status === 408 || res.status === 429 || res.status >= 500) {
      return new Response('Bad Gateway', { status: 502 });
    }
    console.log(`cnb build trigger rejected: status=${res.status}`);
    return new Response(null, { status: 204 });
  } catch {
    return new Response('Bad Gateway', { status: 502 });
  }
};
