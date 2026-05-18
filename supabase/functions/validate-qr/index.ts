// supabase/functions/validate-qr/index.ts
// ============================================================
// Trackside Tales · v4.3 — QR Validation Edge Function
// ============================================================
// Deploy: supabase functions deploy validate-qr
//
// Required environment variables (set in Supabase Dashboard →
// Settings → Edge Functions → Secrets):
//   SUPABASE_URL              — your project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key (never in browser)
//
// POST /functions/v1/validate-qr
// Body: { "code": "<scanned token or URL>", "guest_id": "<optional>" }
//
// Success: { valid:true, tale_slug, beer_id, qr_code, message }
// Failure: { valid:false, reason }
// ============================================================

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS ─────────────────────────────────────────────────────
// Demo: allow GitHub Pages origin + localhost dev ports.
const ALLOWED_ORIGINS = [
  'https://jayc92.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
];

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  };
}

// ── Token extractor ───────────────────────────────────────────
// Accepts either a raw token or a URL containing ?code=<token>
function extractToken(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  // Try as a URL first
  try {
    const url    = new URL(text);
    const param  = url.searchParams.get('code');
    if (param)   return param.trim();

    // Hash-style: /#/scan?code=...
    const hash   = url.hash || '';
    if (hash.includes('?')) {
      const hp = new URLSearchParams(hash.split('?')[1]);
      const hc = hp.get('code');
      if (hc) return hc.trim();
    }
  } catch (_) {
    // Not a URL — treat the whole string as a token
  }

  return text;
}

// ── Main handler ─────────────────────────────────────────────
serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors   = corsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ valid: false, reason: 'method_not_allowed' }),
      { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  // ── Parse body ─────────────────────────────────────────────
  let body: { code?: string; guest_id?: string };
  try {
    body = await req.json();
  } catch (_) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'invalid_json' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const rawCode = body?.code;
  if (!rawCode) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'missing_code' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const token = extractToken(String(rawCode));
  if (!token) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'missing_code' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  // ── Supabase client (service role — server-side only) ───────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'server_misconfigured' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Look up QR code ─────────────────────────────────────────
  const { data: rows, error } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('code', token)
    .eq('is_active', true)
    .limit(1);

  if (error || !rows || rows.length === 0) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'unknown_or_inactive_code' }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const qr  = rows[0];
  const now = new Date();

  // ── Temporal validation ────────────────────────────────────
  if (qr.valid_from && new Date(qr.valid_from) > now) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'not_yet_valid' }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  if (qr.valid_until && new Date(qr.valid_until) < now) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'expired_code' }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  // ── Resolve tale_slug ──────────────────────────────────────
  // Prefer the denormalized tale_slug column. If missing, attempt a
  // join-style lookup via tale_id.
  let taleSlug: string | null = qr.tale_slug || null;

  if (!taleSlug && qr.tale_id) {
    const { data: taleRows } = await supabase
      .from('tales')
      .select('slug')
      .eq('id', qr.tale_id)
      .limit(1);
    taleSlug = taleRows?.[0]?.slug || null;
  }

  if (!taleSlug) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'tale_not_found' }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  // ── Success ────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      valid:     true,
      tale_slug: taleSlug,
      beer_id:   qr.beer_id   || null,
      qr_code:   token,
      message:   'QR code validated'
    }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
  );
});
