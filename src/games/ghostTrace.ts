// ================== TRACKSIDE ARCADE — PERSONAL GHOST TRACE ==================
// PUBLIC-v7.4B.GAME.18B — the personal-ghost FOUNDATION: pure trace
// types, the per-game checkpoint-count contract, a draft builder, a
// finalizer, a structural validator, a delta helper, and a
// compatibility helper. This module has NO production importer in
// GAME.18B — no ghost is capturable, persisted, selectable, or visible,
// and the shipped bundle is expected to tree-shake it out entirely.
//
// ── What a personal ghost is (G18A §4) ─────────────────────────────────
// A deterministic, LOCAL, bounded presentation trace of one prior
// successful run — the canonical-PB run — enabling live ahead/behind
// pace comparison against yourself. It is NOT a GameResult, NOT the PB
// (it is subordinate metadata OF it), NOT input recording, NOT
// telemetry, and it carries no authority: score, mastery, events, XP,
// quests, and collectibles never read it, so a tampered trace can only
// mislabel a pace line.
//
// ── The count model (G18B §10 — LOCKED) ────────────────────────────────
// Checkpoints are COMPLETED-PROGRESS COUNTS (1..N), never objective
// identities: Packer enforces a fixed junction order, so count ≡
// semantic order there; Allen and Wooden permit free order, so count is
// the only honest cross-run comparison. A valid complete trace is
// exactly the sequence 1,2,…,N with strictly increasing times.
//
// ── Duration rule (G18B §§14–15 — corrects G18A) ───────────────────────
// Every checkpoint time must be <= trace.durationMs, but the LAST
// checkpoint is NOT required to equal it: the winning semantic
// checkpoint and the GameResult seal can be milliseconds apart. Run
// identity between a trace and its parent PB is preserved later by
// comparing trace.durationMs === parent.durationMs at persistence time.
//
// ── Future authority boundaries (documented, NOT wired here) ───────────
//   persistence  → the canonical ghost will live as an OPTIONAL child
//                  of the PB summary and replace ONLY when the existing
//                  PB comparator replaces the PB (no ghost comparator
//                  exists, deliberately);
//   band         → canonical-PB policy intends STANDARD (band 1) only,
//                  but that is PB AUTHORITY, not trace structure — this
//                  module validates any band 0..4 and never imports
//                  challengePolicy;
//   provenance   → when GAME.17 gameplay seals challenge provenance,
//                  isGhostCompatible MUST additionally require an exact
//                  challengeVersion match (deferred until a live result
//                  actually carries one).

import type { DifficultyBand, GameId } from './registry';

/** Trace schema / checkpoint-semantics version — independent of
 *  resultVersion, scoringVersion, challengeVersion, and event
 *  versions. No stored or sealed consumer exists in GAME.18B. */
export const GHOST_VERSION = 1;

// ── Checkpoint-count contract (G18B §9) ─────────────────────────────────
// The single source of truth for how many semantic progress increments
// one complete run of each game contains (5 placements / 5 junctions /
// 5 rooms — verified against the runtime element tables). Unknown
// GameIds fail closed everywhere; no arbitrary global maximum exists.
const GHOST_CHECKPOINT_COUNTS: Partial<Record<GameId, number>> = Object.freeze({
  'allen-town-grid': 5,
  'packer-rail-line': 5,
  'station-preservation': 5,
});

/** Expected complete-trace checkpoint count for a game, or null for an
 *  unknown/uncontracted GameId (fail closed — never invented). */
export function getExpectedCheckpointCount(gameId: GameId): number | null {
  return GHOST_CHECKPOINT_COUNTS[gameId] ?? null;
}

// ── Types ───────────────────────────────────────────────────────────────
/** One semantic progress increment: the Kth objective completed at
 *  elapsedMs on the overlay's session clock. Deliberately NO objective
 *  id, coordinates, input events, click/keyboard timing, or DOM state. */
export interface GhostCheckpoint {
  readonly count: number;
  readonly elapsedMs: number;
}

/** A transient in-play accumulation (0..N checkpoints). A draft is NOT
 *  a durable ghost — only finalizeGhostTrace can produce one, so an
 *  incomplete object can never masquerade as a complete trace. */
