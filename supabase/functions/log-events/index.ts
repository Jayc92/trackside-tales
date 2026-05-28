// ================== log-events (ADMIN-v6.8A) ==================
// First-party event logging Edge Function. Writer counterpart to
// validate-qr (ADMIN-v6.6). Accepts a small batch of events from the
// public app and appends rows to unlock_events / badge_events /
// game_events, while keeping user_badges and guest_profiles in sync
// as derived state.
//
// Behavior contract:
//   * POST JSON body: { guestId: string, events: EventPayload[] } where
//     events is 1..20 entries.
//   * 200 with { ok:true, accepted, rejected, rejectedReasons } on
//     batch-level success. Per-event problems show up in
//     rejectedReasons; the rest of the batch still inserts.
//   * 400 for batch-level problems (malformed body, missing guestId,
//     missing events array, batch > 20).
//   * 500 for genuine server errors (env vars missing, DB unreachable
//     after one retry, unhandled exception).
//   * No raw IP read. No user_agent stored. No client-supplied
//     created_at — server uses now() (i.e. omits the column on insert
//     and lets the table default fill it).
//   * No third-party analytics, no cookies, no URL-param echoing.
//
// Receipt verification (tale_unlocked, source='scan' only):
//   * Receipt format matches validate-qr output exactly:
//       <b64url(JSON {g,t,q,s,exp})>.<b64url(HMAC-SHA256(payloadB64))>
//   * Verify HMAC against RECEIPT_SECRET (constant-time).
//   * Verify exp > now (unix seconds).
//   * Verify payload.t === event.taleSlug.
//   * Verify payload.q exists in qr_codes (single SELECT per event).
//   * On any failure, still insert unlock_events with qr_code_id=NULL
//     and emit a rejectedReason for the enrichment (NOT the row).
//   * tale_unlocked WITHOUT a receipt is allowed — inserted with
//     qr_code_id=NULL, no rejection. Direct/featured-tale unlocks
//     legitimately have no receipt.
//
// Env vars (Supabase Cloud function settings):
//   * SUPABASE_URL              — auto-injected
//   * SUPABASE_SERVICE_ROLE_KEY — auto-injected; required for inserts
//     against RLS-locked event tables.
//   * RECEIPT_SECRET            — required; matches validate-qr.

// deno-lint-ignore-file no-explicit-any

const ENCODER = new TextEncoder();
const MAX_BATCH = 20;

const ALLOWED_EVENT_TYPES = new Set([
  'tale_unlocked',
  'badge_awarded',
  'game_started',
  'game_completed',
  'game_failed',
]);

const ALLOWED_UNLOCK_SOURCES = new Set(['scan', 'direct']);
const REJECTED_UNLOCK_SOURCES = new Set(['admin', 'share']);
const ALLOWED_BADGE_VIA       = new Set(['scan', 'game']);
const ALLOWED_GAME_TYPES      = new Set(['grid', 'spike', 'match']);

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

// ---- base64url ----------------------------------------------------------
function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    const std = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(std);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function constantTimeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---- HMAC verify --------------------------------------------------------
interface ReceiptPayload {
  g: string | null;
  t: string;
  q: string;
  s: string;
  exp: number;
}

async function verifyReceipt(
  receipt: string,
  secret: string,
): Promise<ReceiptPayload | null> {
  if (typeof receipt !== 'string' || !receipt) return null;
  const parts = receipt.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  const sigBytes = b64urlDecode(sigB64);
  if (!sigBytes) return null;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'raw',
      ENCODER.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    return null;
  }

  let expectedSig: ArrayBuffer;
  try {
    expectedSig = await crypto.subtle.sign('HMAC', key, ENCODER.encode(payloadB64));
  } catch {
    return null;
  }
  if (!constantTimeEq(sigBytes, new Uint8Array(expectedSig))) return null;

  // Decode payload AFTER signature verification (don't trust unverified bytes).
  const payloadBytes = b64urlDecode(payloadB64);
  if (!payloadBytes) return null;
  let payloadObj: unknown;
  try {
    payloadObj = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  if (typeof payloadObj !== 'object' || payloadObj === null) return null;
  const p = payloadObj as Record<string, unknown>;
  const g   = (typeof p.g === 'string') ? p.g : (p.g === null ? null : null);
  const t   = typeof p.t   === 'string' ? p.t   : null;
  const q   = typeof p.q   === 'string' ? p.q   : null;
  const s   = typeof p.s   === 'string' ? p.s   : null;
  const exp = typeof p.exp === 'number' && Number.isFinite(p.exp) ? p.exp : null;
  if (t === null || q === null || s === null || exp === null) return null;
  return { g, t, q, s, exp };
}

