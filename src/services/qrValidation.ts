// ================== QR VALIDATION — LOCAL/DEMO PATH (PUBLIC-v7.4B.P.13b) ==================
// Local parsing of the three CURATED demo QR identifiers only.
//
// P.13b posture: production validation is server-authoritative (the
// validate-qr Edge Function — see qrValidationRemote.ts). This module
// survives solely as the bounded local/demo path:
//
//   * It recognizes ONLY the three curated Tale ids baked into the
//     bundle (DEMO_TALE_IDS). Arbitrary slugs are never accepted as
//     local proof of anything.
//   * It is consulted ONLY when LOCAL_DEMO_QR_ALLOWED is true — never
//     as a fallback after a remote validation failure.
//
// LOCAL_DEMO_QR_ALLOWED is true only when remote validation is OFF and
// the build is either a Vite dev build (`import.meta.env.DEV`) or a
// fully offline build with no Supabase configuration at all (a static
// demo). A production build with Supabase configured but the
// VITE_USE_REMOTE_QR_VALIDATION flag unset is treated as AMBIGUOUS
// configuration and satisfies neither mode — scanning fails closed
// rather than silently reverting to demo validation.
//
// Removed in P.13b:
//   * lookupQRCodeRemote — a dormant direct PostgREST read of
//     qr_codes. The P.13b lockdown migration makes qr_codes
//     unreadable to the anon key (raw codes are unlock secrets), so
//     the browser must never query that table again; the Edge
//     Function is the only resolver.

import {
  USE_REMOTE_CONTENT,
  USE_REMOTE_QR_VALIDATION,
} from './supabaseClient';

export interface QRResult {
  taleId: string;
  isDemo: boolean;
  raw: string;
}

// Demo QR identifiers — the three curated Tales baked into the bundle.
// These are intentionally NOT extended for admin-created Tales; those
// unlock only through server-validated QR codes.
const DEMO_TALE_IDS = ['wa-lager', 'packer-pils', 'wooden-match'];

/**
 * Whether the bounded local/demo validation path may run AT ALL.
 * See the header comment for the exact condition. Evaluated at build
 * time from env — it cannot silently flip on in a production build.
 */
export const LOCAL_DEMO_QR_ALLOWED: boolean =
  !USE_REMOTE_QR_VALIDATION && (import.meta.env.DEV || !USE_REMOTE_CONTENT);

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
