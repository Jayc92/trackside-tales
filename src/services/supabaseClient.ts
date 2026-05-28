// ================== SUPABASE CONFIG ==================
// Remote content is off by default — the app functions fully on local data.
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable.

export const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const USE_REMOTE_CONTENT = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

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
