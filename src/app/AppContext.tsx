import React, { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react';
import { AppState, PageId, Tale, Beer, FoodItem, LS_GAME_RESULTS_BEST, LS_GAME_MASTERY, LS_COLLECTIBLES } from './types';
import { loadState, saveState, getOrCreateGuestId } from '../services/guestPersistence';
import {
  GAME_REGISTRY,
  GameId,
  GameResult,
  GameResultSummary,
} from '../games/registry';
import {
  GameMasteryRecord,
  MASTERY_TIER_RANK,
  createMasteryRecord,
  evaluateMastery,
  isTierUpgrade,
} from '../games/mastery';
import {
  COLLECTIBLE_REGISTRY,
  CollectibleId,
  CollectibleOwnershipRecord,
  createOwnershipRecord,
  evaluateCollectibleGrants,
} from '../games/collectibles';
import { LOCAL_TALES } from '../data/tales';
import { LOCAL_REGULARS, LOCAL_NON_ALC, LOCAL_FOOD } from '../data/menu';
import {
  fetchRemoteTales,
  fetchRemoteRegulars,
  fetchRemoteNonAlc,
  fetchRemoteFood,
  fetchLiveTapSlugs,
} from '../services/contentService';

// ================== GAME.6 — personal-best persistence helpers ==================
// PURE, exported for independent testing. AppContext owns this
// persistence boundary (GameOverlay stays a platform shell; the
// legacy loadState/saveState in guestPersistence is untouched).

/** Project a sealed GameResult onto the compact persisted summary. */
export function toGameResultSummary(result: GameResult): GameResultSummary {
  return {
    resultVersion: 1,
    gameId: result.gameId,
    won: result.won,
    score: result.score,
    // GAME.6B — which formula version produced the score; persisted so
    // hydration can reject bests from retired scoring models.
    scoringVersion: result.scoringVersion,
    difficultyBand: result.difficultyBand,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
  };
}

/** Deterministic best-result comparator (GAME.6 §8). Priority:
 *  win beats loss → higher canonical score → lower durationMs →
 *  otherwise keep the incumbent. Valid unchanged when real per-game
 *  scoring (GAME.6B) replaces the compatibility score. */
export function isBetterResult(
  candidate: GameResultSummary,
  incumbent: GameResultSummary | undefined,
): boolean {
  if (!incumbent) return true;
  if (candidate.won !== incumbent.won) return candidate.won;
  if (candidate.score !== incumbent.score) return candidate.score > incumbent.score;
  if (candidate.durationMs !== incumbent.durationMs) {
    return candidate.durationMs < incumbent.durationMs;
  }
  return false; // full tie — keep the existing best
}

/** Validate one stored summary from untrusted localStorage.
 *
 *  GAME.6B SCORING-VERSION POLICY: a stored best is only valid while
 *  its scoringVersion equals the game's CURRENT ScoringSpec version.
 *  Anything else — including every GAME.6 record, which carried the
 *  placeholder score (won → 5000) and no scoringVersion field — is
 *  discarded whole: a placeholder 5000 must never survive as a "real"
 *  best score, no transitional duration is retained, and no new score
 *  is synthesized from old data. The player simply establishes a fresh
 *  PB on their next win. Badge/completion state is untouched. */
function isValidStoredSummary(gameId: string, raw: unknown): raw is GameResultSummary {
  if (!(gameId in GAME_REGISTRY)) return false;               // unknown GameId
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    r.resultVersion === 1 &&
    r.gameId === gameId &&
    r.scoringVersion === GAME_REGISTRY[gameId as GameId].scoring.scoringVersion &&
    typeof r.won === 'boolean' &&
    typeof r.score === 'number' && Number.isFinite(r.score) &&
    r.score >= 0 && r.score <= 10_000 &&
    typeof r.durationMs === 'number' && Number.isFinite(r.durationMs) && r.durationMs >= 0 &&
    typeof r.difficultyBand === 'number' && Number.isInteger(r.difficultyBand) &&
    r.difficultyBand >= 0 && r.difficultyBand <= 4 &&
    typeof r.completedAt === 'string'
  );
}

