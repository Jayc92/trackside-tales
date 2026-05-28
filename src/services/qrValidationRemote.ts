// ================== QR VALIDATION REMOTE (ADMIN-v6.6) ==================
// Thin client for the `validate-qr` Supabase Edge Function.
//
// Behavior contract:
//   * Returns null whenever the remote path can't be relied on:
//       - Supabase env vars missing (USE_REMOTE_QR_VALIDATION false)
//       - VITE_USE_REMOTE_QR_VALIDATION not set to 'true'
//       - Network error / fetch threw
//       - Non-200 HTTP status
//       - Body not JSON / shape unrecognized
//     In every null case, the caller is expected to fall back to local
//     `parseQRCode` and proceed exactly as today. Returning null is the
//     "remote unavailable, behave as if this file were never imported"
//     escape hatch.
//   * Returns a typed `QrValidationResult` only when the function
//     responded with `200 + ok:true` AND every required field validated.
//   * Returns a typed `QrValidationFailure` when the function explicitly
//     responded with `200 + ok:false` AND the reason string is one we
//     recognize. This is distinct from null: the server reached us, the
//     code was decisively rejected, and the caller may want to surface
//     a different message ("Code not recognized" vs. "Couldn't reach
//     the server, trying offline mode").
//
// This file is exported but intentionally NOT imported by any page or
// context in v6.6. ScanPage and parseQRCode remain untouched. v6.7 will
// wire this in as enrichment-not-gatekeeping (remote success augments
// the local parse; remote failure never blocks an unlock the local
// parser would have allowed).

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  USE_REMOTE_QR_VALIDATION,
} from './supabaseClient';

// ---- public types -------------------------------------------------------

export type QrValidationSource = 'scan' | 'direct' | 'admin' | 'share';

export type QrValidationFailureReason =
  | 'bad_request'
  | 'unknown_code'
  | 'inactive'
  | 'tale_unavailable'
  | 'method_not_allowed';

export interface QrValidationSuccess {
  ok:         true;
  taleSlug:   string;
  isDemo:     boolean;
  qrCodeId:   string;
  receipt:    string;
  receiptExp: number;
}

export interface QrValidationFailure {
  ok:     false;
  reason: QrValidationFailureReason;
}

export type QrValidationResult = QrValidationSuccess | QrValidationFailure;

// ---- guards -------------------------------------------------------------

const KNOWN_REASONS = new Set<QrValidationFailureReason>([
  'bad_request',
  'unknown_code',
  'inactive',
  'tale_unavailable',
  'method_not_allowed',
]);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseSuccess(body: Record<string, unknown>): QrValidationSuccess | null {
  const taleSlug   = asString(body.taleSlug);
  const qrCodeId   = asString(body.qrCodeId);
  const receipt    = asString(body.receipt);
  const receiptExp = asNumber(body.receiptExp);
  if (!taleSlug || !qrCodeId || !receipt || receiptExp === null) return null;
  return {
    ok:        true,
    taleSlug,
    isDemo:    body.isDemo === true,
    qrCodeId,
    receipt,
    receiptExp,
  };
}

function parseFailure(body: Record<string, unknown>): QrValidationFailure | null {
  const reasonStr = asString(body.reason);
  if (!reasonStr) return null;
  if (!KNOWN_REASONS.has(reasonStr as QrValidationFailureReason)) return null;
  return { ok: false, reason: reasonStr as QrValidationFailureReason };
}

// ---- request ------------------------------------------------------------

/**
 * Call the validate-qr Edge Function for the supplied code.
 *
 * Returns null when the remote path is off, unreachable, or replies
 * with anything we can't parse. Returns a typed result only when the
 * server gave us a clean 200 + ok:true (or 200 + ok:false with a
 * recognized reason).
 */
export async function validateQrRemote(
  code: string,
  guestId?: string | null,
  source?: QrValidationSource,
): Promise<QrValidationResult | null> {
  // Flag / config gate. Without this, the helper is a no-op even if a
  // future caller forgets to check the flag itself.
  if (!USE_REMOTE_QR_VALIDATION) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (typeof code !== 'string' || !code.trim()) return null;

  const body: Record<string, unknown> = { code: code.trim() };
  if (guestId && typeof guestId === 'string' && guestId.trim()) {
    body.guestId = guestId.trim();
  }
  if (source) body.source = source;

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
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn('[trackside] validate-qr unavailable — falling back to local parse', err);
    return null;
  }

  if (!res.ok) {
    // 4xx/5xx — caller falls back to local parse. We deliberately do
    // not pass these through as failures; "couldn't reach the server"
    // and "server said no" are different signals to the UI.
    return null;
  }

  let parsed: unknown;
  try {
    const text = await res.text();
    parsed = text ? JSON.parse(text) : null;
  } catch (err) {
    console.warn('[trackside] validate-qr response not JSON', err);
    return null;
  }
  if (!isObj(parsed)) return null;

  if (parsed.ok === true) return parseSuccess(parsed);
  if (parsed.ok === false) return parseFailure(parsed);
  return null;
}
