// ================== preview-tale (ADMIN/PUBLIC-v7.4B.P.15c) ==================
// Server-authoritative draft-Tale preview resolver.
//
// The admin app mints a short-lived signed token for EXACTLY ONE Tale
// (any status — draft, inactive, archived, or published) and opens
//   <public-app>/#/story/<slug>?preview=<token>
// The public app POSTs the token here; this function validates the
// signature + expiry and returns that single Tale row for rendering.
//
// Token format:  base64url(payloadJson) + '.' + base64url(hmacSha256)
//   payload = { t: <tale uuid>, s: <slug at mint time>, exp: <unix s> }
//
// Signing key: derived, NOT stored. Both the admin server (Vercel env)
// and this Edge runtime already hold SUPABASE_SERVICE_ROLE_KEY, so the
// preview key is HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY,
// 'trackside-tale-preview-v1'). HMAC output cannot be inverted to the
// service-role key, no new secret/env var exists to provision or
// rotate separately, and rotating the service-role key automatically
// invalidates all outstanding preview tokens.
//
// Security posture:
//   * Validates BEFORE any DB read; failures are indistinguishable
//     cheap rejections except for the deliberately distinguished
//     'expired' / 'tale_unavailable' reasons — this is admin-facing
//     tooling, and an expired-vs-invalid distinction leaks nothing a
//     token holder didn't already know.
//   * Returns ONE row, by the token's Tale id — never a collection,
//     never other drafts.
//   * The normal public Tale query, RLS, and validate-qr are untouched:
//     drafts remain invisible to anon reads and un-unlockable by QR.
//   * Read-only: no writes of any kind.
//   * Tokens are never logged; server logs are category-only.

// deno-lint-ignore-file no-explicit-any

const ENCODER = new TextEncoder();
const PREVIEW_KEY_CONTEXT = 'trackside-tale-preview-v1';
const MAX_TOKEN_LENGTH = 2048;

// Explicit CORS origins — same posture as validate-qr. Update when a
// custom domain lands.
const ALLOWED_ORIGINS = new Set<string>([
  'https://jayc92.github.io',   // GitHub Pages production origin
  'http://localhost:5173',      // vite dev
  'http://localhost:4173',      // vite preview (default)
  'http://localhost:4174',      // vite preview (project convention)
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary':                         'Origin',
  };
}

function jsonResponse(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(req),
    },
  });
}

function fail(req: Request, reason: 'invalid' | 'expired' | 'tale_unavailable', status = 200): Response {
  return jsonResponse(req, status, { valid: false, reason });
}

function readEnv(name: string): string | null {
  // @ts-ignore Deno is available in the Supabase Edge runtime.
  const value = (typeof Deno !== 'undefined' && Deno.env?.get?.(name)) || '';
  return value ? String(value) : null;
}

// ---- base64url + crypto -----------------------------------------------------

function b64urlDecodeToString(value: string): string | null {
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

async function hmacSha256(keyBytes: Uint8Array, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, ENCODER.encode(message));
  return new Uint8Array(sig);
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time string comparison (both sides are base64url text). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---- main handler -------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') return fail(req, 'invalid', 405);

  const supabaseUrl = readEnv('SUPABASE_URL');
  const serviceKey  = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('[preview-tale] missing required env');
    return fail(req, 'invalid', 503);
  }

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return fail(req, 'invalid', 400);
  }
  const token = typeof (bodyRaw as Record<string, unknown>)?.token === 'string'
    ? ((bodyRaw as Record<string, unknown>).token as string).trim()
    : '';
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return fail(req, 'invalid', 400);
  }

  // 1. Structural parse: payloadB64.sigB64
  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0 || dotIndex === token.length - 1) return fail(req, 'invalid');
  const payloadB64 = token.slice(0, dotIndex);
  const sigB64     = token.slice(dotIndex + 1);

  // 2. Signature check FIRST (derived key; constant-time compare).
  const derivedKey = await hmacSha256(ENCODER.encode(serviceKey), PREVIEW_KEY_CONTEXT);
  const expectedSig = b64urlEncode(await hmacSha256(derivedKey, payloadB64));
  if (!timingSafeEqual(expectedSig, sigB64)) return fail(req, 'invalid');

  // 3. Payload parse + expiry.
  const payloadJson = b64urlDecodeToString(payloadB64);
  if (payloadJson === null) return fail(req, 'invalid');
  let payload: { t?: unknown; s?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return fail(req, 'invalid');
  }
  const taleId = typeof payload.t === 'string' && UUID_RE.test(payload.t) ? payload.t : null;
  const exp    = typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null;
  if (taleId === null || exp === null) return fail(req, 'invalid');
  if (exp * 1000 <= Date.now()) return fail(req, 'expired');

  // 4. Service-role read of the ONE authorized Tale — deliberately NO
  //    status/is_active filter (draft/inactive/archived are exactly
  //    what preview exists for). Column list mirrors the public
  //    TALE_SELECT so the client-side adapter behaves identically.
  const columns =
    'slug,name,title,year,chapter_label,story_body,timeline,map_points,' +
    'tap_status,mini_game_type,sort_order,updated_at,' +
    'subtitle,person_or_place,intro_type,intro_asset_url,stamp_image_url';
  let rows: any[] | null = null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tales?select=${columns}&id=eq.${encodeURIComponent(taleId)}&limit=1`,
      {
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept:        'application/json',
        },
      },
    );
    if (res.ok) {
      const parsed = await res.json();
      rows = Array.isArray(parsed) ? parsed : null;
    }
  } catch {
    rows = null;
  }
  if (rows === null) {
    console.error('[preview-tale] tales lookup failed');
    return fail(req, 'invalid', 503);
  }
  if (rows.length === 0) return fail(req, 'tale_unavailable');

  return jsonResponse(req, 200, {
    valid:     true,
    row:       rows[0],
    expiresAt: exp,
  });
}

// @ts-ignore Deno is available in the Supabase Edge runtime.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[preview-tale] unhandled error', err);
    return fail(req, 'invalid', 503);
  }
});
