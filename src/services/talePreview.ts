// ================== TALE DRAFT PREVIEW (PUBLIC-v7.4B.P.15c) ==================
// Client for the `preview-tale` Edge Function: operators mint a
// short-lived signed token in the admin app and open
//   #/story/<slug>?preview=<token>
// in the public app. This module extracts that token from the hash,
// submits it (POST body — never a GET query string to the function),
// and returns the ONE authorized Tale row for rendering through the
// normal adapter/renderer.
//
// Security posture:
//   * The token authorizes exactly one Tale for ~10 minutes and is
//     validated SERVER-side (signature + expiry); the client treats it
//     as opaque and never stores it (no localStorage/sessionStorage/
//     cookies — it lives only in the transient hash and this request).
//   * A failed/expired validation NEVER falls back to local curated
//     content or the public collection — the preview shell shows a
//     distinct failure state instead.
//   * Preview fetch failure states are deliberately distinguishable
//     (this is operator tooling, not the customer unlock path):
//     'invalid' | 'expired' | 'tale_unavailable' | 'unavailable'.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient';

export interface TalePreviewRequest {
  slug:  string;
  token: string;
}

export type TalePreviewFetchResult =
  | { status: 'ok'; row: Record<string, unknown>; expiresAt: number }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'tale_unavailable' }
  | { status: 'unavailable' };

// Bounds mirror the server: payloadB64.sigB64 of a tiny JSON payload.
const MIN_TOKEN_LENGTH = 16;
const MAX_TOKEN_LENGTH = 2048;

/**
 * Parse `#/story/<slug>?preview=<token>` from a location hash.
 * Returns null for every non-preview hash (including plain story
 * deep links, which keep their P.13b navigation-only behavior).
 */
export function parsePreviewHash(hash: string): TalePreviewRequest | null {
  const match = hash.match(/^#\/?story\/([a-z0-9\-]+)\?(.+)$/i);
  if (!match) return null;
  const slug = match[1].toLowerCase();
  const params = new URLSearchParams(match[2]);
  const token = params.get('preview');
  if (!token) return null;
  const trimmed = token.trim();
  if (trimmed.length < MIN_TOKEN_LENGTH || trimmed.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  return { slug, token: trimmed };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Submit the preview token to the preview-tale Edge Function. Never
 * throws; never logs the token.
 */
export async function fetchTalePreview(token: string): Promise<TalePreviewFetchResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { status: 'unavailable' };

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/preview-tale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey:         SUPABASE_ANON_KEY,
        Authorization:  `Bearer ${SUPABASE_ANON_KEY}`,
        Accept:         'application/json',
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    return { status: 'unavailable' };
  }
  if (res.status !== 200) return { status: 'unavailable' };

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { status: 'unavailable' };
  }
  if (!isObj(parsed)) return { status: 'unavailable' };

  if (parsed.valid === true && isObj(parsed.row) && typeof parsed.expiresAt === 'number') {
    return { status: 'ok', row: parsed.row, expiresAt: parsed.expiresAt };
  }
  if (parsed.valid === false) {
    const reason = parsed.reason;
    if (reason === 'expired')          return { status: 'expired' };
    if (reason === 'tale_unavailable') return { status: 'tale_unavailable' };
    return { status: 'invalid' };
  }
  return { status: 'unavailable' };
}