/** Sanitize the whole stored record: malformed children are dropped
 *  individually so one bad entry never poisons the others. */
export function sanitizeStoredBestResults(raw: unknown): Record<string, GameResultSummary> {
  const out: Record<string, GameResultSummary> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [gameId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidStoredSummary(gameId, value)) out[gameId] = value;
  }
  return out;
}

/** Hydrate tb_game_results_best. Untrusted input: any parse/shape
 *  failure yields an empty record; the app never crashes on storage. */
function loadBestResults(): Record<string, GameResultSummary> {
  try {
    const raw = localStorage.getItem(LS_GAME_RESULTS_BEST);
    if (!raw) return {};
    return sanitizeStoredBestResults(JSON.parse(raw));
  } catch (_) {
    return {};
  }
}

// ================== GAME.7 — mastery persistence helpers ==================

/** Validate one stored mastery record from untrusted localStorage.
 *
 *  GRANDFATHERING POLICY (GAME.7 §12) — the deliberate difference from
 *  PB validation: mastery is a durable ACHIEVEMENT. A record earned
 *  under an OLDER masteryVersion/scoringVersion is kept (a future
 *  tuning pass must never silently take away an earned tier; a later
 *  result may raise it, never lower it). Records claiming an
 *  unsupported FUTURE version fail closed and are ignored. */
function isValidStoredMasteryRecord(gameId: string, raw: unknown): raw is GameMasteryRecord {
  if (!(gameId in GAME_REGISTRY)) return false;               // unknown GameId
  if (typeof raw !== 'object' || raw === null) return false;
  const definition = GAME_REGISTRY[gameId as GameId];
  const r = raw as Record<string, unknown>;
  return (
    r.gameId === gameId &&
    typeof r.tier === 'string' && r.tier in MASTERY_TIER_RANK &&
    typeof r.masteryVersion === 'number' &&
    Number.isInteger(r.masteryVersion) && r.masteryVersion >= 1 &&
    r.masteryVersion <= definition.mastery.masteryVersion &&
    typeof r.scoringVersion === 'number' &&
    Number.isInteger(r.scoringVersion) && r.scoringVersion >= 1 &&
    r.scoringVersion <= definition.scoring.scoringVersion &&
    typeof r.achievedAt === 'string'
  );
}

/** Sanitize the whole stored mastery record; malformed children are
 *  dropped individually (same isolation posture as the PB store). */
export function sanitizeStoredMastery(raw: unknown): Record<string, GameMasteryRecord> {
  const out: Record<string, GameMasteryRecord> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [gameId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidStoredMasteryRecord(gameId, value)) out[gameId] = value;
  }
  return out;
}

/** Hydrate tb_game_mastery — same fail-safe posture as loadBestResults. */
function loadMastery(): Record<string, GameMasteryRecord> {
  try {
    const raw = localStorage.getItem(LS_GAME_MASTERY);
    if (!raw) return {};
    return sanitizeStoredMastery(JSON.parse(raw));
  } catch (_) {
    return {};
  }
}

// ================== GAME.9A — collectible persistence helpers ==================

/** Validate one stored acquisition source (truthful provenance only). */
function isValidAcquisitionSource(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Record<string, unknown>;
  if (s.kind === 'game-completion') {
    return (
      typeof s.gameId === 'string' && s.gameId in GAME_REGISTRY &&
      (s.taleId === undefined || typeof s.taleId === 'string')
    );
  }
  if (s.kind === 'mastery') {
    return (
      typeof s.gameId === 'string' && s.gameId in GAME_REGISTRY &&
      s.tier === 'engineer'
    );
  }
  return false;
}

