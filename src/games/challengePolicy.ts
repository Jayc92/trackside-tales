// ================== TRACKSIDE ARCADE — CHALLENGE POLICY ==================
// PUBLIC-v7.4B.GAME.17B — the adaptive-challenge FOUNDATION: pure band
// semantics, per-game challenge-parameter tables, and the authority
// helpers future gates wire in. This module has NO production importer
// in GAME.17B — nothing player-visible changes, no runtime consumes a
// profile, no result seals a non-standard band, and the shipped bundle
// is expected to tree-shake it out entirely until GAME.17C.
//
// ── Band semantics (G17B §1 — LOCKED, history-truthful) ────────────────
// The existing DifficultyBand numeric identity is kept truthful:
//
//   0 = ASSISTED   1 = STANDARD   2 = ADVANCED   3 = EXPERT   4 = RESERVED
//
// Every result ever sealed carries difficultyBand = 1
// (DEFAULT_DIFFICULTY_BAND in resultPipeline), so band 1 IS the shipped
// gameplay — naming it STANDARD makes all history retroactively exact
// with zero migration. Moving STANDARD to any other number would
// falsify every persisted PB. A named regression pins this.
//
// ── Single-source safety rule (G17B §7 — future wiring contract) ───────
// The scoring formulas embed each game's mistake pool and duration, and
// out-of-range metrics fall back to WORST honest values — so a runtime
// playing 120s while scoring assumes 90s would silently zero the time
// term. When a future gate wires a non-standard profile, the RUNTIME
// parameters and the SCORING normalization parameters MUST both come
// from the one ChallengeProfile returned here. Never permit runtime
// duration/pool X while scoring assumes Y.
//
// ── Authority boundaries (G17B §§19–28 — foundation only) ──────────────
//   canonical BEST  → STANDARD only        (isCanonicalPbBand; unwired)
//   mastery         → ASSISTED caps Bronze (masteryCapForBand; unwired)
//   Engineer        → STANDARD remains sufficient; assisted unreachable
//   event credit    → band-independent for approved playable bands
//   XP              → no difficulty source, no multipliers, ever
//   quests          → mastery-derived only; no separate difficulty rule
//   collectibles    → keep their own source authorities
// A same numeric score across bands is NOT claimed to represent equal
// difficulty value — no cross-band normalization, rank, or multiplier
// exists (G17B §37).
//
// ── Deferred provenance (G17B §28) ─────────────────────────────────────
// GameResult gains NO field here. When GAME.17C seals the first
// ASSISTED result, that gate must add challenge provenance (the band is
// already sealed; CHALLENGE_VERSION identifies the parameter contract).

import type { DifficultyBand, GameId } from './registry';
import type { MasteryTier } from './mastery';

// ── Bands ───────────────────────────────────────────────────────────────
export const ASSISTED_BAND: DifficultyBand = 0;
export const STANDARD_BAND: DifficultyBand = 1;
export const ADVANCED_BAND: DifficultyBand = 2;
export const EXPERT_BAND: DifficultyBand = 3;
export const RESERVED_BAND: DifficultyBand = 4;

/** Player-facing band names (semantic metadata only in GAME.17B; no UI
 *  renders these yet). "RUN" is Trackside's word; never EASY/BEGINNER/
 *  CASUAL. ADVANCED/EXPERT are reserved vocabulary — no playable
 *  profile exists for them. RESERVED has no label on purpose. */
export const BAND_LABELS: Partial<Record<DifficultyBand, string>> = {
  [ASSISTED_BAND]: 'ASSISTED RUN',
  [STANDARD_BAND]: 'STANDARD RUN',
  [ADVANCED_BAND]: 'ADVANCED RUN',
  [EXPERT_BAND]: 'EXPERT RUN',
};

/** Parameter-contract version — which table produced a profile. NOT a
 *  scoring/result/event version, and NOT sealed into results in 17B. */
export const CHALLENGE_VERSION = 1;

/** After this many failed attempts in ONE overlay session, the UI MAY
 *  OFFER an assisted run (a future pilot gate wires the offer). Never
 *  auto-switch, never persist, never change the running session. */
export const ASSISTED_OFFER_AFTER_FAILURES = 2;

// ── Profile model ───────────────────────────────────────────────────────
/** One immutable parameter set for one game at one band. Deliberately
 *  ONLY the parameters today's runtimes actually hold as constants —
 *  no score/XP/mastery/event multipliers, no reward data, no UI copy. */
