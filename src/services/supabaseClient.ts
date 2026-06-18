// ================== SUPABASE CONFIG ==================
// Remote content is off by default — the app functions fully on local data.
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable.
//
// ADMIN-v7.4B.M.5.2.2 — per-category remote content flags.
//
// Until M.5.2.2 the public app had a single `USE_REMOTE_CONTENT`
// boolean that activated remote Tales, beers (regulars + non-alc),
// food, and reward tiers together as soon as a Supabase URL +
// anon key were present. M.5.1's local validation revealed that
// production's `beers` and `food_items` tables don't carry the
// canonical column set the public app's beer/food fetchers SELECT
// against (production has `short_description` / `description` /
// `sort_order` while the public app expects `abbr` / `tasting` /
// `display_order` for beers; production's food has only id, name,
// category, is_active, updated_at while the public app expects
// slug, description, display_order). Flipping the global flag on
// would have crashed those fetches with PostgREST 400.
//
// M.5.2.2 splits the flag by category. Tales can now go remote
// independently; beers, food, and reward tiers remain on local
// fallback until each one is separately fixed.
//
// `USE_REMOTE_CONTENT` is preserved as a backwards-compat alias
// that simply means "Supabase configuration is present at all"
// (URL + anon key set). It is NOT sufficient to enable any data-
// fetching code path. The category-specific flags
// (USE_REMOTE_TALES / USE_REMOTE_BEERS / USE_REMOTE_FOOD /
// USE_REMOTE_REWARDS) are the only gates that actually trigger a
// remote fetch in contentService.ts. Other consumers
// (qrValidation.ts, guestPersistence.ts, badgeService.ts) read
// USE_REMOTE_CONTENT to decide whether to bother attempting a
// signed-receipt write at all — they all degrade to no-ops when
// it's false. That behavior is preserved unchanged.
//
// Default: every category flag is FALSE unless the corresponding
// env var is the literal string 'true'. '' / 'TRUE' / '1' /
// 'false' / unset all evaluate to disabled.

export const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

// Backwards-compat alias: "is Supabase configured at all?". Used by
// qrValidation, guestPersistence, badgeService to decide whether
// to even attempt a Supabase round-trip. Does NOT enable any
// content fetcher on its own — see the per-category flags below.
export const USE_REMOTE_CONTENT = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// ADMIN-v7.4B.M.5.2.2 — per-category remote content gates.
// Each requires:
//   1. Supabase URL + anon key configured (so `supabaseFetch` can
//      issue a request at all), AND
//   2. The corresponding VITE_USE_REMOTE_* env var equal to the
//      literal string 'true'.
// All flags default to false. The gates are independent: a deploy
// can enable Tales while keeping beers / food / rewards on local
// fallback. Flipping any one of them on without satisfying both
// conditions is a no-op.

export const USE_REMOTE_TALES = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  import.meta.env.VITE_USE_REMOTE_TALES === 'true'
);

export const USE_REMOTE_BEERS = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  import.meta.env.VITE_USE_REMOTE_BEERS === 'true'
);

export const USE_REMOTE_FOOD = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  import.meta.env.VITE_USE_REMOTE_FOOD === 'true'
);

export const USE_REMOTE_REWARDS = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  import.meta.env.VITE_USE_REMOTE_REWARDS === 'true'
);

// ADMIN-v6.6 — server-side QR validation (validate-qr edge function).
// Deliberately separate from USE_REMOTE_CONTENT: remote content can be
// safely on while QR validation stays off (e.g., during admin staging
// before the edge function is deployed). Defaults to OFF and only
// flips on when the deploy explicitly opts in via env.
//
// Wiring is not yet present in ScanPage — this flag exists so the
// helper in src/services/qrValidationRemote.ts has something to gate
// on once v6.7 wires it into the scan flow.
export const USE_REMOTE_QR_VALIDATION = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  import.meta.env.VITE_USE_REMOTE_QR_VALIDATION === 'true'
);

// ADMIN-v6.8B — first-party event logging (log-events edge function).
// Deliberately separate from USE_REMOTE_CONTENT and
// USE_REMOTE_QR_VALIDATION: any of the three may be on while the others
// stay off. Defaults to OFF and only flips on when the deploy explicitly
// opts in via env.
//
// No public-app wiring exists yet — this flag exists so the helper in
// src/services/eventLogger.ts has something to gate on once
// ADMIN-v6.8C/D wire it into the scan and game flows. With the flag
// off, every logEvent() call is a no-op and zero network traffic is
// generated.
export const USE_REMOTE_EVENTS = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  import.meta.env.VITE_USE_REMOTE_EVENTS === 'true'
);

// ---- Fetch helper ----
export async function supabaseFetch(
  table: string,
  params = '',
  fetchOpts: RequestInit & { headers?: Record<string, string> } = {}
): Promise<unknown> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('[trackside] Supabase not configured');
  }
  const url = params
    ? `${SUPABASE_URL}/rest/v1/${table}?${params}`
    : `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: fetchOpts.method || 'GET',
    headers: {
      apikey:        SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      Accept:        'application/json',
      ...(fetchOpts.headers || {}),
    },
    ...(fetchOpts.body ? { body: fetchOpts.body } : {}),
  });
  if (!res.ok) throw new Error(`[trackside] Supabase fetch failed: ${table} ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : true;
}