/** Validate one stored ownership record from untrusted localStorage.
 *  Ownership is DURABLE (like mastery, unlike PBs): definitions may
 *  change copy/rarity later without invalidating earned ownership, so
 *  no version gate exists here — only structural truth. Unknown future
 *  CollectibleIds fail closed and are ignored by this client.
 *  IMPORTANT (§15): hydration only ACCEPTS records — it never grants;
 *  every grant originates from a real result event in the reducer. */
function isValidStoredCollectible(id: string, raw: unknown): raw is CollectibleOwnershipRecord {
  if (!(id in COLLECTIBLE_REGISTRY)) return false;            // unknown CollectibleId
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    r.collectibleId === id &&
    typeof r.acquiredAt === 'string' &&
    isValidAcquisitionSource(r.source)
  );
}

/** Sanitize the whole stored record; malformed children are dropped
 *  individually (same isolation posture as the PB/mastery stores). */
export function sanitizeStoredCollectibles(raw: unknown): Record<string, CollectibleOwnershipRecord> {
  const out: Record<string, CollectibleOwnershipRecord> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidStoredCollectible(id, value)) out[id] = value;
  }
  return out;
}

/** Hydrate tb_collectibles — same fail-safe posture as the others. */
function loadCollectibles(): Record<string, CollectibleOwnershipRecord> {
  try {
    const raw = localStorage.getItem(LS_COLLECTIBLES);
    if (!raw) return {};
    return sanitizeStoredCollectibles(JSON.parse(raw));
  } catch (_) {
    return {};
  }
}

/** GAME.9A §13 — the narrow internal grant helper: fold newly earned
 *  collectibles into the ownership map. PURE (exported for tests).
 *  One shared acquiredAt per result event; owned ids are never
 *  re-granted (duplicate no-op guaranteed upstream by the evaluator,
 *  and defensively re-checked here so acquiredAt/provenance can never
 *  be rewritten). Returns the SAME reference when nothing grants. */
export function applyCollectibleGrants(
  current: Record<string, CollectibleOwnershipRecord>,
  grants: CollectibleId[],
  result: GameResult,
  acquiredAt: string,
): Record<string, CollectibleOwnershipRecord> {
  const fresh = grants.filter((id) => !(id in current));
  if (fresh.length === 0) return current;
  const next = { ...current };
  for (const id of fresh) next[id] = createOwnershipRecord(id, result, acquiredAt);
  return next;
}

// ================== STATE ==================

const initialState: AppState = {
  page: 'home',
  currentTale: null,
  currentGame: null,
  lastEarnedGame: null,
  lastUnlocked: null,
  gameResultsBest: loadBestResults(),
  gameMastery: loadMastery(),
  collectibles: loadCollectibles(),
  ...loadState(),
};

// ================== ACTIONS ==================