// ---- input parsing ------------------------------------------------------
type EventPayload = Record<string, unknown>;

interface BatchBody {
  guestId: string;
  events:  EventPayload[];
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && Math.trunc(v) === v ? v : null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseBody(raw: unknown): BatchBody | { error: string } {
  if (!isObj(raw)) return { error: 'bad_request' };
  const guestIdRaw = asString(raw.guestId);
  if (!guestIdRaw || !guestIdRaw.trim()) return { error: 'bad_request' };
  const events = raw.events;
  if (!Array.isArray(events) || events.length === 0) return { error: 'bad_request' };
  if (events.length > MAX_BATCH) return { error: 'batch_too_large' };
  const guestId = guestIdRaw.trim();
  // Sanity bound — no event will be larger than this once minified;
  // mostly defends the function against megabyte-payload abuse.
  if (guestId.length > 200) return { error: 'bad_request' };
  return { guestId, events: events.filter(isObj) as EventPayload[] };
}

// ---- DB helpers (PostgREST via service role) ----------------------------
interface DbConfig {
  url: string;
  serviceKey: string;
}

async function dbGet(
  cfg: DbConfig,
  table: string,
  query: string,
): Promise<any[] | null> {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?${query}`, {
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

async function dbWrite(
  cfg: DbConfig,
  table: string,
  body: unknown,
  preferUpsert = false,
): Promise<boolean> {
  const headers: Record<string, string> = {
    apikey:         cfg.serviceKey,
    Authorization:  `Bearer ${cfg.serviceKey}`,
    'Content-Type': 'application/json',
    Prefer:         preferUpsert
      ? 'resolution=merge-duplicates,return=minimal'
      : 'return=minimal',
  };
  // One retry for transient 5xx. Anything else returns immediately.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${cfg.url}/rest/v1/${table}`, {
        method: 'POST',
        headers,
        body:   JSON.stringify(body),
      });
    } catch {
      if (attempt === 1) return false;
      continue;
    }
    if (res.ok) return true;
    if (res.status >= 500 && attempt === 0) continue;
    return false;
  }
  return false;
}

// ---- per-event handlers -------------------------------------------------
interface EventCtx {
  cfg: DbConfig;
  guestId: string;
  secret: string;
  /** Indexed by event index — non-null entries become rejectedReasons. */
  rejections: Array<{ index: number; reason: string } | null>;
}

