// ================== v4.2 — GUEST IDENTITY & PERSISTENCE ==================
// PUBLIC-v7.4B.P.20: the dead remote-sync helpers
// (upsertGuestProfileRemote / hydrateGuestProgressFromRemote) were
// removed — zero callers since the v6.x experiments, and they wrote
// nothing locally, so no compatibility reader is needed. Guest
// progress is localStorage-only (tb_* keys below); server-side
// analytics remain the separate, deferred log-events pipeline.

import { LS_USER, LS_UNLOCKED, LS_SCAN_BADGES, LS_GAME_BADGES, LS_COLLECTED_DATES } from '../app/types';

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
