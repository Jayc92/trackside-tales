import React, { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react';
import { AppState, PageId, Tale, Beer, FoodItem, LS_GAME_RESULTS_BEST, LS_GAME_MASTERY, LS_COLLECTIBLES, LS_GAME_EVENTS, LS_ARCADE_PROGRESSION, LS_ARCADE_QUESTS } from './types';
import { loadState, saveState, getOrCreateGuestId } from '../services/guestPersistence';
// GAME.18C2 — ghost-child validation at the PB persistence boundary
// (the ONLY authority location that may inspect result traces).
import { GhostTrace, isValidGhostTrace } from '../games/ghostTrace';
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
import {
  GameEventDefinition,
  GameEventProgress,
  applyResultToGameEvents,
  getAllGameEvents,
} from '../games/events';
import {
  ArcadeProgression,
  applyXpAwards,
  createEmptyProgression,
  deriveBackfillAwards,
  evaluateXpAwards,
  questCompletionXpAward,
  sanitizeStoredProgression,
} from '../games/progression';
import {
  QuestCompletionRecord,
  QuestStore,
  applyQuestCompletions,
  applyResultToQuests,
  createEmptyQuestStore,
  deriveRetroactiveQuestCompletions,
  sanitizeStoredQuests,
} from '../games/quests';
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

/** GAME.18C2 — whether an embedded/candidate ghost describes EXACTLY
 *  the same run as its parent record: structural validity plus the
 *  identity quadruple (game, scoring version, band, and the exact
 *  duration — the trace envelope and the PB are one run). Used by both
 *  the PB-candidate projection and hydration; a failing child is
 *  always dropped alone, never the parent. */
function ghostMatchesParent(
  ghost: unknown,
  parent: { gameId: string; scoringVersion: number; difficultyBand: number; durationMs: number },
): ghost is GhostTrace {
  return (
    isValidGhostTrace(ghost) &&
    ghost.gameId === parent.gameId &&
    ghost.scoringVersion === parent.scoringVersion &&
    ghost.difficultyBand === parent.difficultyBand &&
    ghost.durationMs === parent.durationMs
  );
}

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
    // GAME.18C2 — attach the run's personal ghost ONLY when the
    // transient trace is valid and identity-exact for this result; a
    // malformed/mismatched trace is silently omitted and can never
    // affect the candidate PB itself. Whether this candidate (and its
    // ghost) replaces the incumbent stays entirely with isBetterResult.
    ...(result.trace !== undefined && ghostMatchesParent(result.trace, result)
      ? { ghost: result.trace }
      : {}),
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
 *  individually so one bad entry never poisons the others.
 *  GAME.18C2 — ghost child validation is SUBORDINATE: a summary whose
 *  parent fields are valid always survives; an absent ghost is valid
 *  (every legacy record), a valid identity-exact ghost is retained,
 *  and an invalid/mismatched ghost is STRIPPED alone — an invalid
 *  subordinate ghost must never destroy a valid PB. */
export function sanitizeStoredBestResults(raw: unknown): Record<string, GameResultSummary> {
  const out: Record<string, GameResultSummary> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [gameId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidStoredSummary(gameId, value)) continue;
    const withGhost = value as GameResultSummary & { ghost?: unknown };
    if (withGhost.ghost === undefined || ghostMatchesParent(withGhost.ghost, withGhost)) {
      out[gameId] = value;
    } else {
      const { ghost: _invalidGhost, ...parent } = withGhost;
      out[gameId] = parent as GameResultSummary;
    }
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
  // GAME.9E — platform-wide provenance kinds (compact payloads).
  if (s.kind === 'platform-completion') return true;
  if (s.kind === 'platform-mastery') return s.minimumTier === 'gold';
  if (s.kind === 'platform-engineer') return true;
  // GAME.11 — event provenance validates STRUCTURALLY only: eventId is
  // historical provenance and is deliberately NOT checked against the
  // live event registry, so earned ownership survives a future event
  // de-registration/rollback (durability, like every other artifact).
  if (s.kind === 'event-completion') {
    return (
      typeof s.eventId === 'string' && s.eventId.length > 0 &&
      typeof s.eventVersion === 'number' &&
      Number.isInteger(s.eventVersion) && s.eventVersion >= 1
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

// ================== GAME.10A — event participation helpers ==================

/** Validate one stored event-progress child from untrusted storage.
 *
 *  VERSION-SENSITIVE (GAME.10A §15, the deliberate difference from
 *  durable collectible ownership): a record whose eventVersion is not
 *  the CURRENT definition's version is ignored — event rules may
 *  change materially between runs. Only the child is skipped; nothing
 *  is deleted globally. Unknown EventIds (including every id while
 *  the production registry is empty) fail closed. Hydration only
 *  ACCEPTS records — participation credit only ever originates from a
 *  real result event in the reducer. */
function isValidStoredEventProgress(
  eventId: string,
  raw: unknown,
  definitions: readonly GameEventDefinition[],
): raw is GameEventProgress {
  const def = definitions.find((d) => d.eventId === eventId);
  if (!def) return false;                                     // unknown EventId
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (r.eventId !== eventId) return false;
  if (r.eventVersion !== def.version) return false;           // stale/future version
  if (r.firstPlayedAt !== undefined && typeof r.firstPlayedAt !== 'string') return false;
  if (!Array.isArray(r.completedGameIds)) return false;
  const ids = r.completedGameIds;
  if (!ids.every((g) => typeof g === 'string' && def.gameIds.includes(g as GameId))) return false;
  if (new Set(ids).size !== ids.length) return false;         // duplicates
  if (r.completedAt !== undefined) {
    if (typeof r.completedAt !== 'string') return false;
    // completedAt is only truthful when every required game is credited
    if (!def.gameIds.every((g) => ids.includes(g))) return false;
  }
  return true;
}

/** Sanitize the whole stored record; malformed children are dropped
 *  individually. `definitions` is injectable for tests and defaults to
 *  the production registry (currently empty ⇒ everything is ignored,
 *  which is correct: no events exist). */
export function sanitizeStoredGameEvents(
  raw: unknown,
  definitions: readonly GameEventDefinition[] = getAllGameEvents(),
): Record<string, GameEventProgress> {
  const out: Record<string, GameEventProgress> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [eventId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidStoredEventProgress(eventId, value, definitions)) out[eventId] = value;
  }
  return out;
}

/** Hydrate tb_game_events — same fail-safe posture as the others. */
function loadGameEvents(): Record<string, GameEventProgress> {
  try {
    const raw = localStorage.getItem(LS_GAME_EVENTS);
    if (!raw) return {};
    return sanitizeStoredGameEvents(JSON.parse(raw));
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

// ================== GAME.12 — XP progression hydration ==================

/** Hydrate tb_arcade_progression, or run the APPROVED one-time
 *  backfill (G12B §§25–31) when no versioned store exists yet.
 *
 *  The backfill is NOT hydration issuance of an accomplishment
 *  artifact: it is the one-time initialization of a newly introduced
 *  DERIVED ledger over durable truths that already exist (and mastery
 *  upgrades are monotone/unrepeatable, so replay reconciliation could
 *  never recover them). The version marker makes it run at most once:
 *  every later boot — including the post-RESET empty-but-versioned
 *  store — hydrates without issuing anything. A store that fails to
 *  parse loses its marker and is deterministically re-derived from the
 *  same durable truths (identity-keyed, so nothing can double). */
/** GAME.13 — hydrate tb_arcade_quests, or run the one-time retroactive
 *  initializer when no versioned store exists. Reports which
 *  completions were NEWLY derived this boot so the composition step can
 *  merge exactly their XP into an already-valid progression store
 *  (CASE B) — a valid quest store always reports none. */
function loadQuests(durable: {
  gameBadges: ReadonlySet<string>;
  gameMastery: Record<string, GameMasteryRecord>;
}): { store: QuestStore; newlyBackfilled: QuestCompletionRecord[] } {
  try {
    const raw = localStorage.getItem(LS_ARCADE_QUESTS);
    if (raw) {
      const stored = sanitizeStoredQuests(JSON.parse(raw));
      if (stored) return { store: stored, newlyBackfilled: [] };
    }
  } catch (_) { /* fall through to one-time derivation */ }
  const derived = deriveRetroactiveQuestCompletions({
    gameBadges: durable.gameBadges,
    gameMastery: durable.gameMastery,
    backfillTimestamp: new Date().toISOString(),
  });
  return {
    store: applyQuestCompletions(createEmptyQuestStore(), derived),
    newlyBackfilled: derived,
  };
}

/** Hydrate tb_arcade_progression, or run the APPROVED one-time
 *  backfill (G12B §§25–31) when no versioned store exists yet.
 *
 *  The backfill is NOT hydration issuance of an accomplishment
 *  artifact: it is the one-time initialization of a newly introduced
 *  DERIVED ledger over durable truths that already exist (and mastery
 *  upgrades are monotone/unrepeatable, so replay reconciliation could
 *  never recover them). The version marker makes it run at most once:
 *  every later boot — including the post-RESET empty-but-versioned
 *  store — hydrates without issuing anything. A store that fails to
 *  parse loses its marker and is deterministically re-derived from the
 *  same durable truths (identity-keyed, so nothing can double).
 *
 *  GAME.13 §24 — CROSS-STORE RECOVERY: the initialization path also
 *  reconstructs quest-completion XP from valid durable
 *  QuestCompletionRecords (their frozen xpReward), so a lost/corrupt
 *  progression store never permanently orphans earned quest XP. The
 *  valid-store path NEVER synthesizes quest XP (`initialized` tells
 *  the composition step which path ran). */
function loadProgression(durable: {
  gameBadges: ReadonlySet<string>;
  gameMastery: Record<string, GameMasteryRecord>;
  gameEvents: Record<string, GameEventProgress>;
  questCompletions: Record<string, QuestCompletionRecord>;
}): { progression: ArcadeProgression; initialized: boolean } {
  try {
    const raw = localStorage.getItem(LS_ARCADE_PROGRESSION);
    if (raw) {
      const stored = sanitizeStoredProgression(JSON.parse(raw));
      if (stored) return { progression: stored, initialized: false };
    }
  } catch (_) { /* fall through to one-time derivation */ }
  return {
    progression: applyXpAwards(
      createEmptyProgression(),
      deriveBackfillAwards({
        gameBadges: durable.gameBadges,
        gameMastery: durable.gameMastery,
        gameEvents: durable.gameEvents,
        questCompletions: durable.questCompletions,
        backfillTimestamp: new Date().toISOString(),
      }),
    ),
    initialized: true,
  };
}

// ================== STATE ==================

// GAME.12/13 — the persisted families hydrate FIRST so the one-time
// initializers can read the same durable truths this boot will use.
// Deterministic order (G13B §27): truths → quest store (initializing
// retroactive completions if needed) → progression store (initializing
// with GAME.12 truths + quest completions if needed) → CASE B merge:
// a VALID progression store gains exactly the NEWLY backfilled quest
// completions' XP, once, identity-keyed. No other path issues at boot.
const hydratedMastery = loadMastery();
const hydratedGameEvents = loadGameEvents();
const hydratedLegacy = loadState();
const questBoot = loadQuests({
  gameBadges: hydratedLegacy.gameBadges,
  gameMastery: hydratedMastery,
});
const progressionBoot = loadProgression({
  gameBadges: hydratedLegacy.gameBadges,
  gameMastery: hydratedMastery,
  gameEvents: hydratedGameEvents,
  questCompletions: questBoot.store.completions,
});
const initialProgression =
  !progressionBoot.initialized && questBoot.newlyBackfilled.length > 0
    ? applyXpAwards(
        progressionBoot.progression,
        questBoot.newlyBackfilled.map(questCompletionXpAward),
      )
    : progressionBoot.progression;

const initialState: AppState = {
  page: 'home',
  currentTale: null,
  currentGame: null,
  lastEarnedGame: null,
  lastUnlocked: null,
  gameResultsBest: loadBestResults(),
  gameMastery: hydratedMastery,
  collectibles: loadCollectibles(),
  gameEvents: hydratedGameEvents,
  progression: initialProgression,
  quests: questBoot.store,
  ...hydratedLegacy,
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
      // earned mastery; GAME.9A — collectible ownership; GAME.10A —
      // event participation; GAME.12 — the XP ledger: reset restores a
      // clean local Trackside experience. The progression store keeps
      // its version MARKER (empty awards) so the one-time backfill can
      // never resurrect cleared progression. No other reset semantics
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
        gameEvents: {},
        progression: createEmptyProgression(),
        // GAME.13 — the quest store keeps its version MARKER (empty
        // completions) so the retroactive initializer can never
        // resurrect what reset just cleared.
        quests: createEmptyQuestStore(),
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

      // 3 — event participation (GAME.10A; computed BEFORE collectibles
      // since GAME.11): the same result seam additively folds the
      // result into any ACTIVE registered events (window evaluated at
      // result.completedAt). Moving the fold above collectible
      // evaluation lets the evaluator read POST-RESULT event truth, so
      // the terminal win that completes an event grants its completion
      // artifact in this same reducer transaction. Non-qualifying
      // results keep the same reference (no-op).
      const nextGameEvents = applyResultToGameEvents({
        result: action.result,
        eventDefinitions: getAllGameEvents(),
        currentProgress: state.gameEvents,
      });

      // 4 — collectibles (GAME.9A/9E/11): evaluated against POST-RESULT
      // truth. The mastery map below already carries this result's
      // upgrade; the badge set (state.gameBadges) is already
      // post-result because the production win path dispatches
      // AWARD_GAME_BADGE before RECORD_GAME_RESULT within the same
      // event batch, and React reduces queued actions in order — so
      // the final missing badge/mastery CAN complete a cross-game
      // artifact on this very run; and resultingGameEvents is the
      // post-fold map above, so the run that completes an event — or a
      // valid in-window target win on a legacy already-complete
      // profile — CAN earn the event-completion artifact. Grants only
      // ever originate here, from a real won result event — never from
      // hydration.
      const nextGameMastery =
        masteryUpgraded && earnedTier !== null
          ? { ...state.gameMastery, [gameId]: createMasteryRecord(definition, earnedTier) }
          : state.gameMastery;
      const resultingMasteryTier =
        masteryUpgraded && earnedTier !== null
          ? earnedTier
          : existingMastery?.tier ?? null;
      const grants = evaluateCollectibleGrants({
        result: action.result,
        resultingMasteryTier,
        resultingGameBadges: state.gameBadges,
        resultingGameMastery: nextGameMastery,
        ownedCollectibles: state.collectibles,
        resultingGameEvents: nextGameEvents,
      });

      // 5 — quests (GAME.13): the SAME single result seam folds the
      // result into the completion ledger. Completion requires an
      // AVAILABLE quest, every objective satisfied by RESULTING truth,
      // AND a real objective transition caused by this result (§16 —
      // stored already-satisfied state never completes opportunistically
      // at runtime; that repair belongs to the one-time initializer).
      const nextQuestCompletions = applyResultToQuests({
        result: action.result,
        previousGameMastery: state.gameMastery,
        resultingGameMastery: nextGameMastery,
        resultingGameBadges: state.gameBadges,
        currentCompletions: state.quests.completions,
      });
      const nextQuests =
        nextQuestCompletions === state.quests.completions
          ? state.quests
          : { questsVersion: state.quests.questsVersion, completions: nextQuestCompletions };

      // 6 — XP awards (GAME.12/13): the single evaluator reads every
      // resulting truth computed above (post-badge completion,
      // post-upgrade mastery, pre/post event fold, pre/post quest
      // fold). Every award is once-per-identity; replays and derived
      // artifacts (collectibles, PBs) earn nothing. Awards only ever
      // originate here or in the one-time versioned initializers —
      // never from effects, pages, or ordinary hydration.
      const xpAwards = evaluateXpAwards({
        result: action.result,
        resultingGameBadges: state.gameBadges,
        resultingGameMastery: nextGameMastery,
        previousGameEvents: state.gameEvents,
        resultingGameEvents: nextGameEvents,
        previousQuestCompletions: state.quests.completions,
        resultingQuestCompletions: nextQuestCompletions,
        ownedAwards: state.progression.awards,
      });

      if (
        !pbImproved && !masteryUpgraded && grants.length === 0 &&
        nextGameEvents === state.gameEvents && nextQuests === state.quests &&
        xpAwards.length === 0
      ) return state;
      return {
        ...state,
        gameResultsBest: pbImproved
          ? { ...state.gameResultsBest, [gameId]: candidate }
          : state.gameResultsBest,
        gameMastery: nextGameMastery,
        // One shared acquiredAt per result event (a multi-grant run
        // carries the same timestamp); applyCollectibleGrants returns
        // the same reference when nothing is new.
        collectibles: applyCollectibleGrants(
          state.collectibles, grants, action.result, new Date().toISOString(),
        ),
        gameEvents: nextGameEvents,
        quests: nextQuests,
        // applyXpAwards returns the same reference when nothing is new.
        progression: applyXpAwards(state.progression, xpAwards),
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

  // GAME.10A — persist event participation on the same narrow pattern.
  // The empty production registry keeps this a boot-write-only key
  // (every result is a same-reference no-op until an event exists).
  useEffect(() => {
    try {
      localStorage.setItem(LS_GAME_EVENTS, JSON.stringify(state.gameEvents));
    } catch (_) { /* storage full or blocked */ }
  }, [state.gameEvents]);

  // GAME.12 — persist the XP ledger on the same narrow pattern.
  // Reference-gated: no-award results keep the store identity, and the
  // boot write is what durably records the one-time backfill marker.
  useEffect(() => {
    try {
      localStorage.setItem(LS_ARCADE_PROGRESSION, JSON.stringify(state.progression));
    } catch (_) { /* storage full or blocked */ }
  }, [state.progression]);

  // GAME.13 — persist the quest completion ledger on the same narrow
  // pattern. Reference-gated: no-completion results keep the store
  // identity, and the boot write durably records the initializer marker.
  useEffect(() => {
    try {
      localStorage.setItem(LS_ARCADE_QUESTS, JSON.stringify(state.quests));
    } catch (_) { /* storage full or blocked */ }
  }, [state.quests]);

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