async function handleTaleUnlocked(
  ctx: EventCtx,
  index: number,
  ev: EventPayload,
): Promise<boolean> {
  const taleSlug = asString(ev.taleSlug);
  const source   = asString(ev.source);
  if (!taleSlug || !source) {
    ctx.rejections[index] = { index, reason: 'bad_event' };
    return false;
  }
  if (REJECTED_UNLOCK_SOURCES.has(source)) {
    ctx.rejections[index] = { index, reason: 'unsupported_source' };
    return false;
  }
  if (!ALLOWED_UNLOCK_SOURCES.has(source)) {
    ctx.rejections[index] = { index, reason: 'bad_event' };
    return false;
  }

  // Receipt verification — only when source is 'scan' and a receipt was
  // supplied. Failure produces a rejectedReason but does NOT stop the
  // unlock_events row from being inserted (with qr_code_id=null).
  let qrCodeId: string | null = null;
  if (source === 'scan' && typeof ev.receipt === 'string' && ev.receipt) {
    const verified = await verifyReceipt(ev.receipt, ctx.secret);
    if (!verified) {
      ctx.rejections[index] = { index, reason: 'receipt_invalid' };
    } else if (verified.exp <= Math.floor(Date.now() / 1000)) {
      ctx.rejections[index] = { index, reason: 'receipt_expired' };
    } else if (verified.t !== taleSlug) {
      ctx.rejections[index] = { index, reason: 'receipt_tale_mismatch' };
    } else {
      // Confirm qr_codes row still exists (active or not — we accept
      // unlocks against rotated codes; activeness was a validate-qr
      // concern, this is just integrity).
      const qrRows = await dbGet(
        ctx.cfg,
        'qr_codes',
        `select=id&id=eq.${encodeURIComponent(verified.q)}&limit=1`,
      );
      if (!qrRows || qrRows.length === 0) {
        ctx.rejections[index] = { index, reason: 'receipt_qr_unknown' };
      } else {
        qrCodeId = verified.q;
      }
    }
  }

  // Insert. `created_at` intentionally omitted — table default is now().
  // `user_agent` and `ip_hash` intentionally omitted — privacy posture.
  const ok = await dbWrite(ctx.cfg, 'unlock_events', {
    guest_id:   ctx.guestId,
    tale_slug:  taleSlug,
    source,
    qr_code_id: qrCodeId,
  });
  if (!ok) {
    // Overwrite any prior rejection with the harder failure — the row
    // didn't land, so any receipt enrichment is moot.
    ctx.rejections[index] = { index, reason: 'db_write_failed' };
    return false;
  }
  return true;
}

async function handleBadgeAwarded(
  ctx: EventCtx,
  index: number,
  ev: EventPayload,
): Promise<boolean> {
  const badgeKey = asString(ev.badgeKey);
  const taleSlug = asString(ev.taleSlug);
  const via      = asString(ev.via);
  if (!badgeKey || !taleSlug || !via || !ALLOWED_BADGE_VIA.has(via)) {
    ctx.rejections[index] = { index, reason: 'bad_event' };
    return false;
  }

  // Append to badge_events.
  const okEvent = await dbWrite(ctx.cfg, 'badge_events', {
    guest_id:    ctx.guestId,
    badge_key:   badgeKey,
    awarded_via: via,
    tale_slug:   taleSlug,
  });
  if (!okEvent) {
    ctx.rejections[index] = { index, reason: 'db_write_failed' };
    return false;
  }

  // Upsert user_badges (idempotent on (guest_id, tale_id, badge_type)).
  // If the upsert fails, the badge_events row is the source of truth;
  // we surface a rejectedReason but the event itself is counted as
  // accepted (the audit log row landed).
  const okState = await dbWrite(
    ctx.cfg,
    'user_badges',
    {
      guest_id:   ctx.guestId,
      tale_id:    taleSlug,
      badge_type: via,            // 'scan' | 'game' — matches schema check constraint
    },
    /* preferUpsert */ true,
  );
  if (!okState) {
    // Don't overwrite an earlier success-path rejection if any — but
    // there shouldn't be one here. Annotate with state-drift reason
    // so admin-side reconciliation queries can find these.
    ctx.rejections[index] = { index, reason: 'badge_state_drift' };
  }
  return true;
}

async function handleGameEvent(
  ctx: EventCtx,
  index: number,
  ev: EventPayload,
  phase: 'started' | 'completed' | 'failed',
): Promise<boolean> {
  const taleSlug = asString(ev.taleSlug);
  const gameType = asString(ev.gameType);
  if (!taleSlug || !gameType || !ALLOWED_GAME_TYPES.has(gameType)) {
    ctx.rejections[index] = { index, reason: 'bad_event' };
    return false;
  }
  const attempts   = asInt(ev.attempts);
  const durationMs = asInt(ev.durationMs);

  const row: Record<string, unknown> = {
    guest_id:  ctx.guestId,
    tale_slug: taleSlug,
    game_type: gameType,
    phase,
  };
  if (attempts   !== null) row.attempts    = attempts;
  if (durationMs !== null) row.duration_ms = durationMs;

  const ok = await dbWrite(ctx.cfg, 'game_events', row);
  if (!ok) {
    ctx.rejections[index] = { index, reason: 'db_write_failed' };
    return false;
  }
  return true;
}

