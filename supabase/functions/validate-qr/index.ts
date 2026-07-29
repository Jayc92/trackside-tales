// ================== validate-qr (SUPABASE/PUBLIC-v7.4B.P.13b) ==================
// Server-authoritative QR validation for Trackside Tales.
//
// Supersedes the ADMIN-v6.6 draft, which was written against the
// canonical (greenfield) qr_codes schema and would 500 against
// production: it selected `purpose` and `redirect_to` (absent in
// production), ignored `status` / `valid_from` / `valid_until` /
// `max_uses`, could not resolve legacy `tale_id`-associated rows, and
// returned distinct failure reasons plus internal identifiers
// (qrCodeId, HMAC receipt). The receipt/log-events handshake it
// anticipated was never deployed; P.13b removes it from this contract
// entirely (event logging remains a deferred, separate concern).
//
// Contract (P.13b):
//   * POST JSON { "code": string } — nothing else is read from the body.
//   * 200 { "valid": true, "taleSlug": "<canonical-slug>" } when and only
//     when the code row is active and usable AND its Tale is
//     published + active. The slug comes from the Tale row, never from
//     client input.
//   * 200 { "valid": false, "error": "invalid_qr" } for EVERY validation
//     failure — unknown, inactive, revoked, expired, future-dated,
//     max_uses-limited, malformed association, or unavailable Tale.
//     One generic body by design: distinct reasons would let an
//     unauthenticated caller probe which codes exist, which are merely
//     inactive, and whether a Tale exists. 200 (not 4xx) so the client
//     can distinguish "the server decisively rejected this code" from
//     "the server is unreachable" (non-200) — both fail closed, but the
//     UI copy differs.
//   * 400 for unparseable/invalid request bodies, 405 for non-POST,
//     503 for server-side misconfiguration or database errors — all
//     with the same generic body. The client treats any non-200 as
//     "validation unavailable" and never falls back to permissive
//     local unlocking.
//   * NO writes. NO receipt. NO qr id, raw code, tale_id, campaign/batch
//     keys, status detail, or database error text in any response.
//
// Env (auto-injected by the Supabase Edge runtime — never shipped to
// the browser):
//   * SUPABASE_URL
//   * SUPABASE_SERVICE_ROLE_KEY — required because qr_codes is RLS
//     service-role-only (P.13b lockdown migration removes the legacy
//     anon-readable demo_qr_codes_select policy).
//
// max_uses posture: production has no trustworthy per-code redemption
// ledger (unlock_events is a read-side compat VIEW over legacy tables;
// nothing writes a redemption row in this flow). Enforcing a numeric
// cap without a ledger would be theater, and silently ignoring it
// would over-honor a row an operator explicitly tried to limit. We
// therefore FAIL CLOSED: a non-null max_uses makes the code invalid
// until a real usage ledger exists. All six current production rows
// have max_uses = NULL, so none regress.

// deno-lint-ignore-file no-explicit-any

// ---- CORS ----------------------------------------------------------------
// Explicit origin allowlist (the earlier '*' wildcard is retired):
// the deployed GitHub Pages origin plus local Vite dev/preview ports.
// The response echoes the request Origin only when allowlisted; other
// origins get no CORS headers (browser blocks the read). Non-browser
// callers (no Origin header) are unaffected — CORS is not the security
// boundary here, the generic response body is.
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

// ---- responses -------------------------------------------------------------
function jsonResponse(
  req: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(req),
    },
  });
}

/** The single generic failure body — see the header comment for why. */
function invalid(req: Request, status = 200): Response {
  return jsonResponse(req, status, { valid: false, error: 'invalid_qr' });
}

// ---- env -------------------------------------------------------------------
function readEnv(name: string): string | null {
  // @ts-ignore Deno is available in the Supabase Edge runtime.
  const value = (typeof Deno !== 'undefined' && Deno.env?.get?.(name)) || '';
  return value ? String(value) : null;
}

// ---- input -----------------------------------------------------------------
// Opaque code length bounds. Real codes are operator-minted values;
// 4 chars is below any plausible code, 512 far above — the bounds
// exist to reject junk cheaply, not to encode a format. A bare Tale
// slug that happens to fall in-range is still useless: only an exact
// qr_codes.code match validates, so a slug is never proof of unlock.
const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 512;

function parseCode(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const codeValue = (raw as Record<string, unknown>).code;
  if (typeof codeValue !== 'string') return null;
  const trimmed = codeValue.trim();
  if (trimmed.length < MIN_CODE_LENGTH || trimmed.length > MAX_CODE_LENGTH) {
    return null;
  }
  return trimmed;
}

// ---- PostgREST (service role) ----------------------------------------------
interface DbConfig {
  url:        string;
  serviceKey: string;
}

