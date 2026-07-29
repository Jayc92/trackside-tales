// ================== QR VALIDATION REMOTE (PUBLIC-v7.4B.P.13b) ==================
// Thin client for the `validate-qr` Supabase Edge Function.
//
// P.13b makes this path AUTHORITATIVE: when USE_REMOTE_QR_VALIDATION is
// on (the production posture), a scan unlocks a Tale only if this call
// returns { status: 'valid' } with the server-resolved canonical slug.
// The three outcomes matter to the caller:
//
//   * 'valid'       — the server decisively accepted the code. The
//                     returned taleSlug is the Tale row's canonical
//                     slug (never the raw scanned payload).
//   * 'invalid'     — the server was reached and decisively rejected
//                     the code (200 + { valid:false }). The server body
//                     is deliberately generic; no reason taxonomy exists
//                     client-side either.
//   * 'unavailable' — flag off, env missing, network error, non-200,
//                     or unparseable body. The caller FAILS CLOSED: no
//                     unlock, no fallback to permissive local parsing.
//                     (The bounded curated demo path is a separate,
//                     explicitly-gated mode — see qrValidation.ts.)
//
// The v6.6 receipt fields (qrCodeId / receipt / receiptExp) are gone:
// the hardened function returns only { valid, taleSlug }, and the
// log-events receipt pipeline it fed was never deployed. No raw code
// or validation artifact is ever persisted client-side.

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  USE_REMOTE_QR_VALIDATION,
} from './supabaseClient';

// ---- public types -------------------------------------------------------

export type QrRemoteValidation =
  | { status: 'valid'; taleSlug: string }
  | { status: 'invalid' }
  | { status: 'unavailable' };

// Client-side sanity bounds mirroring the server (4–512 chars after
// trim). Out-of-bounds input is decisively invalid — no request needed.
const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 512;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---- request ------------------------------------------------------------

/**
 * Validate a scanned code against the validate-qr Edge Function.
 *
 * Sends ONLY { code } — the server reads nothing else. Never throws.
 * Never logs the code value.
 */
export async function validateQrRemote(code: string): Promise<QrRemoteValidation> {
  if (!USE_REMOTE_QR_VALIDATION) return { status: 'unavailable' };
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { status: 'unavailable' };

  if (typeof code !== 'string') return { status: 'invalid' };
  const trimmed = code.trim();
  if (trimmed.length < MIN_CODE_LENGTH || trimmed.length > MAX_CODE_LENGTH) {
    return { status: 'invalid' };
  }

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/validate-qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey:         SUPABASE_ANON_KEY,
        Authorization:  `Bearer ${SUPABASE_ANON_KEY}`,
        Accept:         'application/json',
      },
      body: JSON.stringify({ code: trimmed }),
    });
  } catch {
    // Network failure. No error object is logged here on purpose —
    // fetch errors can embed the request URL, and the caller already
    // surfaces an "unavailable" message.
    return { status: 'unavailable' };
  }

  // Non-200 = the server did not produce a decisive validation verdict
  // (missing function, misconfiguration, 5xx). Fail closed as
  // unavailable — never as a local-parse fallback.
  if (res.status !== 200) return { status: 'unavailable' };

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { status: 'unavailable' };
  }
  if (!isObj(parsed)) return { status: 'unavailable' };

  if (parsed.valid === true && typeof parsed.taleSlug === 'string' && parsed.taleSlug) {
    return { status: 'valid', taleSlug: parsed.taleSlug };
  }
  if (parsed.valid === false) {
    return { status: 'invalid' };
  }
  return { status: 'unavailable' };
}