export interface GhostTraceDraft {
  readonly gameId: GameId;
  readonly checkpoints: readonly GhostCheckpoint[];
}

/** A complete, validated, immutable trace of one successful run. */
export interface GhostTrace {
  readonly ghostVersion: number;
  readonly gameId: GameId;
  readonly scoringVersion: number;
  readonly difficultyBand: DifficultyBand;
  readonly durationMs: number;
  readonly checkpoints: readonly GhostCheckpoint[];
}

const freezeCheckpoints = (
  checkpoints: readonly GhostCheckpoint[],
): readonly GhostCheckpoint[] =>
  Object.freeze(checkpoints.map((c) => Object.freeze({ ...c })));

/** An empty transient draft for one game. Frozen; appending returns new
 *  drafts. Unknown games still get a draft object, but every checkpoint
 *  append and the finalizer fail closed for them. */
export function createGhostTraceDraft(gameId: GameId): GhostTraceDraft {
  return Object.freeze({ gameId, checkpoints: Object.freeze([]) });
}

// ── Builder (G18B §§11–13) ──────────────────────────────────────────────
/**
 * Append the next semantic checkpoint to a draft. PURE — the input
 * draft is never mutated. Returns a NEW draft on a valid append, and
 * the SAME reference (no-op) on any rejection:
 *   - completedCount is not exactly checkpoints.length + 1 (duplicates,
 *     skips, and decreases all reject — a valid trace grows 1,2,…,N);
 *   - completedCount exceeds the game's contracted maximum;
 *   - elapsedMs is negative, NaN, infinite, or fractional;
 *   - elapsedMs is not STRICTLY greater than the prior checkpoint's
 *     (a semantic increment must occur later than the previous one);
 *   - the game has no checkpoint contract (unknown → fail closed).
 * Malformed drafts are never "repaired" — they simply stop growing.
 */
export function recordGhostCheckpoint(
  draft: GhostTraceDraft,
  completedCount: number,
  elapsedMs: number,
): GhostTraceDraft {
  const expected = getExpectedCheckpointCount(draft.gameId);
  if (expected === null) return draft;
  if (!Number.isInteger(completedCount)) return draft;
  if (completedCount !== draft.checkpoints.length + 1) return draft;
  if (completedCount > expected) return draft;
  if (!Number.isInteger(elapsedMs) || !Number.isFinite(elapsedMs) || elapsedMs < 0) return draft;
  const previous = draft.checkpoints[draft.checkpoints.length - 1];
  if (previous !== undefined && elapsedMs <= previous.elapsedMs) return draft;
  return Object.freeze({
    gameId: draft.gameId,
    checkpoints: freezeCheckpoints([
      ...draft.checkpoints,
      { count: completedCount, elapsedMs },
    ]),
  });
}

// ── Finalizer (G18B §§17–19) ────────────────────────────────────────────
/**
 * Seal a complete draft into a durable GhostTrace, or null when the run
 * cannot truthfully be represented:
 *   - unknown game / draft not exactly the contracted N checkpoints;
 *   - durationMs not a positive finite integer;
 *   - any checkpoint time > durationMs (the last one MAY be < or ==
 *     durationMs — see the duration rule above);
 *   - difficultyBand not an integer 0..4 (never coerced);
 *   - scoringVersion not a positive integer (never coerced).
 * No result or PB integration exists here.
 */
export function finalizeGhostTrace(args: {
  draft: GhostTraceDraft;
  durationMs: number;
  scoringVersion: number;
  difficultyBand: DifficultyBand;
}): GhostTrace | null {
  const { draft, durationMs, scoringVersion, difficultyBand } = args;
  const expected = getExpectedCheckpointCount(draft.gameId);
  if (expected === null) return null;
  if (draft.checkpoints.length !== expected) return null;
  if (!Number.isInteger(durationMs) || durationMs <= 0) return null;
  if (draft.checkpoints.some((c) => c.elapsedMs > durationMs)) return null;
  if (!Number.isInteger(difficultyBand) || difficultyBand < 0 || difficultyBand > 4) return null;
  if (!Number.isInteger(scoringVersion) || scoringVersion <= 0) return null;
  const trace: GhostTrace = Object.freeze({
    ghostVersion: GHOST_VERSION,
    gameId: draft.gameId,
    scoringVersion,
    difficultyBand,
    durationMs,
    checkpoints: freezeCheckpoints(draft.checkpoints),
  });
  return isValidGhostTrace(trace) ? trace : null;
}