async function dbSelect(
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
  try {
    const parsed = await res.json();
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---- tale resolution ---------------------------------------------------------
interface TaleRow {
  id:        string;
  slug:      string;
  status:    string;
  is_active: boolean;
}

async function fetchTale(
  cfg: DbConfig,
  column: 'slug' | 'id',
  value: string,
): Promise<TaleRow | null | 'db_error'> {
  const rows = await dbSelect(
    cfg,
    'tales',
    `select=id,slug,status,is_active&${column}=eq.${encodeURIComponent(value)}&limit=1`,
  );
  if (rows === null) return 'db_error';
  if (rows.length === 0) return null;
  const row = rows[0];
  if (typeof row.slug !== 'string' || typeof row.id !== 'string') return null;
  return row as TaleRow;
}

// ---- main handler ------------------------------------------------------------
async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return invalid(req, 405);
  }

  const supabaseUrl = readEnv('SUPABASE_URL');
  const serviceKey  = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    // Deploy-time mistake. Log the category only — never request data.
    console.error('[validate-qr] missing required env');
    return invalid(req, 503);
  }
  const cfg: DbConfig = { url: supabaseUrl, serviceKey };

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return invalid(req, 400);
  }
  const code = parseCode(bodyRaw);
  if (code === null) {
    return invalid(req, 400);
  }

  // 1. Exact-match lookup. The code value itself is never logged and
  //    never echoed back.
  const qrRows = await dbSelect(
    cfg,
    'qr_codes',
    'select=id,tale_slug,tale_id,status,is_active,valid_from,valid_until,max_uses' +
      `&code=eq.${encodeURIComponent(code)}&limit=1`,
  );
  if (qrRows === null) {
    console.error('[validate-qr] qr_codes lookup failed');
    return invalid(req, 503);
  }
  if (qrRows.length === 0) {
    return invalid(req); // unknown code — indistinguishable from any other failure
  }
  const qr = qrRows[0];

  // 2. Usability gates. Every one fails to the same generic response.
  if (qr.status !== 'active') return invalid(req);       // inactive / revoked
  if (qr.is_active !== true)  return invalid(req);       // NULL fails closed
  const nowMs = Date.now();
  if (typeof qr.valid_from === 'string' && Date.parse(qr.valid_from) > nowMs) {
    return invalid(req);                                  // not yet valid
  }
  if (typeof qr.valid_until === 'string' && Date.parse(qr.valid_until) < nowMs) {
    return invalid(req);                                  // expired
  }
  if (qr.max_uses !== null && qr.max_uses !== undefined) {
    // Fail closed — no redemption ledger exists to enforce a cap.
    // See the header comment. All current production rows are NULL.
    return invalid(req);
  }

  // 3. Tale resolution — supports both production association models.
  //    tale_slug (modern rows) wins; tale_id (legacy rows) is the
  //    fallback; when BOTH are set they must agree, otherwise the row
  //    is misconfigured and fails closed.
  const taleSlug = typeof qr.tale_slug === 'string' && qr.tale_slug.trim() !== ''
    ? qr.tale_slug.trim()
    : null;
  const taleId = typeof qr.tale_id === 'string' && qr.tale_id !== ''
    ? qr.tale_id
    : null;

  let tale: TaleRow | null | 'db_error';
  if (taleSlug !== null) {
    tale = await fetchTale(cfg, 'slug', taleSlug);
    if (tale !== null && tale !== 'db_error' && taleId !== null && tale.id !== taleId) {
      // Association mismatch: the slug and the id point at different
      // Tales. Fail closed rather than guess which one the operator meant.
      return invalid(req);
    }
  } else if (taleId !== null) {
    tale = await fetchTale(cfg, 'id', taleId);
  } else {
    return invalid(req); // no association at all
  }

  if (tale === 'db_error') {
    console.error('[validate-qr] tales lookup failed');
    return invalid(req, 503);
  }
  if (tale === null) return invalid(req);

  // 4. The Tale itself must be publicly visible. This mirrors the
  //    public content filter (status='published' AND is_active) so a
  //    QR can never unlock a draft or archived Tale — and the failure
  //    is indistinguishable from an unknown code.
  if (tale.status !== 'published' || tale.is_active !== true) {
    return invalid(req);
  }

  // 5. Success: the canonical slug from the Tale row — the minimum
  //    non-secret result the public app needs.
  return jsonResponse(req, 200, { valid: true, taleSlug: tale.slug });
}

// @ts-ignore Deno is available in the Supabase Edge runtime.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    // Never leak error detail to the caller; category-only server log.
    console.error('[validate-qr] unhandled error', err);
    return invalid(req, 503);
  }
});