export interface ChallengeProfile {
  readonly gameId: GameId;
  readonly band: DifficultyBand;
  readonly challengeVersion: number;
  readonly durationSec: number;
  readonly mistakePool: number;
  readonly hintBudget: number;
}

// ── The policy table (G17B §§12–14) ─────────────────────────────────────
// STANDARD rows MUST equal the shipped runtime constants byte-for-byte
// (Allen 90/7/2 · Packer 90/7/2 · Wooden 120/4/1 — mechanically pinned
// by the 17B test battery against scoring behavior). ASSISTED rows are
// future policy DATA only: nothing consumes them in 17B. Assistance is
// parameter-only — objective/placement/room counts and content are not
// parameterized and are deliberately untouched.
const profile = (
  gameId: GameId,
  band: DifficultyBand,
  durationSec: number,
  mistakePool: number,
  hintBudget: number,
): ChallengeProfile =>
  Object.freeze({
    gameId, band, challengeVersion: CHALLENGE_VERSION,
    durationSec, mistakePool, hintBudget,
  });

const CHALLENGE_PROFILES: ReadonlyArray<ChallengeProfile> = Object.freeze([
  // allen-town-grid — LAY OUT ALLEN'S TOWN
  profile('allen-town-grid', STANDARD_BAND, 90, 7, 2),
  profile('allen-town-grid', ASSISTED_BAND, 120, 9, 3),
  // packer-rail-line — BUILD THE LEHIGH VALLEY LINE
  profile('packer-rail-line', STANDARD_BAND, 90, 7, 2),
  profile('packer-rail-line', ASSISTED_BAND, 120, 9, 3),
  // station-preservation — STRIKE THE MATCH
  profile('station-preservation', STANDARD_BAND, 120, 4, 1),
  profile('station-preservation', ASSISTED_BAND, 150, 6, 2),
]);

// ── Pure lookups (G17B §§15–16) ─────────────────────────────────────────
/**
 * The profile for one game at one band, or null when that band has no
 * playable profile (ADVANCED/EXPERT are semantic reservations only;
 * RESERVED is never playable; unknown games have no table rows).
 * FAIL CLOSED: an unsupported band is never coerced to STANDARD.
 */
export function getChallengeProfile(
  gameId: GameId,
  band: DifficultyBand,
): ChallengeProfile | null {
  return (
    CHALLENGE_PROFILES.find((p) => p.gameId === gameId && p.band === band) ??
    null
  );
}

/** The canonical STANDARD (band 1) profile for a game — always resolves
 *  for every registered current game; null for games without a table
 *  row (fail closed, never a synthesized default). */
export function getStandardChallengeProfile(
  gameId: GameId,
): ChallengeProfile | null {
  return getChallengeProfile(gameId, STANDARD_BAND);
}

// ── Recommendation (G17B §17 — deliberately conservative) ───────────────
/**
 * The recommended band for a fresh launch. CURRENT v1 policy: STANDARD
 * for everyone — assisted is never auto-recommended before real failure
 * (failure count is session UI state, not persisted-policy input), and
 * ADVANCED/EXPERT do not ship. A future gate may extend this from
 * mastery once harder bands exist; no pretend personalization now.
 */
export function getRecommendedBand(_args: {
  gameId: GameId;
  masteryTier?: MasteryTier;
}): DifficultyBand {
  return STANDARD_BAND;
}

// ── Authority helpers (G17B §§19–20 — NOT wired in this gate) ───────────
/** Whether results at this band may set the canonical BEST. STANDARD
 *  only: assisted runs must never overwrite the canonical PB, and no
 *  harder band earns it under current v1 policy either. */
export function isCanonicalPbBand(band: DifficultyBand): boolean {
  return band === STANDARD_BAND;
}

/** The mastery ceiling policy for a band. 'full' = canonical rules
 *  apply unchanged; 'bronze' = completion tier only (assisted can win,
 *  never buy Silver/Gold/Engineer); 'unsupported' = fail closed — an
 *  unshipped/reserved band grants nothing until a gate defines it. */
export type MasteryCapPolicy = 'bronze' | 'full' | 'unsupported';
export function masteryCapForBand(band: DifficultyBand): MasteryCapPolicy {
  if (band === ASSISTED_BAND) return 'bronze';
  if (band === STANDARD_BAND) return 'full';
  return 'unsupported';
}