// ── Validator (G18B §16) ────────────────────────────────────────────────
/**
 * Structural validation of an UNTRUSTED value as a complete GhostTrace
 * (written for future reuse by the PB child sanitizer). Checks exact
 * ghostVersion, contracted game + exact checkpoint length, counts
 * exactly 1..N in order, finite non-negative integer strictly
 * increasing times all <= durationMs, positive finite integer duration,
 * integer band 0..4, positive integer scoringVersion. Pure — no
 * storage, registry mutation, React, clock, or PB state.
 */
export function isValidGhostTrace(value: unknown): value is GhostTrace {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  if (t.ghostVersion !== GHOST_VERSION) return false;
  if (typeof t.gameId !== 'string') return false;
  const expected = getExpectedCheckpointCount(t.gameId as GameId);
  if (expected === null) return false;
  if (!Number.isInteger(t.scoringVersion) || (t.scoringVersion as number) <= 0) return false;
  if (
    !Number.isInteger(t.difficultyBand) ||
    (t.difficultyBand as number) < 0 || (t.difficultyBand as number) > 4
  ) return false;
  if (!Number.isInteger(t.durationMs) || (t.durationMs as number) <= 0) return false;
  if (!Array.isArray(t.checkpoints) || t.checkpoints.length !== expected) return false;
  let previousElapsed = -1;
  for (let i = 0; i < t.checkpoints.length; i++) {
    const c = t.checkpoints[i] as Record<string, unknown>;
    if (typeof c !== 'object' || c === null) return false;
    if (c.count !== i + 1) return false;
    if (!Number.isInteger(c.elapsedMs) || (c.elapsedMs as number) < 0) return false;
    if ((c.elapsedMs as number) <= previousElapsed) return false;
    if ((c.elapsedMs as number) > (t.durationMs as number)) return false;
    previousElapsed = c.elapsedMs as number;
  }
  return true;
}

// ── Delta helper (G18B §§20–21) ─────────────────────────────────────────
/**
 * The live pace delta on reaching completedCount at currentElapsedMs:
 *   delta = currentElapsedMs − ghost time at the same count
 *   negative → AHEAD of the best run; 0 → EVEN; positive → BEHIND.
 * Null (no comparison) before checkpoint 1, for an unknown/out-of-range
 * count, for a non-finite current time, or for an invalid ghost.
 * Numeric semantics only — no UI copy exists in GAME.18B.
 */
export function getGhostDeltaMs(
  ghost: GhostTrace,
  completedCount: number,
  currentElapsedMs: number,
): number | null {
  if (!isValidGhostTrace(ghost)) return null;
  if (!Number.isInteger(completedCount) || completedCount < 1) return null;
  if (completedCount > ghost.checkpoints.length) return null;
  if (!Number.isFinite(currentElapsedMs) || currentElapsedMs < 0) return null;
  return currentElapsedMs - ghost.checkpoints[completedCount - 1].elapsedMs;
}

// ── Compatibility helper (G18B §22) ─────────────────────────────────────
/**
 * Whether a stored ghost may drive pace comparison for the CURRENT
 * session: structurally valid, supported ghostVersion, and an exact
 * gameId + scoringVersion + difficultyBand match. FUTURE REQUIREMENT
 * (documented, not wired): when GAME.17 gameplay seals challenge
 * provenance, compatibility must additionally require an exact
 * challengeVersion match — a STANDARD trace must never drive ASSISTED
 * pace. No challengePolicy import exists here by design.
 */
export function isGhostCompatible(args: {
  ghost: GhostTrace;
  gameId: GameId;
  scoringVersion: number;
  difficultyBand: DifficultyBand;
}): boolean {
  const { ghost, gameId, scoringVersion, difficultyBand } = args;
  if (!isValidGhostTrace(ghost)) return false;
  return (
    ghost.ghostVersion === GHOST_VERSION &&
    ghost.gameId === gameId &&
    ghost.scoringVersion === scoringVersion &&
    ghost.difficultyBand === difficultyBand
  );
}