type Action =
  | { type: 'NAV'; page: PageId }
  | { type: 'SET_TALE'; tale: Tale | null }
  | { type: 'UNLOCK'; id: string }
  | { type: 'AWARD_SCAN_BADGE'; id: string }
  | { type: 'AWARD_GAME_BADGE'; id: string }
  | { type: 'CLEAR_LAST_EARNED' }
  | { type: 'CLEAR_LAST_UNLOCKED' }
  | { type: 'SET_USER'; user: { name: string; email?: string } | null }
  | { type: 'RECORD_DATE'; id: string }
  | { type: 'RESET_DEMO' }
  | { type: 'RECORD_GAME_RESULT'; result: GameResult };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'NAV':
      return { ...state, page: action.page };

    case 'SET_TALE':
      return { ...state, currentTale: action.tale };

    case 'UNLOCK': {
      const wasUnlocked = state.unlocked.has(action.id);
      const unlocked = new Set(state.unlocked);
      unlocked.add(action.id);
      // UI-v6.5: surface the ceremonial unlock moment exactly once,
      // only on the locked → unlocked transition. Re-visiting an already
      // unlocked Tale must not re-trigger the modal.
      return {
        ...state,
        unlocked,
        lastUnlocked: wasUnlocked ? state.lastUnlocked : action.id,
      };
    }

    case 'AWARD_SCAN_BADGE': {
      const scanBadges = new Set(state.scanBadges);
      scanBadges.add(action.id);
      return { ...state, scanBadges };
    }

    case 'AWARD_GAME_BADGE': {
      const gameBadges = new Set(state.gameBadges);
      // v5.3: only mark as "newly earned" the first time per session —
      // re-entering the overlay on a tale that's already complete must
      // not re-trigger the Passport's celebration treatment. The
      // alreadyEarned guard in GameOverlay should prevent re-award, but
      // this is defense-in-depth.
      const wasFresh = !state.gameBadges.has(action.id);
      gameBadges.add(action.id);
      return {
        ...state,
        gameBadges,
        lastEarnedGame: wasFresh ? action.id : state.lastEarnedGame,
      };
    }

    case 'CLEAR_LAST_EARNED':
      return { ...state, lastEarnedGame: null };

    case 'CLEAR_LAST_UNLOCKED':
      return { ...state, lastUnlocked: null };

    case 'SET_USER':
      return { ...state, user: action.user };

    case 'RECORD_DATE': {
      if (state.collectedDates[action.id]) return state;
      return {
        ...state,
        collectedDates: {
          ...state.collectedDates,
          [action.id]: new Date().toISOString(),
        },
      };
    }

    case 'RESET_DEMO':
      // GAME.6 — the demo reset also clears personal bests; GAME.7 —
      // earned mastery; GAME.9A — collectible ownership: reset restores
      // a clean local Trackside experience. No other reset semantics
      // broadened.
      return {
        ...state,
        unlocked: new Set(),
        scanBadges: new Set(),
        gameBadges: new Set(),
        collectedDates: {},
        lastEarnedGame: null,
        lastUnlocked: null,
        gameResultsBest: {},
        gameMastery: {},
        collectibles: {},
      };

    // GAME.6 — fold a sealed GameResult into the per-GameId personal
    // bests. GAME.7 — the SAME single result seam now also evaluates
    // mastery; PB and mastery update INDEPENDENTLY (a result can
    // improve either, both, or neither). GAME.9A — and collectible
    // grants, derived from result + resulting-mastery truth (a single
    // first-ever Engineer run may validly grant TWO artifacts in one
    // transition). Idempotent: when nothing improves or grants, the
    // SAME state object returns (no re-render, and each persist effect
    // is reference-gated so no storage writes occur). No badge side
    // effects — completion stays a parallel system.
    case 'RECORD_GAME_RESULT': {
      const gameId = action.result.gameId as GameId;
      if (!(gameId in GAME_REGISTRY)) return state;
      const definition = GAME_REGISTRY[gameId];

      // 1 — personal best (GAME.6 semantics, unchanged)
      const candidate = toGameResultSummary(action.result);
      const incumbent = state.gameResultsBest[gameId];
      const pbImproved = isBetterResult(candidate, incumbent);

      // 2 — mastery (GAME.7): monotone — only a strictly higher tier
      // writes; worse replays and losses leave the achievement alone.
      const earnedTier = evaluateMastery(definition, action.result);
      const existingMastery = state.gameMastery[gameId];
      const masteryUpgraded = isTierUpgrade(earnedTier, existingMastery?.tier);

      // 3 — collectibles (GAME.9A): evaluated against the CURRENT
      // mastery truth AFTER this result (the upgraded tier when this
      // run upgraded, else the held tier — so a legacy Engineer who
      // replays with a valid win still earns the artifact). Grants
      // only ever originate here, from a real result event — never
      // from hydration.
      const resultingMasteryTier =
        masteryUpgraded && earnedTier !== null
          ? earnedTier
          : existingMastery?.tier ?? null;
      const grants = evaluateCollectibleGrants({
        result: action.result,
        resultingMasteryTier,
        ownedCollectibles: state.collectibles,
      });

      if (!pbImproved && !masteryUpgraded && grants.length === 0) return state;
      return {
        ...state,
        gameResultsBest: pbImproved
          ? { ...state.gameResultsBest, [gameId]: candidate }
          : state.gameResultsBest,
        gameMastery: masteryUpgraded && earnedTier !== null
          ? { ...state.gameMastery, [gameId]: createMasteryRecord(definition, earnedTier) }
          : state.gameMastery,
        // One shared acquiredAt per result event (a double grant from
        // one run carries the same timestamp); applyCollectibleGrants
        // returns the same reference when nothing is new.
        collectibles: applyCollectibleGrants(
          state.collectibles, grants, action.result, new Date().toISOString(),
        ),
      };
    }

    default:
      return state;
  }
}