async function processEvent(
  ctx: EventCtx,
  index: number,
  ev: EventPayload,
): Promise<boolean> {
  const type = asString(ev.type);
  if (!type || !ALLOWED_EVENT_TYPES.has(type)) {
    ctx.rejections[index] = { index, reason: 'unknown_event_type' };
    return false;
  }
  switch (type) {
    case 'tale_unlocked':  return handleTaleUnlocked(ctx, index, ev);
    case 'badge_awarded':  return handleBadgeAwarded(ctx, index, ev);
    case 'game_started':   return handleGameEvent(ctx, index, ev, 'started');
    case 'game_completed': return handleGameEvent(ctx, index, ev, 'completed');
    case 'game_failed':    return handleGameEvent(ctx, index, ev, 'failed');
    default:
      ctx.rejections[index] = { index, reason: 'unknown_event_type' };
      return false;
  }
}

// ---- main handler -------------------------------------------------------
async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return json(204, {});
  if (req.method !== 'POST')   return json(405, { ok: false, reason: 'method_not_allowed' });

  const supabaseUrl = readEnv('SUPABASE_URL');
  const serviceKey  = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const secret      = readEnv('RECEIPT_SECRET');
  if (!supabaseUrl || !serviceKey || !secret) {
    console.error('[log-events] missing env vars', {
      hasUrl:        Boolean(supabaseUrl),
      hasServiceKey: Boolean(serviceKey),
      hasSecret:     Boolean(secret),
    });
    return json(500, { ok: false, reason: 'misconfigured' });
  }

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return json(400, { ok: false, reason: 'bad_request' });
  }
  const parsed = parseBody(bodyRaw);
  if ('error' in parsed) {
    return json(400, { ok: false, reason: parsed.error });
  }
  const { guestId, events } = parsed;

  const cfg: DbConfig = { url: supabaseUrl, serviceKey };

  // Once-per-request guest_profiles upsert. Failure here is logged but
  // does NOT block the event batch — the events log can be reconciled
  // later, and a missing/stale guest_profiles row is recoverable.
  const profileOk = await dbWrite(
    cfg,
    'guest_profiles',
    { guest_id: guestId, last_seen_at: new Date().toISOString() },
    /* preferUpsert */ true,
  );
  if (!profileOk) {
    console.warn('[log-events] guest_profiles upsert failed', { guestId });
  }

  const ctx: EventCtx = {
    cfg,
    guestId,
    secret,
    rejections: events.map(() => null),
  };

  let accepted = 0;
  for (let i = 0; i < events.length; i++) {
    const ok = await processEvent(ctx, i, events[i]);
    if (ok) accepted++;
  }

  const rejectedReasons = ctx.rejections.filter(
    (r): r is { index: number; reason: string } => r !== null,
  );

  // If literally every event failed AND every failure was db_write_failed,
  // surface as 500 db_unavailable so the client retries the whole batch.
  // Mixed failures stay as 200 — the client should treat batch-level success
  // (ok:true) as "best-effort accepted; check rejectedReasons for detail."
  const allDbFailed =
    accepted === 0 &&
    rejectedReasons.length === events.length &&
    rejectedReasons.every((r) => r.reason === 'db_write_failed');
  if (allDbFailed) {
    return json(500, { ok: false, reason: 'db_unavailable' });
  }

  return json(200, {
    ok:              true,
    accepted,
    rejected:        rejectedReasons.length,
    rejectedReasons,
  });
}

// @ts-ignore Deno is available in the Supabase Edge runtime.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[log-events] unhandled error', err);
    return json(500, { ok: false, reason: 'server_error' });
  }
});
