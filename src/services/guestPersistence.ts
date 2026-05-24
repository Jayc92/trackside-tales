// ================== v4.2 — GUEST IDENTITY & PERSISTENCE ==================

import { LS_USER, LS_UNLOCKED, LS_SCAN_BADGES, LS_GAME_BADGES, LS_COLLECTED_DATES } from '../app/types';
import { supabaseFetch, USE_REMOTE_CONTENT } from './supabaseClient';

// ---- Stable guest identity (no login required) ----

export function getOrCreateGuestId(): string {
  const KEY = 'tb_guest_id';
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    const id = 'g_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
    localStorage.setItem(KEY, id);
    return id;
  } catch (_) {
    return 'g_' + Math.random().toString(36).slice(2, 11);
  }
}

// ---- Persist state to localStorage ----

export interface PersistableState {
  user: { name: string; email?: string } | null;
  unlocked: Set<string>;
  scanBadges: Set<string>;
  gameBadges: Set<string>;
  collectedDates: Record<string, string>;
}

export function saveState(state: PersistableState): void {
  try {
    localStorage.setItem(LS_USER,            JSON.stringify(state.user));
    localStorage.setItem(LS_UNLOCKED,        JSON.stringify([...state.unlocked]));
    localStorage.setItem(LS_SCAN_BADGES,     JSON.stringify([...state.scanBadges]));
    localStorage.setItem(LS_GAME_BADGES,     JSON.stringify([...state.gameBadges]));
    localStorage.setItem(LS_COLLECTED_DATES, JSON.stringify(state.collectedDates));
  } catch (_) { /* storage full or blocked */ }
}

export function loadState(): PersistableState {
  try {
    return {
      user:           JSON.parse(localStorage.getItem(LS_USER)            || 'null'),
      unlocked:       new Set<string>(JSON.parse(localStorage.getItem(LS_UNLOCKED)        || '[]')),
      scanBadges:     new Set<string>(JSON.parse(localStorage.getItem(LS_SCAN_BADGES)     || '[]')),
      gameBadges:     new Set<string>(JSON.parse(localStorage.getItem(LS_GAME_BADGES)     || '[]')),
      collectedDates: JSON.parse(localStorage.getItem(LS_COLLECTED_DATES) || '{}'),
    };
  } catch (_) {
    return {
      user: null,
      unlocked: new Set(),
      scanBadges: new Set(),
      gameBadges: new Set(),
      collectedDates: {},
    };
  }
}

// ---- Remote sync helpers ----

export async function upsertGuestProfileRemote(
  guestId: string,
  user: { name: string } | null
): Promise<void> {
  if (!USE_REMOTE_CONTENT || !guestId) return;
  try {
    await supabaseFetch('guest_profiles', '', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Prefer:          'resolution=merge-duplicates',
        'Return-Type':   'minimal',
      },
      body: JSON.stringify({
        guest_id:    guestId,
        display_name: user?.name || null,
        last_seen_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn('[trackside] Guest profile upsert skipped:', e);
  }
}

export async function hydrateGuestProgressFromRemote(
  guestId: string,
  onProgress: (unlocked: string[], scanBadges: string[], gameBadges: string[]) => void
): Promise<void> {
  if (!USE_REMOTE_CONTENT || !guestId) return;
  try {
    const rows = await supabaseFetch(
      'user_badges',
      `guest_id=eq.${encodeURIComponent(guestId)}`
    ) as Array<{ badge_type: string; tale_id: string }>;
    if (!Array.isArray(rows)) return;
    const unlocked: string[] = [];
    const scan: string[] = [];
    const game: string[] = [];
    for (const row of rows) {
      if (row.tale_id) unlocked.push(row.tale_id);
      if (row.badge_type === 'scan') scan.push(row.tale_id);
      if (row.badge_type === 'game') game.push(row.tale_id);
    }
    onProgress(unlocked, scan, game);
  } catch (e) {
    console.warn('[trackside] Remote progress hydration skipped:', e);
  }
}