// ================== CONTEXT ==================

interface AppContextValue {
  state: AppState;
  guestId: string;
  nav: (page: PageId) => void;
  navToTale: (tale: Tale) => void;
  unlockTale: (id: string) => void;
  awardScanBadge: (id: string) => void;
  awardGameBadge: (id: string) => void;
  clearLastEarned: () => void;
  /** GAME.6 — fold a sealed GameResult into per-GameId personal bests
   *  (persisted). No badge/completion side effects. */
  recordGameResult: (result: GameResult) => void;
  clearLastUnlocked: () => void;
  setUser: (user: { name: string; email?: string } | null) => void;
  recordDate: (id: string) => void;
  resetDemo: () => void;
  // ADMIN-v6.4 + v7.4B.M.5.2.2 — content arrays. Local data is the
  // first-render value; if the matching per-category remote flag is
  // on (USE_REMOTE_TALES / USE_REMOTE_BEERS / USE_REMOTE_FOOD —
  // see supabaseClient.ts) AND the remote fetch succeeds with
  // valid rows, that section's array is replaced after mount.
  // Categories are independent: a deploy can enable Tales while
  // keeping beers and food on local fallback. Failures keep the
  // local arrays. Consumers should treat these as the only source
  // of truth.
  tales: Tale[];
  regulars: Beer[];
  nonAlc: Beer[];
  food: FoodItem[];
  /**
   * PUBLIC-v7.4B.P.18 — beer_slugs with a LIVE tap_list pour right
   * now. Drives the truthful ON TAP badge on beer cards. Empty set
   * when the fetch is off/unavailable, so no badge is ever a stale
   * claim.
   */
  liveTapSlugs: Set<string>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const guestId = getOrCreateGuestId();

