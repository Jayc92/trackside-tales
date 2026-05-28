// ================== validate-qr (ADMIN-v6.6) ==================
// Server-side QR validation. Looks up an exact `code` value in
// `qr_codes`, follows `redirect_to` if set, and returns the
// resolved tale slug along with a short-lived HMAC-signed receipt
// that downstream event-log functions (planned for ADMIN-v6.8)
// will use to authorize a single unlock_event insert.
//
// Behavior contract (this file):
//   * POST JSON body: { code: string, guestId?: string, source?: string }
//   * 200 with { ok: true, taleSlug, isDemo, qrCodeId, receipt, receiptExp }
//     when the code resolves to a published+active tale.
//   * 200 with { ok: false, reason: <string> } for known failure modes
//     (unknown_code, inactive, tale_unavailable, bad_request).
//     Returning 200 keeps the public client's network handler simple —
//     the client treats a non-2xx as "service unreachable, fall back to
//     local parse" rather than "bad input."
//   * 5xx only for genuine server errors (DB unreachable, env vars
//     missing, signing failure). The public client reads any non-200
//     as null and degrades to local QR parsing.
//   * NO writes. unlock_events / game_events / badge_events /
//     user_badges inserts are intentionally NOT performed here. Those
//     belong to the log-events function in ADMIN-v6.8.
//
// Env vars (Supabase Cloud function settings):
//   * SUPABASE_URL              — auto-injected
//   * SUPABASE_SERVICE_ROLE_KEY — auto-injected; required to read
//     qr_codes (RLS service-role-only) and tales (public read fine,
//     but we use the service role for both to keep one client).
//   * RECEIPT_SECRET            — required; HMAC-SHA256 signing key
//     for the receipt. Anything ≥32 bytes of randomness.
//
// Local edge runtime is intentionally disabled in supabase/config.toml
// (corporate TLS inspection blocks Deno deps). Smoke testing therefore
// happens against the deployed function on Supabase Cloud.

// deno-lint-ignore-file no-explicit-any

const ENCODER = new TextEncoder();
const RECEIPT_TTL_SECONDS = 5 * 60; // 5 minutes — log-events accepts within this window

// ---- env helpers --------------------------------------------------------
function readEnv(name: string): string | null {
  // @ts-ignore Deno is available in the Supabase Edge runtime.
  const v = (typeof Deno !== 'undefined' && Deno.env?.get?.(name)) || '';
  return v ? String(v) : null;
}

// ---- response helpers ---------------------------------------------------
function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':                'application/json; charset=utf-8',
      'Cache-Control':               'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

function ok(payload: Record<string, unknown>): Response {
  return json(200, { ok: true, ...payload });
}

function fail(reason: string): Response {
  // 200 + ok:false is intentional — see header comment.
  return json(200, { ok: false, reason });
}

// ---- base64url ----------------------------------------------------------
function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---- HMAC receipt -------------------------------------------------------
interface ReceiptPayload {
  g: string | null;   // guestId (anonymous allowed)
  t: string;          // taleSlug
  q: string;          // qrCodeId (uuid)
  s: string;          // source ('scan' | 'direct' | 'admin' | 'share')
  exp: number;        // unix seconds
}

async function signReceipt(payload: ReceiptPayload, secret: string): Promise<string> {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(ENCODER.encode(payloadJson));

  const key = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, ENCODER.encode(payloadB64));
  const sigB64 = b64urlEncode(new Uint8Array(sig));

  return `${payloadB64}.${sigB64}`;
}

// ---- input parsing ------------------------------------------------------
interface ValidateBody {
  code: string;
  guestId: string | null;
  source: 'scan' | 'direct' | 'admin' | 'share';
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parseBody(raw: unknown): ValidateBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const code = asString(r.code);
  if (!code || !code.trim()) return null;

  const guestIdRaw = asString(r.guestId);
  const guestId = guestIdRaw && guestIdRaw.trim() ? guestIdRaw.trim() : null;

  const sourceRaw = asString(r.source);
  const source: ValidateBody['source'] =
    sourceRaw === 'scan' || sourceRaw === 'direct' ||
    sourceRaw === 'admin' || sourceRaw === 'share'
      ? sourceRaw
      : 'scan';

