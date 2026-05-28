// ================== EVENT LOGGER (ADMIN-v6.8B) ==================
// Client-side helper for the `log-events` Supabase Edge Function.
//
// This file is the writer counterpart to the receipt-capture work in
// ADMIN-v6.7 and the server-side function added in ADMIN-v6.8A. It is
// pure groundwork — no page or context imports it yet. Wiring into
// ScanPage / GameOverlay arrives in ADMIN-v6.8C/D respectively.
//
// Hard rules (preserved from the v6.8 plan):
//   * Memory-only queue. No localStorage / sessionStorage / IndexedDB
//     / cookies / Supabase tables touched directly. Page refresh wipes
//     unsent events — that's fine, analytics is best-effort.
//   * No throws escape this module. Every public function is safe to
//     call without a try/catch around it.
//   * Best-effort delivery. On network failure, non-200, or any
//     parsing error we drop the in-flight batch and reset. We do NOT
//     retry indefinitely — analytics correctness is not worth blocking
//     the UI thread or hammering the server during outages.
//   * No-op when off. With USE_REMOTE_EVENTS=false the queue is never
//     written to, the timer is never armed, and zero network traffic
//     is generated. Same posture as qrValidationRemote.ts.
//   * No PII / device fingerprint capture. We do not read user_agent,
//     IP, geolocation, URL params, referrer, or any header beyond what
//     fetch sets by default. The server enforces this independently.
//   * Receipt is opaque. The helper accepts an optional `receipt`
//     string on tale_unlocked events but does not parse it; the
//     server verifies HMAC and returns rejectedReasons if invalid.
//     We do a cheap local `receiptExp` sanity check ONLY to avoid
//     sending obviously-stale receipts the server would reject anyway.

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  USE_REMOTE_EVENTS,
} from './supabaseClient';

// ---- public types -------------------------------------------------------

export type EventSource     = 'scan' | 'direct';
export type BadgeVia        = 'scan' | 'game';
export type GameType        = 'grid' | 'spike' | 'match';

/** tale_unlocked — fired once per unlock dispatch in v6.8C. */
export interface TaleUnlockedEvent {
  type:       'tale_unlocked';
  taleSlug:   string;
  source:     EventSource;
  /** Optional compact `<b64>.<b64>` receipt from validate-qr. */
  receipt?:   string;
  /** Optional unix-seconds expiry from the same receipt. Only used to
   *  drop obviously-stale receipts client-side; the server re-checks. */
  receiptExp?: number;
}

/** badge_awarded — fired once per fresh badge grant. */
export interface BadgeAwardedEvent {
  type:     'badge_awarded';
  taleSlug: string;
  /** Raw key the public app holds in state, e.g. "wa-lager" or
   *  "game:wa-lager". The server stores this verbatim. */
  badgeKey: string;
  via:      BadgeVia;
}

/** game_started / game_completed / game_failed — fired by GameOverlay. */
export interface GameLifecycleEvent {
  type:        'game_started' | 'game_completed' | 'game_failed';
  taleSlug:    string;
  gameType:    GameType;
  attempts?:   number;
  durationMs?: number;
}

export type PendingEvent =
  | TaleUnlockedEvent
  | BadgeAwardedEvent
  | GameLifecycleEvent;

// ---- internals ----------------------------------------------------------

const MAX_QUEUE         = 20;
const FLUSH_DEBOUNCE_MS = 250;

/** In-memory queue. Wiped on page reload, never persisted. */
const queue: PendingEvent[] = [];

/** Pending debounce timer handle. null when no flush is armed. */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Coalesces overlapping flushes — only one POST in flight at a time. */
let inFlight: Promise<void> | null = null;