  // ADMIN-v6.4 + v7.4B.M.5.2.2 — remote content hydration (fail-safe).
  // First render uses LOCAL_*. After mount, each fetcher independently
  // checks its per-category flag (USE_REMOTE_TALES /
  // USE_REMOTE_BEERS / USE_REMOTE_FOOD) and swaps in remote rows
  // when both the flag is on and the rows validate. Any failure
  // (flag off, no env vars, network error, RLS refusal, malformed
  // JSON, zero valid rows) keeps the local array for that section —
  // there is no path that blanks the app.
  const [tales,    setTales]    = useState<Tale[]>(LOCAL_TALES);
  const [regulars, setRegulars] = useState<Beer[]>(LOCAL_REGULARS);
  const [nonAlc,   setNonAlc]   = useState<Beer[]>(LOCAL_NON_ALC);
  const [food,     setFood]     = useState<FoodItem[]>(LOCAL_FOOD);
  // P.18: empty set until the live tap fetch resolves — no badge is
  // ever shown from stale/static data.
  const [liveTapSlugs, setLiveTapSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // Fire all five in parallel; each one is independent — a
    // failure in one section never affects the others.
    void fetchRemoteTales().then((rows) => {
      if (!cancelled && rows) setTales(rows);
    });
    void fetchRemoteRegulars().then((rows) => {
      if (!cancelled && rows) setRegulars(rows);
    });
    void fetchRemoteNonAlc().then((rows) => {
      if (!cancelled && rows) setNonAlc(rows);
    });
    void fetchRemoteFood().then((rows) => {
      if (!cancelled && rows) setFood(rows);
    });
    void fetchLiveTapSlugs().then((slugs) => {
      if (!cancelled && slugs) setLiveTapSlugs(slugs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist whenever state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  // GAME.6 — persist personal bests on their own narrow boundary.
  // The reducer returns the same record reference when a result does
  // not improve a best, so no redundant writes occur.
  useEffect(() => {
    try {
      localStorage.setItem(LS_GAME_RESULTS_BEST, JSON.stringify(state.gameResultsBest));
    } catch (_) { /* storage full or blocked */ }
  }, [state.gameResultsBest]);

  // GAME.7 — persist mastery achievements on the same narrow pattern.
  // Reference-gated: non-upgrading results keep the record identity.
  useEffect(() => {
    try {
      localStorage.setItem(LS_GAME_MASTERY, JSON.stringify(state.gameMastery));
    } catch (_) { /* storage full or blocked */ }
  }, [state.gameMastery]);

  // GAME.9A — persist collectible ownership on the same narrow pattern.
  // Duplicate grants keep the record identity, so no redundant writes.
  useEffect(() => {
    try {
      localStorage.setItem(LS_COLLECTIBLES, JSON.stringify(state.collectibles));
    } catch (_) { /* storage full or blocked */ }
  }, [state.collectibles]);

  const nav = useCallback((page: PageId) => {
    dispatch({ type: 'NAV', page });
    // Update URL hash for deep-linking.
    // PUBLIC-v7.4B.P.28g.14 — these are the CANONICAL public hashes.
    // Legacy aliases (#/story exact, #/about, #/woodenmatch) are still
    // accepted inbound by hashToPage and canonicalize here via the
    // existing replaceState (no history entry added). The PageIds
    // themselves are unchanged — 'woodenmatch' stays the internal id
    // for the Alburtis Tavern page.
    const hashMap: Partial<Record<PageId, string>> = {
      home:       '#/home',
      menu:       '#/beers',
      tales:      '#/tales',
      scan:       '#/scan',
      passport:   '#/passport',
      ourstory:   '#/ourstory',
      about:      '#/ourstory',
      woodenmatch:'#/alburtis',
      tracks:     '#/tracks',
      arcade:     '#/arcade',
    };
    const hash = hashMap[page] || '#/home';
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }, []);

  const navToTale = useCallback((tale: Tale) => {
    dispatch({ type: 'SET_TALE', tale });
    dispatch({ type: 'NAV', page: 'story' });
    history.replaceState(null, '', `#/story/${tale.id}`);
  }, []);

  const unlockTale = useCallback((id: string) => {
    dispatch({ type: 'UNLOCK', id });
    dispatch({ type: 'RECORD_DATE', id });
  }, []);

  const awardScanBadge    = useCallback((id: string) => dispatch({ type: 'AWARD_SCAN_BADGE', id }),  []);
  const awardGameBadge    = useCallback((id: string) => dispatch({ type: 'AWARD_GAME_BADGE', id }),  []);
  const clearLastEarned   = useCallback(() => dispatch({ type: 'CLEAR_LAST_EARNED' }), []);
  const clearLastUnlocked = useCallback(() => dispatch({ type: 'CLEAR_LAST_UNLOCKED' }), []);
  const setUser           = useCallback((user: { name: string } | null) => dispatch({ type: 'SET_USER', user }), []);
  const recordDate        = useCallback((id: string) => dispatch({ type: 'RECORD_DATE', id }), []);
  const resetDemo         = useCallback(() => dispatch({ type: 'RESET_DEMO' }), []);
  const recordGameResult  = useCallback((result: GameResult) => dispatch({ type: 'RECORD_GAME_RESULT', result }), []);

  return (
    <AppContext.Provider value={{
      state,
      guestId,
      nav,
      navToTale,
      unlockTale,
      awardScanBadge,
      awardGameBadge,
      clearLastEarned,
      clearLastUnlocked,
      setUser,
      recordDate,
      resetDemo,
      recordGameResult,
      tales,
      regulars,
      nonAlc,
      food,
      liveTapSlugs,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
