// ================== TRACKSIDE ARCADE — RESULT PIPELINE ==================
// PUBLIC-v7.4B.GAME.3 — session factory + pure result sealing.
//
// This module is the narrow boundary between raw runtime outcomes and
// the authoritative GameResult record (GAME.2 contract). It knows
// NOTHING about badges, app state, storage, analytics, or UI — sealing
// is a pure computation, and nothing here persists anything. In GAME.3
// results are OBSERVATIONAL ONLY: GameOverlay seals one per terminal
// attempt and surfaces it through an optional callback; no caller
// stores it yet.

import {
  DifficultyBand,
  GameId,
  GameOutcome,
  GameResult,
  GameSession,
  ScoringSpec,
  clampScore,
} from './registry';

/** GAME.3 fixed difficulty. GAME.10 (dynamic difficulty, G4) may later
 *  supply a computed band per session — sealing is already
 *  parameterized on it, so nothing else changes when that lands. */
export const DEFAULT_DIFFICULTY_BAND: DifficultyBand = 1;

/** Unique-enough local session id. No backend dependency, no PII.
 *  crypto.randomUUID when available; otherwise a safe local fallback. */
function newSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) { /* fall through */ }
  return (
    'gs_' +
    Math.random().toString(36).slice(2, 10) +
    '_' +
    Date.now().toString(36)
  );
}

/**
 * Create a GameSession for one overlay launch. Sessions are in-memory
 * only (never persisted). `attempt` is the session's INITIAL attempt
 * number; per-result attempt counts are supplied at sealing time.
 */
export function createGameSession(
  gameId: GameId,
  taleId?: string,
  attempt: number = 1,
): GameSession {
  return {
    sessionId: newSessionId(),
    gameId,
    ...(taleId !== undefined ? { taleId } : {}),
    startedAt: new Date().toISOString(),
    attempt,
  };
}

export interface SealGameResultArgs {
  session: GameSession;
  outcome: GameOutcome;
  scoring: ScoringSpec;
  difficultyBand: DifficultyBand;
  /** Elapsed ms for the COMPLETED attempt, as measured by the caller's
   *  existing timing boundary (GameOverlay's per-attempt clock: BEGIN or
   *  retry → terminal outcome; success-screen time excluded). */
  durationMs: number;
  /** 1-based attempt count within the current overlay session (matches
   *  GameOverlay's attemptsRef: starts at 1, +1 per retry, resets when
   *  the overlay is reopened). NOT a lifetime attempt count. */
  attempt: number;
  /** Injectable for deterministic tests; defaults to now. */
  completedAt?: string;
}

/**
 * Seal an authoritative GameResult from a raw outcome. PURE: no
 * mutation of inputs, no side effects, no persistence, no analytics.
 * The score comes ONLY from the supplied ScoringSpec, clamped onto the
 * canonical 0..10000 scale; metrics are copied (never referenced) from
 * the outcome.
 */
export function sealGameResult(args: SealGameResultArgs): GameResult {
  const {
    session, outcome, scoring, difficultyBand, durationMs, attempt,
  } = args;
  return {
    resultVersion: 1,
    sessionId: session.sessionId,
    gameId: session.gameId,
    ...(session.taleId !== undefined ? { taleId: session.taleId } : {}),
    completedAt: args.completedAt ?? new Date().toISOString(),
    attempt,
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : 0,
    won: outcome.won,
    score: clampScore(scoring.score(outcome, difficultyBand)),
    difficultyBand,
    metrics: { ...outcome.metrics },
  };
}