function isEnabled(): boolean {
  // The flag itself already gates SUPABASE_URL / ANON presence, but
  // re-check explicitly so future flag evolution can't bypass them.
  return Boolean(USE_REMOTE_EVENTS && SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Cheap sanity check to drop obviously-stale receipts before send. */
function receiptStillFresh(ev: PendingEvent): boolean {
  if (ev.type !== 'tale_unlocked') return true;
  if (typeof ev.receiptExp !== 'number') return true;
  const nowSec = Math.floor(Date.now() / 1000);
  return ev.receiptExp > nowSec;
}

/** Strip the local-only receiptExp before send; the server only wants
 *  the opaque receipt string and ignores extra fields anyway, but
 *  emitting a clean wire shape keeps audit logs readable. */
function toWirePayload(ev: PendingEvent): Record<string, unknown> {
  if (ev.type === 'tale_unlocked') {
    const wire: Record<string, unknown> = {
      type:     'tale_unlocked',
      taleSlug: ev.taleSlug,
      source:   ev.source,
    };
    if (typeof ev.receipt === 'string' && ev.receipt && receiptStillFresh(ev)) {
      wire.receipt = ev.receipt;
    }
    return wire;
  }
  if (ev.type === 'badge_awarded') {
    return {
      type:     'badge_awarded',
      taleSlug: ev.taleSlug,
      badgeKey: ev.badgeKey,
      via:      ev.via,
    };
  }
  // game_started / game_completed / game_failed
  const wire: Record<string, unknown> = {
    type:     ev.type,
    taleSlug: ev.taleSlug,
    gameType: ev.gameType,
  };
  if (typeof ev.attempts   === 'number' && Number.isFinite(ev.attempts))   wire.attempts   = ev.attempts;
  if (typeof ev.durationMs === 'number' && Number.isFinite(ev.durationMs)) wire.durationMs = ev.durationMs;
  return wire;
}

// ---- public API ---------------------------------------------------------

/**
 * Enqueue an analytics event. Safe to call from anywhere — never
 * throws, never blocks, returns synchronously. With USE_REMOTE_EVENTS
 * off this is a complete no-op.
 *
 * Caller is responsible for supplying its own guestId via flushEvents().
 * Storing guestId here would couple the helper to the AppContext's
 * lifecycle; it's cleaner to pass it explicitly at flush time.
 *
 * Wiring into ScanPage / GameOverlay arrives in ADMIN-v6.8C/D. v6.8B
 * adds the helper only.
 */
export function logEvent(event: PendingEvent): void {
  if (!isEnabled()) return;
  if (!event || typeof event !== 'object') return;

  // Cap the queue. Drop oldest events first — the most recent ones are
  // the most representative of "what just happened."
  if (queue.length >= MAX_QUEUE) {
    queue.splice(0, queue.length - MAX_QUEUE + 1);
  }
  queue.push(event);

  // Lazy debounce — coalesce a scan-unlock + badge-award pair into one
  // POST. The 250ms window is well below human-perceptible delay and
  // covers the synchronous reducer dispatch chain that produces both.
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      // Spawn but don't await — logEvent must stay synchronous.
      void flushEvents();
    }, FLUSH_DEBOUNCE_MS);
  }
}

/**
 * Force a flush of any queued events. Returns immediately when:
 *   - the flag is off (no-op)
 *   - the queue is empty
 *   - a flush is already in flight (we coalesce, never overlap)
 *
 * Failures are swallowed — analytics is best-effort. The promise
 * always resolves; it never rejects.
 *
 * `guestId` is required because the helper is intentionally decoupled
 * from AppContext. v6.8C will wrap this in a thin adapter that pulls
 * the current guestId from the context for ScanPage / GameOverlay
 * callers.
 */
export async function flushEvents(guestId?: string | null): Promise<void> {
  if (!isEnabled()) return;
  if (inFlight) return inFlight;
  if (queue.length === 0) return;

  // Resolve guestId at flush time. If a caller didn't pass one, drop
  // the batch — the server requires guestId and we'd just get a 400.
  const trimmedGuestId =
    typeof guestId === 'string' && guestId.trim() ? guestId.trim() : null;
  if (!trimmedGuestId) return;

  // Snapshot and clear the queue under the assumption that any failure
  // discards the batch. This avoids retry storms during outages and
  // keeps the queue from growing without bound while a hung request
  // is in flight.
  const batch = queue.splice(0, MAX_QUEUE);

  inFlight = (async () => {
    try {
      const body = JSON.stringify({
        guestId: trimmedGuestId,
        events:  batch.map(toWirePayload),
      });
      const res = await fetch(`${SUPABASE_URL}/functions/v1/log-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey:         SUPABASE_ANON_KEY,
          Authorization:  `Bearer ${SUPABASE_ANON_KEY}`,
          Accept:         'application/json',
        },
        body,
      });
      if (!res.ok) {
        // Non-200 from log-events. We deliberately do NOT requeue —
        // a hard server outage would otherwise build an unbounded
        // backlog as the user keeps scanning. Future v6.8E may
        // revisit short-bounded retry; v6.8B drops on failure.
        console.warn('[trackside] log-events non-200, dropping batch', res.status);
        return;
      }
      // Body parsing is purely informational at this point — the rows
      // already either inserted or didn't, and we've discarded the
      // local copy. We swallow JSON errors so a malformed (but 200)
      // response can't bubble.
      try {
        const text = await res.text();
        if (text) JSON.parse(text);
      } catch (_err) {
        // ignore — the write side already committed or failed.
      }
    } catch (err) {
      // Network error / fetch threw. Drop the batch and continue —
      // surfacing this would require app-level error UI we don't
      // want for analytics.
      console.warn('[trackside] log-events unavailable, dropping batch', err);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Discard any queued events without sending. Exposed for tests and
 * for future "user opted out of analytics" reset paths. v6.8B has no
 * production callers.
 */
export function clearEventQueue(): void {
  queue.length = 0;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  // inFlight is intentionally left alone — its `finally` will clear
  // it. Cancelling the underlying fetch would risk leaving the server
  // in a partial-write state that the queue clear can't observe.
}
