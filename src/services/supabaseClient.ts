// ================== SUPABASE CONFIG ==================
// Remote content is off by default — the app functions fully on local data.
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable.

export const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const USE_REMOTE_CONTENT = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

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