  return { code: code.trim(), guestId, source };
}

// ---- DB helpers (PostgREST via service role) ----------------------------
interface DbConfig {
  url: string;
  serviceKey: string;
}

async function dbSelect(
  cfg: DbConfig,
  table: string,
  query: string,
): Promise<any[] | null> {
  const url = `${cfg.url}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey:        cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      Accept:        'application/json',
    },
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---- main handler -------------------------------------------------------
async function handle(req: Request): Promise<Response> {
  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return json(204, {});
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, reason: 'method_not_allowed' });
  }

  // Env preflight. Missing config is a deploy-time mistake; surface
  // it as 500 so the client falls back to local parse.
  const supabaseUrl = readEnv('SUPABASE_URL');
  const serviceKey  = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const secret      = readEnv('RECEIPT_SECRET');
  if (!supabaseUrl || !serviceKey || !secret) {
    console.error('[validate-qr] missing env vars', {
      hasUrl:        Boolean(supabaseUrl),
      hasServiceKey: Boolean(serviceKey),
      hasSecret:     Boolean(secret),
    });
    return json(500, { ok: false, reason: 'misconfigured' });
  }
  const cfg: DbConfig = { url: supabaseUrl, serviceKey };

  // Body.
  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return fail('bad_request');
  }
  const body = parseBody(bodyRaw);
  if (!body) return fail('bad_request');

  // 1. Look up qr_codes by exact code.
  const codeParam = encodeURIComponent(body.code);
  const qrRows = await dbSelect(
    cfg,
    'qr_codes',
    `select=id,code,tale_slug,redirect_to,is_active,purpose&code=eq.${codeParam}&limit=1`,
  );
  if (qrRows === null) {
    // DB error — surface as 500 so client falls back. Don't pretend
    // an unknown_code outcome.
    return json(500, { ok: false, reason: 'lookup_failed' });
  }
  if (qrRows.length === 0) {
    return fail('unknown_code');
  }
  const qr = qrRows[0];
  if (qr.is_active === false) {
    return fail('inactive');
  }

  // 2. Resolve target slug. redirect_to wins when set.
  const targetSlug: string | null =
    asString(qr.redirect_to) || asString(qr.tale_slug);
  if (!targetSlug) {
    // Schema requires tale_slug NOT NULL, so this is defensive only.
    return fail('unknown_code');
  }

  // 3. Confirm the tale exists and is published+active.
  const slugParam = encodeURIComponent(targetSlug);
  const taleRows = await dbSelect(
    cfg,
    'tales',
    `select=slug,is_active,status&slug=eq.${slugParam}&limit=1`,
  );
  if (taleRows === null) {
    return json(500, { ok: false, reason: 'lookup_failed' });
  }
  if (taleRows.length === 0) {
    return fail('tale_unavailable');
  }
  const tale = taleRows[0];
  if (tale.is_active !== true || tale.status !== 'published') {
    return fail('tale_unavailable');
  }

  // 4. Sign the receipt.
  const exp = Math.floor(Date.now() / 1000) + RECEIPT_TTL_SECONDS;
  const qrCodeId = String(qr.id);
  let receipt: string;
  try {
    receipt = await signReceipt(
      {
        g:   body.guestId,
        t:   targetSlug,
        q:   qrCodeId,
        s:   body.source,
        exp,
      },
      secret,
    );
  } catch (err) {
    console.error('[validate-qr] signing failed', err);
    return json(500, { ok: false, reason: 'sign_failed' });
  }

  // 5. Compute isDemo. The existing public client treats codes of
  // the form `trackside://demo/<id>` as "demo" — we honor that here.
  // qr_codes.purpose = 'test' is also treated as demo so seed rows
  // don't change shape if someone mints a non-demo URL with that
  // purpose later.
  const isDemo =
    /^trackside:\/\/demo\//i.test(body.code) || qr.purpose === 'test';

  return ok({
    taleSlug:   targetSlug,
    isDemo,
    qrCodeId,
    receipt,
    receiptExp: exp,
  });
}

// @ts-ignore Deno is available in the Supabase Edge runtime.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[validate-qr] unhandled error', err);
    return json(500, { ok: false, reason: 'server_error' });
  }
});
