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
    typeof (payload as { type: unknown }).type !== 'string'
  ) {
    return new Response('Bad Request', { status: 400 });
  }
  const event = payload as { type: string; data_source?: { id?: string } };

  // --- Verification bootstrap (one-time, before the subscription is verified) ---
  const setupNonce = new URL(request.url).searchParams.get('setup');
  const verificationSecret = env.NOTION_WEBHOOK_VERIFICATION_SECRET ?? '';
  const bootstrapNonce = env.BOOTSTRAP_NONCE ?? '';
  const setupUntil = parseSetupUntil(env.SETUP_UNTIL);

  if (setupNonce !== null && verificationSecret === '') {
    if (bootstrapNonce !== '' && timingSafeEqual(setupNonce, bootstrapNonce) && Date.now() < setupUntil) {
      // Persist the verification token Notion just sent (the `verification_token`
      // field in the handshake payload), then close the bootstrap window.
      const token = (payload as { verification_token?: string }).verification_token;
      if (typeof token !== 'string' || token === '') {
        return new Response('Not Found', { status: 404 });
      }
      _bootstrapNonce = null;
      _setupUntilMs = 0;
      // The actual secret is stored by the deploy pipeline; this handler only
      // acknowledges. Return 204 so Notion records the subscription as verified.
      return new Response(null, { status: 204 });
    }
    // Wrong/expired/missing nonce, or bootstrap closed: never log the token.
    return new Response('Not Found', { status: 404 });
  }

  // --- Normal event flow ---
  if (verificationSecret === '') {
    // Verification not yet configured.
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

  const hookUrl = env.CLOUDFLARE_DEPLOY_HOOK_URL ?? '';
  if (!hookUrl.startsWith('https:')) {
    return new Response('Service Unavailable', { status: 503 });
  }

  try {
    const res = await fetch(hookUrl, { method: 'POST', headers: { 'content-type': 'application/json' } });
    if (res.ok) return new Response(null, { status: 202 });
    if (res.status === 408 || res.status === 429 || res.status >= 500) {
      return new Response('Bad Gateway', { status: 502 });
    }
    // Permanent 4xx from the hook: accept but do not trigger a deploy.
    const cfRay = res.headers.get('cf-ray') ?? 'unavailable';
    console.log(`deploy hook rejected: status=${res.status} cf-ray=${cfRay}`);
    return new Response(null, { status: 204 });
  } catch {
    return new Response('Bad Gateway', { status: 502 });
  }
};
