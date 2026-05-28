// ================== QR RECEIPT STORE (ADMIN-v6.7) ==================
// In-memory holder for the most recent successful remote QR validation
// receipt. Used purely as a hand-off point between ScanPage's
// fire-and-forget call to `validateQrRemote` and the future
// `log-events` wiring in ADMIN-v6.8.
//
// Hard rules:
//   * Memory-only. No localStorage / sessionStorage / IndexedDB /
//     cookies / Supabase / network. Receipts are short-lived (5 min
//     server TTL) and tied to a single unlock attempt — persisting
//     them would make the staleness window worse, not better.
//   * No reactivity, no observers, no React state. Consumers read
//     synchronously when they need the latest receipt; if no scan
//     happened this session, the read returns null.
//   * Single-slot. Each successful validation overwrites the previous.
//     ADMIN-v6.8 will read-and-clear inside log-events; v6.7 is just
//     write-only from the scan flow.
//
// Note: this module deliberately exports plain functions, not a class
// or context. The store has no lifecycle beyond the JS module instance,
// which is fine — refreshing the page wipes it, and that is the
// correct behavior (the receipt's `exp` would also be invalidated).

export interface QrReceipt {
  /** Resolved tale slug from validate-qr (post-redirect). */
  taleSlug:   string;
  /** UUID of the qr_codes row that produced this receipt. */
  qrCodeId:   string;
  /** Compact `<payloadB64>.<sigB64>` token. Opaque to the client. */
  receipt:    string;
  /** Server-asserted expiration (unix seconds). */
  receiptExp: number;
  /** How the scan happened. ScanPage uses 'scan' today. */
  source:     'scan' | 'direct' | 'admin' | 'share';
  /** Client-side capture time (unix ms). Useful for v6.8 staleness checks. */
  capturedAt: number;
}

let latestReceipt: QrReceipt | null = null;

/**
 * Replace the held receipt. Called by ScanPage after a successful
 * remote validation. Always overwrites — the most recent scan wins.
 */
export function setLatestQrReceipt(r: QrReceipt): void {
  latestReceipt = r;
}

/**
 * Read the held receipt, or null if no successful remote validation
 * has occurred since module load. v6.8's `log-events` wiring will use
 * this; v6.7 has no readers in the public app.
 */
export function getLatestQrReceipt(): QrReceipt | null {
  return latestReceipt;
}

/**
 * Discard the held receipt. v6.8's `log-events` will call this
 * after a successful event POST so the same receipt can't be replayed
 * twice from the client side. Exposed now so the API surface is stable.
 */
export function clearLatestQrReceipt(): void {
  latestReceipt = null;
}
