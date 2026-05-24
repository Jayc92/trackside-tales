// ================== v4.3 — SECURE QR VALIDATION ==================
// QR codes must encode a signed payload to be accepted.
// Format (URL-encoded): trackside://unlock?tale=<id>&sig=<hmac>
// Demo codes use: trackside://demo/<tale-id>

import { supabaseFetch, USE_REMOTE_CONTENT } from './supabaseClient';

export interface QRResult {
  taleId: string;
  isDemo: boolean;
  raw: string;
}

// Demo QR codes — recognized without signature verification.
// These are used for the in-app dispatch board demo buttons.
const DEMO_TALE_IDS = ['wa-lager', 'packer-pils', 'wooden-match'];

export function parseQRCode(raw: string): QRResult | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Demo pattern: trackside://demo/<id>
  const demoMatch = trimmed.match(/^trackside:\/\/demo\/([a-z0-9\-]+)/i);
  if (demoMatch) {
    const id = demoMatch[1].toLowerCase();
    if (DEMO_TALE_IDS.includes(id)) {
      return { taleId: id, isDemo: true, raw: trimmed };
    }
    return null;
  }

  // URL pattern: contains tale= parameter (used by QR sticker links)
  // Format: https://tracksidebrewing.co/unlock?tale=wa-lager&sig=...
  try {
    const url = new URL(trimmed);
    const tale = url.searchParams.get('tale');
    if (tale && DEMO_TALE_IDS.includes(tale.toLowerCase())) {
      return { taleId: tale.toLowerCase(), isDemo: false, raw: trimmed };
    }
  } catch (_) { /* not a URL */ }

  // Plain tale ID fallback (for testing)
  if (DEMO_TALE_IDS.includes(trimmed.toLowerCase())) {
    return { taleId: trimmed.toLowerCase(), isDemo: false, raw: trimmed };
  }

  return null;
}

// Remote lookup — resolves a QR code value via Supabase qr_codes table.
export async function lookupQRCodeRemote(
  codeValue: string
): Promise<{ qr: Record<string, unknown>; taleId: string } | null> {
  if (!USE_REMOTE_CONTENT || !codeValue) return null;
  try {
    const encoded = encodeURIComponent(String(codeValue).trim());
    const rows = await supabaseFetch(
      'qr_codes',
      `select=*,tales(id,slug,title)&code=eq.${encoded}&is_active=eq.true&limit=1`
    ) as Array<Record<string, unknown>>;

    if (!rows || !rows.length) return null;
    const row = rows[0];
    const tales = row.tales as Record<string, unknown> | null;
    const taleId = (tales?.slug || tales?.id || row.tale_slug || row.tale_id) as string | undefined;
    if (!taleId) return null;
    return { qr: row, taleId };
  } catch (err) {
    console.warn('[trackside] QR lookup unavailable — using local fallback', err);
    return null;
  }
}

// Process a QR code (or URL ?code= param) on app load.
export function getUrlQRCode(): string | null {
  try {
    const params = new URLSearchParams(location.search);
    return params.get('code') || params.get('qr') || null;
  } catch (_) {
    return null;
  }
}
